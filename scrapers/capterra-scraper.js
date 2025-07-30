const cheerio = require("cheerio");
const https = require('https');
const { isReviewInDateRange, delay } = require("../utils/common");
require('dotenv').config();

/**
 * ScrapeOps proxy bypass function for Capterra
 * @param {string} url - Original Capterra URL
 * @param {string} location - Country code (default: "us")
 * @returns {string} Proxied URL that bypasses Capterra's anti-bot measures
 */
function getScrapeOpsUrl(url, location = "us") {
    const API_KEY = process.env.SCRAPEOPS_API_KEY;
    
    if (!API_KEY || API_KEY === 'your_scrapeops_api_key_here') {
        console.warn(`⚠️ ScrapeOps API key not configured. Add SCRAPEOPS_API_KEY to .env file`);
        return url; // Fallback to direct URL (will likely fail)
    }
    
    const params = new URLSearchParams({
        api_key: API_KEY,
        url: url,
        country: location,
        wait: '1000'
    });
    
    const proxyUrl = `https://proxy.scrapeops.io/v1/?${params.toString()}`;
    console.log(`🔄 Routing through ScrapeOps proxy: ${url.substring(0, 80)}...`);
    return proxyUrl;
}

/**
 * Fetches content via HTTPS through ScrapeOps proxy
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML content
 */
function fetchHtml(url) {
    // Route through ScrapeOps proxy for Capterra
    const proxyUrl = getScrapeOpsUrl(url, "us");
    
    return new Promise((resolve, reject) => {
        https.get(proxyUrl, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Parses Capterra HTML content to extract review data
 * @param {string} html - HTML content to parse
 * @returns {Object} Parsed product data
 */
function parsedDataFromHTML_Capterra(html) {
    try {
        // Debug: Check if we got a JSON error response instead of HTML
        if (html.startsWith('{') && html.includes('"status"')) {
            console.error(`❌ ScrapeOps error response: ${html}`);
            return {
                error: `ScrapeOps failed: ${html}`,
                productData: {
                    productName: "",
                    reviewSite: "Capterra",
                    stars: "",
                    totalReviews: "",
                    allReviews: [],
                }
            };
        }
        
        const $ = cheerio.load(html);
        const productData = {
            productName: "",
            reviewSite: "Capterra",
            stars: "",
            totalReviews: "",
            allReviews: [],
        };

        // Try multiple selectors for product name
        const productNameSelectors = [
            "div#productHeader > div.container > div#productHeaderInfo > div.col > h1.mb-1",
            "h1[data-testid='product-name']",
            "h1.product-name",
            "h1",
            "[data-testid='product-header'] h1"
        ];
        
        for (const selector of productNameSelectors) {
            const name = $(selector).text().trim();
            if (name) {
                // Extract just the product name from "Reviews of ProductName"
                const cleanName = name.replace(/^Reviews\s+of\s+/i, '').trim();
                productData.productName = cleanName;
                console.log(`Debug: Found product name with selector: ${selector} = "${cleanName}"`);
                break;
            }
        }

        // Try multiple selectors for stars
        const starsSelectors = [
            ".hbasb1j + div .sr2r3oj", // Main product header rating (e.g., "4.6 (14)")
            "div#productHeader > div.container > div#productHeaderInfo > div.col > div.align-items-center.d-flex > span.star-rating-component > span.d-flex > span.ms-1",
            "[data-testid='overall-rating']",
            ".star-rating span",
            "[data-testid='product-rating']",
            ".sr2r3oj" // Fallback for any rating
        ];
        
        for (const selector of starsSelectors) {
            const starsElement = $(selector).first();
            if (starsElement.length) {
                let stars = starsElement.text().trim();
                // Extract just the rating number (e.g., "4.6" from "4.6 (14)")
                const match = stars.match(/^(\d+\.?\d*)/);
                if (match) {
                    stars = match[1];
                }
                if (stars) {
                    productData.stars = stars;
                    console.log(`Debug: Found stars with selector: ${selector} = "${stars}"`);
                    break;
                }
            }
        }

        // Try multiple possible review selectors
        const reviewSelectors = [
            'div[data-test-id="review-cards-container"] > div.e1xzmg0z.c1ofrhif.typo-10.mb-6',
            'div[data-test-id="review-cards-container"] > div',
            'div.e1xzmg0z.c1ofrhif.typo-10.mb-6',
            '[data-test-id="review-cards-container"]',
            'div.review-card',
            '.review-card'
        ];
        
        let reviewCards = $();
        let usedSelector = '';
        
        for (const selector of reviewSelectors) {
            reviewCards = $(selector);
            if (reviewCards.length > 0) {
                usedSelector = selector;
                break;
            }
        }

        reviewCards.each((_, element) => {
            const reviewerName = $(element)
                .find("span.typo-20.font-semibold")
                .text()
                .trim();
            
            // Enhanced profile title extraction based on actual HTML structure  
            const profileContainer = $(element).find("div.typo-10.text-neutral-90");
            const fullProfileText = profileContainer.text().trim();
            
            console.log(`Debug: Full profile text: "${fullProfileText}"`);
            
            // Extract job title and industry separately by parsing the concatenated text
            let jobTitle = "";
            let industry = "";
            let usageDuration = "";
            
            if (fullProfileText) {
                console.log(`Debug: Full profile text: "${fullProfileText}"`);
                
                // Extract usage duration first (it's more distinct)
                const usageMatch = fullProfileText.match(/Used the software for:\s*([^$]+)/);
                if (usageMatch) {
                    usageDuration = usageMatch[1].trim();
                }
                
                // Remove the usage part to work with the rest
                let remainingText = fullProfileText.replace(/Used the software for:.*$/, '').trim();
                
                // Simplified approach: extract everything between name and industry
                // Pattern: "Name [Job Title] [Industry/Company]"
                
                // Remove common name patterns (Name + Initial like "Miguel Ángel S.")
                let cleanText = remainingText.replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]\.\s*/, '');
                
                // If no name pattern found, try removing "Verified Reviewer"
                if (cleanText === remainingText) {
                    cleanText = remainingText.replace(/^Verified Reviewer\s*/, '');
                }
                
                // Split by common industry keywords to separate job title from industry
                const industryKeywords = [
                    'Computer Software', 'Information Technology', 'Technology and Services', 
                    'Marketing and Advertising', 'Food & Beverages', 'Real Estate',
                    'Mechanical or Industrial Engineering', 'Financial Services', 'Insurance',
                    'Software', 'Technology', 'Services', 'Engineering', 'Estate', 
                    'Beverages', 'Marketing', 'Advertising', 'Financial'
                ];
                
                let foundSplit = false;
                for (const keyword of industryKeywords) {
                    const keywordIndex = cleanText.indexOf(keyword);
                    if (keywordIndex > 0) {
                        jobTitle = cleanText.substring(0, keywordIndex).trim();
                        industry = cleanText.substring(keywordIndex).trim();
                        foundSplit = true;
                        break;
                    }
                }
                
                // If no industry keyword found, assume it's all job title
                if (!foundSplit && cleanText) {
                    jobTitle = cleanText.trim();
                    industry = "";
                }
                
                // Clean up job title - remove trailing company info
                jobTitle = jobTitle.replace(/\s*(Computer|Information|Technology|Marketing|Real|Food|Financial|Mechanical).*$/, '').trim();
            }
            
            console.log(`Debug: Parsed - Job: "${jobTitle}", Industry: "${industry}", Usage: "${usageDuration}"`);
            
            const stars = $(element)
                .find("span.sr2r3oj")
                .first()
                .text()
                .trim();
            
            const reviewDate = $(element)
                .find("div.typo-0.text-neutral-90")
                .text()
                .trim();
            
            // Enhanced review text extraction
            const reviewTextSelectors = [
                "div[class*='mt-'] p",
                ".review-text p",
                "[data-testid='review-content'] p",
                "p:contains('Comment')",
                ".comment-text"
            ];
            
            let reviewText = "";
            for (const selector of reviewTextSelectors) {
                const text = $(element).find(selector).text().trim();
                if (text && !text.includes('Comments:') && !text.includes('Pros:') && !text.includes('Cons:')) {
                    reviewText = text;
                    break;
                }
            }
            
            // Enhanced pros extraction
            const prosSelectors = [
                "span:contains('Pros')",
                "div:contains('Pros')",
                "[data-testid='pros']",
                ".pros-section"
            ];
            
            let pros = "";
            for (const selector of prosSelectors) {
                const prosElement = $(element).find(selector);
                if (prosElement.length) {
                    // Try different ways to get pros content
                    let prosText = prosElement.closest("div").next("p").text().trim();
                    if (!prosText) {
                        prosText = prosElement.parent().next("p").text().trim();
                    }
                    if (!prosText) {
                        prosText = prosElement.siblings("p").text().trim();
                    }
                    if (prosText) {
                        pros = prosText;
                        break;
                    }
                }
            }
            
            // Enhanced cons extraction
            const consSelectors = [
                "span:contains('Cons')",
                "div:contains('Cons')",
                "[data-testid='cons']",
                ".cons-section"
            ];
            
            let cons = "";
            for (const selector of consSelectors) {
                const consElement = $(element).find(selector);
                if (consElement.length) {
                    // Try different ways to get cons content
                    let consText = consElement.closest("div").next("p").text().trim();
                    if (!consText) {
                        consText = consElement.parent().next("p").text().trim();
                    }
                    if (!consText) {
                        consText = consElement.siblings("p").text().trim();
                    }
                    if (consText) {
                        cons = consText;
                        break;
                    }
                }
            }

            // Only add review if we have at least reviewer name or review text
            if (reviewerName || reviewText) {
                productData.allReviews.push({
                    reviewerName,
                    jobTitle,
                    reviewDate,
                    stars,
                    reviewTitle: "", // Capterra doesn't have review titles
                    reviewText
                });
            }
        });

        productData.totalReviews = productData.allReviews.length.toString();
        return { productData };
    } catch (error) {
        return { error };
    }
}

/**
 * Scrapes and filters Capterra reviews
 * @param {Object} api - Crawlbase API instance
 * @param {string} baseUrl - Base URL to scrape
 * @param {string} startDate - Start date for filtering
 * @param {string} endDate - End date for filtering
 * @returns {Object} Scraped and filtered review data
 */
async function scrapeAndFilterReviews_Capterra(baseUrl, startDate, endDate) {
    let allReviews = [];
    let filteredReviews = [];
    let productInfo = {};

    console.log(`Starting to scrape ${baseUrl} (Capterra)`);

    try {
        let parsedResult, response;

        // Retry logic for failed requests
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                response = await fetchHtml(baseUrl);
                parsedResult = parsedDataFromHTML_Capterra(response);

                if (parsedResult.error) {
                    console.error(`Error parsing Capterra page:`, parsedResult.error);
                    if (attempt === 3) return null;
                    continue;
                }

                if (parsedResult.productData.allReviews.length > 0) break;

                console.warn(`Attempt ${attempt} returned 0 reviews—retrying...`);
                await delay(5000);
            } catch (fetchError) {
                console.error(`Attempt ${attempt} failed:`, fetchError.message);
                if (attempt === 3) throw fetchError;
                await delay(5000);
            }
        }

        // Clean product name by removing "Reviews" suffix
        let cleanProductName = parsedResult.productData.productName.replace(/ Reviews$/i, '');
        
        productInfo = {
            productName: cleanProductName,
            reviewSite: "Capterra",
            stars: parsedResult.productData.stars,
            totalReviews: parsedResult.productData.totalReviews
        };

        allReviews = parsedResult.productData.allReviews;

        // Filter reviews by date range
        filteredReviews = allReviews.filter(review =>
            isReviewInDateRange(review.reviewDate, startDate, endDate)
        );

        console.log(`Found ${allReviews.length} total reviews, ${filteredReviews.length} within date range`);

    } catch (error) {
        console.error(`Failed to scrape Capterra reviews:`, error);
        return null;
    }

    return {
        ...productInfo,
        allReviews: filteredReviews,
        totalScrapedReviews: filteredReviews.length
    };
}

module.exports = {
    scrapeAndFilterReviews_Capterra,
    getScrapeOpsUrl
};

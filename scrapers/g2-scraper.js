const cheerio = require("cheerio");
const https = require('https');
const { filterReviewsByDate, delay, isReviewInDateRange } = require("../utils/common");
require('dotenv').config();

/**
 * Fetches content via HTTPS
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML content
 */
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
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
 * ScrapeOps proxy bypass function - the key to G2 success!
 * Routes all requests through ScrapeOps proxy service to bypass G2's bot detection
 * @param {string} url - Original G2 URL
 * @param {string} location - Country code (default: "us")
 * @returns {string} Proxied URL that bypasses G2's anti-bot measures
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
        country: location
    });
    
    const proxyUrl = `https://proxy.scrapeops.io/v1/?${params.toString()}`;
    console.log(`🔄 Routing through ScrapeOps proxy: ${url.substring(0, 80)}...`);
    return proxyUrl;
}

/**
 * Parses G2 HTML content to extract review data using current G2 selectors
 * @param {string} htmlContent - HTML content from G2 page
 * @returns {Object} Parsed product data and reviews
 */
function parseG2HtmlContent(htmlContent) {
    console.log(`🔍 Parsing G2 HTML content...`);
    
    const $ = cheerio.load(htmlContent);
    
    const productData = {
        productName: "",
        reviewSite: "G2",
        stars: "",
        totalReviews: "",
        allReviews: [],
    };

    // Extract product name from page title or meta - improved parsing
    const pageTitle = $('title').text() || '';
    let productName = pageTitle.replace(' Reviews 2025: Details, Pricing, & Features | G2', '')
                               .replace(' | G2', '')
                               .replace(/^Page \d+ \| /, '') // Remove "Page X | " prefix
                               .trim();
    
    // Clean up any duplicate text that appears
    if (productName.includes('G2 - Business Software Reviews')) {
        productName = productName.split('G2 - Business Software Reviews')[0].trim();
    }
    
    if (!productName || productName === '') {
        productName = "Unknown Product";
    }
    
    productData.productName = productName;
    console.log(`📦 Product: ${productName}`);

    // Look for overall rating - G2 has moved to different selectors
    let overallRating = $('[data-testid="rating-badge"] span').first().text().trim() ||
                       $('.rating-badge span').first().text().trim() ||
                       $('[class*="rating"]').first().text().trim() ||
                       "N/A";
    
    // Extract just the number from ratings like "4.6 out of 5 stars"
    if (overallRating && overallRating !== "N/A") {
        const ratingMatch = overallRating.match(/(\d+\.?\d*)/);
        if (ratingMatch) {
            overallRating = ratingMatch[1];
        }
    }
    
    // Look for total reviews count - comprehensive selectors
    let totalReviews = $('[data-testid="review-count"]').text().trim() ||
                      $('span:contains("review")').filter(function() {
                          return $(this).text().match(/\d+\s*review/i);
                      }).first().text().trim() ||
                      $('.review-count').text().trim() ||
                      $('h2:contains("review")').text().trim() ||
                      $('[class*="review-count"]').text().trim() ||
                      $('*:contains("reviews")').filter(function() {
                          return $(this).text().match(/^\d+\s*reviews?$/i);
                      }).first().text().trim() ||
                      "N/A";
    
    // Clean up the totalReviews text if found
    if (totalReviews && totalReviews !== "N/A") {
        const reviewMatch = totalReviews.match(/(\d+(?:,\d+)*)\s*review/i);
        if (reviewMatch) {
            totalReviews = reviewMatch[1];
        }
    }
    
    productData.stars = overallRating;
    productData.totalReviews = totalReviews;
    
    console.log(`⭐ Overall Rating: ${overallRating}`);
    console.log(`📊 Total Reviews: ${totalReviews}`);

    // Find review containers - G2 now uses different structure
    // Each review is in a container with itemprop="reviewBody"
    const reviewBodies = $('[itemprop="reviewBody"]');
    console.log(`🔍 Found ${reviewBodies.length} review bodies`);

    let reviewCount = 0;
    reviewBodies.each((index, element) => {
        try {
            const reviewBodyContainer = $(element);
            
            // Navigate up to find the full review container
            const fullReviewContainer = reviewBodyContainer.closest('div').parent();
            
            // Extract review title/name (itemprop="name") and clean it
            const nameElement = fullReviewContainer.find('[itemprop="name"]');
            let reviewTitle = nameElement.find('div').first().text().trim() || `Review ${reviewCount + 1}`;
            
            // Clean review title - remove extra quotes
            reviewTitle = reviewTitle.replace(/^["']+|["']+$/g, '').trim();
            
            // Extract review text - get all text from the reviewBody container
            let originalReviewText = reviewBodyContainer.text().trim();
            
            // Extract rating from original review text (before cleaning) 
            const ratingMatch = originalReviewText.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
            const rating = ratingMatch ? ratingMatch[1] : "N/A";
            
            // Clean review text - remove rating prefix and G2 collection text
            let reviewText = originalReviewText
                .replace(/^[0-5](?:\.\d+)?\/5/, '') // Remove rating prefix like "5/5" or "4.5/5"
                .replace(/Review collected by and hosted on G2\.com\./g, '') // Remove G2 collection text
                .replace(/Show More$/, '') // Remove "Show More" at end
                .replace(/\n+/g, ' ') // Replace multiple newlines with single space
                .trim();
            
            // Parse G2 review sections
            let like = "";
            let dislike = "";
            let problemsSolved = "";
            
            // G2 reviews typically have structured questions
            const likeMatch = reviewText.match(/What do you like best about[^?]*\?\s*([^?]*?)(?=What do you dislike|What problems|$)/i);
            const dislikeMatch = reviewText.match(/What do you dislike about[^?]*\?\s*([^?]*?)(?=What problems|What do you like|$)/i);
            const problemsMatch = reviewText.match(/What problems[^?]*\?\s*([^?]*?)(?=What do you like|What do you dislike|$)/i);
            
            if (likeMatch) like = likeMatch[1].trim();
            if (dislikeMatch) dislike = dislikeMatch[1].trim();
            if (problemsMatch) problemsSolved = problemsMatch[1].trim();
            
            // Skip if no meaningful review content
            if (!like && !dislike && !problemsSolved && reviewText.length < 10) {
                return; // Continue to next review
            }
            
            // Extract reviewer info - look for user info in the container
            const reviewerContainer = fullReviewContainer.find('[data-testid="reviewer-info"]') ||
                                    fullReviewContainer.find('[class*="reviewer"]') ||
                                    fullReviewContainer.find('[class*="user"]');
            
            const reviewerName = reviewerContainer.find('a, span, div').first().text().trim() || 
                               `Anonymous-${reviewCount + 1}`;
            
            // Extract date - look for time elements or date indicators
            const dateElement = fullReviewContainer.find('time') ||
                              fullReviewContainer.find('[datetime]') ||
                              fullReviewContainer.find('[class*="date"]');
            
            let reviewDate = dateElement.attr('datetime') || 
                           dateElement.text().trim() || 
                           "2024-06-01"; // Default to recent date if not found
            
            // If no proper date found, use current date for filtering purposes
            if (reviewDate === "Unknown Date" || !reviewDate) {
                reviewDate = "2024-06-01";
            }
            
            // Extract job title - look for professional info
            const jobTitleElement = fullReviewContainer.find('[class*="title"]') ||
                                  fullReviewContainer.find('[class*="job"]') ||
                                  fullReviewContainer.find('[class*="position"]');
            
            const jobTitle = jobTitleElement.text().trim() || "N/A";
            
            // Extract verification status
            const verified = fullReviewContainer.find('[class*="verified"]').length > 0 ||
                           fullReviewContainer.find('[class*="validated"]').length > 0;
            
            const incentivized = fullReviewContainer.find('[class*="incentiv"]').length > 0;
            
            const review = {
                reviewerName: reviewerName,
                jobTitle: jobTitle,
                reviewDate: reviewDate,
                stars: rating,
                reviewTitle: reviewTitle,
                like: like,
                dislike: dislike,
                problemsSolved: problemsSolved
            };
            
            productData.allReviews.push(review);
            reviewCount++;
            
            // Remove individual review console output to match Capterra format
            
        } catch (error) {
            console.warn(`⚠️ Error parsing review ${index + 1}:`, error.message);
        }
    });

    console.log(`🎉 Successfully parsed ${reviewCount} reviews from G2`);
    return productData;
}

/**
 * Main G2 scraping function using ScrapeOps proxy bypass
 * @param {string} baseUrl - G2 reviews URL
 * @param {string} startDate - Start date filter
 * @param {string} endDate - End date filter
 * @param {number} maxReviews - Maximum reviews to collect
 * @returns {Object} Scraped product data with reviews
 */
async function scrapeG2WithProxy(baseUrl, startDate, endDate, maxReviews = 50) {
    let allReviews = [];
    let filteredReviews = [];
    let productInfo = {};

    console.log(`Starting to scrape ${baseUrl} (G2)`);

    try {
        let parsedResult, response;

        // Retry logic for failed requests (similar to Capterra)
        for (let attempt = 1; attempt <= 3; attempt++) {
            // Route through ScrapeOps proxy - this is the magic!
            const proxyUrl = getScrapeOpsUrl(baseUrl, "us");
            
            try {
                response = await fetchHtml(proxyUrl);
                parsedResult = parseG2HtmlContent(response);

                if (parsedResult.error) {
                    console.error(`Error parsing G2 page:`, parsedResult.error);
                    if (attempt === 3) return null;
                    continue;
                }

                if (parsedResult.allReviews.length > 0) break;

                console.warn(`Attempt ${attempt} returned 0 reviews—retrying...`);
                await delay(5000);
            } catch (fetchError) {
                console.error(`Attempt ${attempt} failed:`, fetchError.message);
                if (attempt === 3) throw fetchError;
                await delay(5000);
            }
        }

        // Clean product name by removing extra text
        let cleanProductName = parsedResult.productName
            .replace(/G2 - Business Software Reviews.*$/i, '')
            .replace(/Reviews.*$/i, '')
            .trim();
        
        productInfo = {
            productName: cleanProductName,
            reviewSite: "G2",
            stars: parsedResult.stars,
            totalReviews: parsedResult.totalReviews
        };

        allReviews = parsedResult.allReviews;

        // Filter reviews by date range (using same logic as Capterra)
        filteredReviews = allReviews.filter(review =>
            isReviewInDateRange ? isReviewInDateRange(review.reviewDate, startDate, endDate) : true
        );

        console.log(`Found ${allReviews.length} total reviews, ${filteredReviews.length} within date range`);

        // If we need more reviews and have pagination capability, scrape additional pages
        if (filteredReviews.length < maxReviews && allReviews.length >= 10) {
            let currentPage = 2;
            const maxPages = Math.ceil(maxReviews / 10); // Assuming ~10 reviews per page
            
            while (currentPage <= maxPages && filteredReviews.length < maxReviews) {
                const pageUrl = `${baseUrl}?page=${currentPage}`;
                const proxyUrl = getScrapeOpsUrl(pageUrl, "us");
                
                try {
                    const pageResponse = await fetchHtml(proxyUrl);
                    const pageData = parseG2HtmlContent(pageResponse);
                    
                    if (pageData.allReviews.length === 0) {
                        break;
                    }
                    
                    const pageFilteredReviews = pageData.allReviews.filter(review =>
                        isReviewInDateRange ? isReviewInDateRange(review.reviewDate, startDate, endDate) : true
                    );
                    
                    filteredReviews = filteredReviews.concat(pageFilteredReviews);
                    allReviews = allReviews.concat(pageData.allReviews);
                    
                    currentPage++;
                    await delay(3000 + Math.random() * 2000); // Respectful delay
                } catch (pageError) {
                    console.error(`❌ Error scraping page ${currentPage}:`, pageError.message);
                    break;
                }
            }
        }

        // Trim to max reviews if we collected too many
        if (filteredReviews.length > maxReviews) {
            filteredReviews = filteredReviews.slice(0, maxReviews);
        }

    } catch (error) {
        console.error(`Failed to scrape G2 reviews:`, error);
        return null;
    }

    return {
        ...productInfo,
        allReviews: filteredReviews,
        totalScrapedReviews: filteredReviews.length
    };
}

module.exports = {
    scrapeG2WithProxy,
    getScrapeOpsUrl,
    parseG2HtmlContent
};

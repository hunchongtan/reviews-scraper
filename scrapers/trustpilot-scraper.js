const cheerio = require("cheerio");
const https = require('https');
const { generatePageUrl, delay } = require("../utils/common");
require('dotenv').config();

/**
 * ScrapeOps proxy bypass function for TrustPilot
 * @param {string} url - Original TrustPilot URL
 * @param {string} location - Country code (default: "us")
 * @returns {string} Proxied URL that bypasses TrustPilot's anti-bot measures
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
 * Fetches content via HTTPS through ScrapeOps proxy
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} Response object with body property
 */
function fetchHtml(url) {
    // Route through ScrapeOps proxy for TrustPilot
    const proxyUrl = getScrapeOpsUrl(url, "us");
    
    return new Promise((resolve, reject) => {
        https.get(proxyUrl, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({ body: data });
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Parses Trustpilot HTML content to extract review data
 * @param {string} html - HTML content to parse
 * @returns {Object} Parsed product data
 */
function parsedDataFromHTML_Trustpilot(html) {
    try {
        const $ = cheerio.load(html);
        const productData = {
            productName: "",
            reviewSite: "Trustpilot",
            stars: "",
            totalReviews: "",
            allReviews: [],
        };

        // Parse header - split "Name Reviews 915"
        const h1Text = $("h1").text().trim();
        const headerMatch = h1Text.match(/^(.+?)\s+Reviews\s+([\d,]+)$/);
        if (headerMatch) {
            productData.productName = headerMatch[1];
            productData.totalReviews = headerMatch[2].replace(/,/g, "");
        } else {
            productData.productName = h1Text;
        }

        // Extract star rating
        productData.stars = $('p[data-rating-typography="true"]')
            .first()
            .text()
            .trim();

        // Extract individual reviews
        $("div.styles_cardWrapper__g8amG.styles_show__Z8n7u").each((_, el) => {
            const card = $(el);
            const reviewerName = card.find("article div a span").first().text().trim();
            const country = card.find("article div a div span").text().split("•")[0].trim();
            const stars = card.find("article div section div").attr("data-service-review-rating") || "";
            const title = card.find("h2[data-service-review-title-typography]").text().trim();
            const reviewLink = card.find("a[data-review-title-typography]").attr("href") || "";
            const reviewText = card.find("p[data-service-review-text-typography]").text().trim();
            let reviewDate = card.find("time[data-service-review-date-time-ago]").attr("datetime") || 
                            card.find("time").text().trim();
            
            // Format reviewDate to be just the date (remove time if present)
            if (reviewDate.includes('T')) {
                reviewDate = reviewDate.split('T')[0];
            }
            
            const dateOfExperience = card.find("p[data-service-review-date-of-experience-typography] span").text().trim();

            productData.allReviews.push({
                reviewerName,
                jobTitle: "", // TrustPilot doesn't have job titles
                reviewDate,
                stars,
                reviewTitle: title,
                reviewText
            });
        });

        return { productData };
    } catch (error) {
        return { error };
    }
}

/**
 * Scrapes all pages of Trustpilot reviews within date range
 * @param {Object} api - Crawlbase API instance
 * @param {string} baseUrl - Base URL to scrape
 * @param {string} startDateStr - Start date for filtering
 * @param {string} endDateStr - End date for filtering
 * @returns {Object} Scraped review data
 */
async function scrapeAllPages_Trustpilot(baseUrl, startDateStr, endDateStr) {
    let page = 1;
    const allReviews = [];
    let productInfo = null;
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    console.log(`Starting to scrape ${baseUrl} (Trustpilot)`);

    while (true) {
        // Add language parameter to get all reviews
        const langUrl = baseUrl.includes('?')
            ? `${baseUrl}&languages=all`
            : `${baseUrl}?languages=all`;
        const url = generatePageUrl(langUrl, page);
        
        console.log(`Trustpilot page ${page}: ${url}`);

        // Retry fetch + parse up to 3 times if no reviews returned
        let parsedResult, resp;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                resp = await fetchHtml(url);
                parsedResult = parsedDataFromHTML_Trustpilot(resp.body);

                if (parsedResult.error) {
                    console.error(`Parser error on page ${page} attempt ${attempt}:`, parsedResult.error);
                    break;
                }

                if (parsedResult.productData.allReviews.length > 0) {
                    break;
                }

                console.warn(`Attempt ${attempt} for page ${page} returned 0 reviews—retrying...`);
                if (attempt < 3) await delay(5000);
            } catch (error) {
                console.error(`Fetch error on page ${page} attempt ${attempt}:`, error.message);
                if (attempt < 3) await delay(5000);
            }
        }

        // Stop on parser error or still no reviews after retries
        if (parsedResult.error) {
            break;
        }
        if (!parsedResult.productData.allReviews.length) {
            console.log(`No reviews found on page ${page} after retries, stopping scrape.`);
            break;
        }

        const productData = parsedResult.productData;

        // Capture header info on first page
        if (!productInfo) {
            productInfo = {
                productName: productData.productName,
                reviewSite: productData.reviewSite,
                stars: productData.stars,
                totalReviews: productData.totalReviews,
            };
        }

        // Filter this page's reviews by date window
        const filteredPageReviews = productData.allReviews.filter(r => {
            const d = new Date(r.reviewDate);
            return d >= startDate && d <= endDate;
        });
        allReviews.push(...filteredPageReviews);

        console.log(`Found ${productData.allReviews.length} reviews on page ${page}, ${filteredPageReviews.length} within date range`);

        // Stop if the oldest review on the page is before start date
        const lastReview = productData.allReviews[productData.allReviews.length - 1];
        if (new Date(lastReview.reviewDate) < startDate) {
            console.log(`Reached reviews older than ${startDateStr}, stopping.`);
            break;
        }

        // Check for next page button
        const $ = cheerio.load(resp.body);
        const nextLink = $('a[name="pagination-button-next"]').attr('href');
        if (!nextLink) {
            console.log("No more Trustpilot pages.");
            break;
        }

        page++;
        await delay(25000); // Rate limiting
    }

    return {
        ...productInfo,
        allReviews,
        totalScrapedReviews: allReviews.length,
    };
}

module.exports = {
    scrapeAllPages_Trustpilot,
    getScrapeOpsUrl
};

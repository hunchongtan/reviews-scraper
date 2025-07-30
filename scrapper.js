const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Import platform-specific scrapers
const { scrapeG2WithProxy } = require("./scrapers/g2-scraper");
const { scrapeAndFilterReviews_Capterra } = require("./scrapers/capterra-scraper");
const { scrapeAllPages_Trustpilot } = require("./scrapers/trustpilot-scraper");
const { saveToJsonFile } = require("./utils/common");

/**
 * Determines the platform type from URL and calls appropriate scraper
 * @param {string} url - The URL to scrape
 * @param {string} startDate - Start date for filtering
 * @param {string} endDate - End date for filtering
 * @returns {Object|null} Scraped review data or null if failed
 */
async function scrapeReviews(url, startDate, endDate) {
    const urlLower = url.toLowerCase();

    try {
        if (urlLower.includes('capterra')) {
            console.log(`🎯 Detected Capterra URL`);
            return await scrapeAndFilterReviews_Capterra(url, startDate, endDate);
        } 
        else if (urlLower.includes('g2')) {
            console.log(`🎯 Detected G2 URL - Using ScrapeOps Proxy Bypass`);
            const maxReviews = 50; // Adjust as needed
            return await scrapeG2WithProxy(url, startDate, endDate, maxReviews);
        } 
        else if (urlLower.includes('trustpilot')) {
            console.log(`🎯 Detected Trustpilot URL`);
            return await scrapeAllPages_Trustpilot(url, startDate, endDate);
        } 
        else {
            console.error(`❌ Unsupported platform. Supported: G2, Capterra, Trustpilot`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Error scraping ${url}:`, error.message);
        return null;
    }
}

/**
 * Validates input data structure
 * @param {Object} entry - Input entry to validate
 * @returns {boolean} Whether the entry is valid
 */
function validateInputEntry(entry) {
    if (!entry.url || !entry.start_date || !entry.end_date) {
        console.error("❌ Each input entry must include 'url', 'start_date', and 'end_date'");
        return false;
    }
    return true;
}

/**
 * Main function to orchestrate the scraping process
 */
async function main() {
    console.log("🚀 Starting Review Scraper...");
    
    try {
        // No longer need to check for Crawlbase TOKEN since we're using Puppeteer
        // Check if Puppeteer can run properly
        console.log("🤖 Initializing Puppeteer...");

        // Read input file
        const inputFilePath = path.join(__dirname, 'input.json');
        if (!fs.existsSync(inputFilePath)) {
            console.error("❌ Input file not found: input.json");
            console.error("Please create an input.json file with your scraping configuration");
            process.exit(1);
        }

        const inputData = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
        
        // Support both single object and array of objects
        const entries = Array.isArray(inputData) ? inputData : [inputData];
        
        if (entries.length === 0) {
            console.error("❌ No entries found in input.json");
            process.exit(1);
        }

        console.log(`📋 Found ${entries.length} URL(s) to scrape`);

        // Process each entry
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            console.log(`\n📄 Processing entry ${i + 1}/${entries.length}`);
            
            // Validate entry
            if (!validateInputEntry(entry)) {
                continue;
            }

            const { url, start_date, end_date } = entry;
            console.log(`🔗 URL: ${url}`);
            console.log(`📅 Date range: ${start_date} to ${end_date}`);

            // Scrape reviews
            const result = await scrapeReviews(url, start_date, end_date);
            
            if (!result) {
                console.error(`❌ Failed to scrape data for ${url}`);
                continue;
            }

            // Save results
            const fileInfo = saveToJsonFile(result, url);
            console.log(`✅ Scraping complete for ${url}`);
            console.log(`📁 Output file: ${fileInfo.filename}`);
            console.log(`📊 Reviews scraped: ${result.totalScrapedReviews}`);
            
            // Add delay between entries to be respectful
            if (i < entries.length - 1) {
                console.log("⏳ Waiting before next entry...");
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        console.log("\n🎉 All scraping tasks completed successfully!");

    } catch (error) {
        console.error("❌ Fatal error during scraping:", error.message);
        process.exit(1);
    }
}

// Run the main function
if (require.main === module) {
    main().catch(async (error) => {
        console.error("❌ Unhandled error:", error);
        process.exit(1);
    });
}

module.exports = {
    scrapeReviews,
    main
};

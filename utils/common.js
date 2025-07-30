const fs = require("fs");
const path = require("path");

/**
 * Saves data to a JSON file with timestamp
 * @param {Object} data - The data to save
 * @param {string} rawName - The raw name/URL to use for filename
 * @returns {Object} File information with path and filename
 */
function saveToJsonFile(data, rawName) {
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    
    // Use rawName (URL) if provided, else productName
    const baseRaw = rawName || data.productName;
    // Remove protocol and sanitize
    const sanitizedProductName = baseRaw.toString()
        .replace(/^https?:\/\//, '')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sanitizedProductName}_${timestamp}.json`;
    const filePath = path.join(outputDir, filename);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { filePath, filename };
}

/**
 * Generates paginated URLs
 * @param {string} baseUrl - The base URL
 * @param {number} pageNum - The page number
 * @returns {string} The paginated URL
 */
function generatePageUrl(baseUrl, pageNum) {
    if (pageNum === 1) {
        return baseUrl;
    }
    if (baseUrl.includes('?')) {
        return `${baseUrl}&page=${pageNum}`;
    } else {
        return `${baseUrl}?page=${pageNum}`;
    }
}

/**
 * Parses various date formats
 * @param {string} dateStr - Date string to parse
 * @returns {Date} Parsed date
 */
function parseDate(dateStr) {
    dateStr = dateStr.trim();
    
    // Format: YYYY/MM/DD
    let m = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) {
        const [, year, month, day] = m;
        return new Date(+year, +month - 1, +day);
    }
    
    // Format: MM/DD/YYYY
    m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const [, month, day, year] = m;
        return new Date(+year, +month - 1, +day);
    }
    
    return new Date(dateStr);
}

/**
 * Filters reviews by date range
 * @param {Array} reviews - Array of review objects
 * @param {string} startDateStr - Start date string
 * @param {string} endDateStr - End date string
 * @returns {Array} Filtered reviews
 */
function filterReviewsByDate(reviews, startDateStr, endDateStr) {
    const start = parseDate(startDateStr);
    const end = parseDate(endDateStr);
    
    return reviews.filter(review => {
        const rd = parseDate(review.reviewDate);
        return !isNaN(rd) && rd >= start && rd <= end;
    });
}

/**
 * Calculates date from relative time strings (e.g., "2 months ago")
 * @param {string} relativeTimeStr - Relative time string
 * @returns {Date} Calculated date
 */
function calculateDateFromRelative(relativeTimeStr) {
    const currentDate = new Date();
    const lowerStr = relativeTimeStr.toLowerCase();
    
    if (lowerStr.includes('year')) {
        const years = parseInt(relativeTimeStr);
        return new Date(currentDate.getFullYear() - years, currentDate.getMonth(), currentDate.getDate());
    } else if (lowerStr.includes('month')) {
        const months = parseInt(relativeTimeStr);
        let newMonth = currentDate.getMonth() - months;
        let newYear = currentDate.getFullYear();
        
        while (newMonth < 0) {
            newMonth += 12;
            newYear--;
        }
        return new Date(newYear, newMonth, currentDate.getDate());
    } else if (lowerStr.includes('day')) {
        const days = parseInt(relativeTimeStr);
        const resultDate = new Date(currentDate);
        resultDate.setDate(resultDate.getDate() - days);
        return resultDate;
    } else {
        return new Date(relativeTimeStr);
    }
}

/**
 * Checks if a review date is within the specified range
 * @param {string} reviewDateStr - Review date string
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @returns {boolean} Whether the review is in range
 */
function isReviewInDateRange(reviewDateStr, startDate, endDate) {
    const reviewDate = calculateDateFromRelative(reviewDateStr);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return reviewDate >= start && reviewDate <= end;
}

/**
 * Adds delay between requests
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    saveToJsonFile,
    generatePageUrl,
    parseDate,
    filterReviewsByDate,
    calculateDateFromRelative,
    isReviewInDateRange,
    delay
};

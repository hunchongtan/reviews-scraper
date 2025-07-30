const fs = require('fs');
const path = require('path');

/**
 * Converts JSON review data to CSV format
 * @param {Array} reviews - Array of review objects
 * @returns {string} CSV formatted string
 */
function convertToCSV(reviews) {
    if (!Array.isArray(reviews) || reviews.length === 0) {
        return '';
    }

    const headers = Object.keys(reviews[0]);
    const csvRows = reviews.map(review =>
        headers.map(field => {
            const value = review[field] != null ? String(review[field]) : '';
            // Escape quotes and wrap in quotes to handle commas and newlines
            return `"${value.replace(/"/g, '""')}"`;
        }).join(',')
    );

    return [headers.join(','), ...csvRows].join('\n');
}

/**
 * Generates a clean filename from the original JSON filename
 * @param {string} jsonFilename - Original JSON filename
 * @returns {string} Clean CSV filename
 */
function generateCSVFilename(jsonFilename) {
    // Remove timestamp and .json extension, then add .csv
    const cleanName = jsonFilename
        .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/, '.csv')
        .replace(/\.json$/, '.csv');
    return cleanName;
}

/**
 * Main export function
 */
function main() {
    console.log('🔄 Starting CSV export process...');

    // Setup directories
    const inputDir = path.join(__dirname, 'output');
    const outputDir = path.join(__dirname, 'csv_output');

    if (!fs.existsSync(inputDir)) {
        console.error('❌ Input directory not found: output/');
        console.error('Please run the scraper first to generate JSON files.');
        process.exit(1);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        console.log('📁 Created csv_output directory');
    }

    // Get all JSON files
    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
        console.warn('⚠️ No JSON files found in output directory');
        return;
    }

    console.log(`📋 Found ${files.length} JSON file(s) to export`);

    let successCount = 0;
    let errorCount = 0;

    // Process each file
    files.forEach((file, index) => {
        console.log(`\n📄 Processing ${index + 1}/${files.length}: ${file}`);
        
        const inputPath = path.join(inputDir, file);
        const csvFilename = generateCSVFilename(file);
        const outputPath = path.join(outputDir, csvFilename);

        try {
            // Read and parse JSON
            const rawData = fs.readFileSync(inputPath, 'utf8');
            const data = JSON.parse(rawData);

            if (!data.allReviews || !Array.isArray(data.allReviews)) {
                console.warn(`⚠️ No 'allReviews' array found in ${file}. Skipping.`);
                return;
            }

            if (data.allReviews.length === 0) {
                console.warn(`⚠️ No reviews found in ${file}. Skipping.`);
                return;
            }

            // Convert to CSV
            const csvContent = convertToCSV(data.allReviews);
            
            // Write CSV file
            fs.writeFileSync(outputPath, csvContent, 'utf8');
            
            console.log(`✅ Exported ${data.allReviews.length} reviews to ${csvFilename}`);
            successCount++;

        } catch (error) {
            console.error(`❌ Error processing ${file}:`, error.message);
            errorCount++;
        }
    });

    // Summary
    console.log(`\n📊 Export Summary:`);
    console.log(`✅ Successfully exported: ${successCount} files`);
    if (errorCount > 0) {
        console.log(`❌ Failed exports: ${errorCount} files`);
    }
    console.log(`📁 CSV files saved to: csv_output/`);
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, convertToCSV, generateCSVFilename };

# Multi-Platform Review Scraper

A robust Node.js application for scraping reviews from G2, Capterra, and Trustpilot platforms with built-in proxy support and anti-blocking capabilities.

## Features

- **Multi-Platform Support**: Scrape reviews from G2, Capterra, and Trustpilot
- **Proxy Integration**: Built-in ScrapeOps proxy support to bypass anti-bot measures
- **Date Filtering**: Filter reviews by date range
- **Standardized Output**: Consistent JSON format across all platforms
- **CSV Export**: Convert JSON output to CSV format
- **Retry Logic**: Automatic retries with backoff for failed requests
- **Rate Limiting**: Built-in delays to respect platform limits

## Supported Platforms

| Platform | Features | Output Fields |
|----------|----------|---------------|
| **G2** |  Star ratings<br> Like/Dislike feedback<br> Problems solved | productName, eviewSite, stars, 	otalReviews, llReviews |
| **Capterra** |  Star ratings<br> Full review text<br> Review dates | productName, eviewSite, stars, 	otalReviews, llReviews |
| **Trustpilot** |  Star ratings<br> Review content<br> Review dates | productName, eviewSite, stars, 	otalReviews, llReviews |

## Installation

1. **Clone the repository**
   `ash
   git clone https://github.com/hunchongtan/reviews-scraper.git
   cd reviews-scraper
   `

2. **Install dependencies**
   `ash
   npm install
   `

3. **Set up environment variables**
   `ash
   cp .env.example .env
   `
   
   Edit .env and add your ScrapeOps API key:
   `env
   SCRAPEOPS_API_KEY=your_scrapeops_api_key_here
   `

   **Getting a ScrapeOps API Key:**
   - Visit [ScrapeOps.io](https://scrapeops.io/)
   - Sign up for a free account
   - Get your API key from the dashboard
   - The free tier includes 1,000 requests per month

## Configuration

### Input File Setup

Configure your scraping jobs in input.json:

`json
[
  {
    "url": "https://www.g2.com/products/your-product/reviews",
    "start_date": "2023-01-01",
    "end_date": "2023-12-31"
  },
  {
    "url": "https://www.capterra.com/p/123456/your-product/reviews/",
    "start_date": "2023-06-01", 
    "end_date": "2023-12-31"
  },
  {
    "url": "https://www.trustpilot.com/review/your-domain.com",
    "start_date": "2023-01-01",
    "end_date": "2023-12-31"
  }
]
`

### URL Formats

- **G2**: https://www.g2.com/products/[product-name]/reviews
- **Capterra**: https://www.capterra.com/p/[product-id]/[product-name]/reviews/
- **Trustpilot**: https://www.trustpilot.com/review/[domain.com]

## Usage

### Basic Scraping

`ash
# Run the main scraper
npm start
# or
npm run scrape
`

### Export to CSV

`ash
# Export JSON results to CSV
npm run export
`

### Complete Workflow

`ash
# Scrape reviews and export to CSV in one command
npm run scrape-and-export
`

### Development Mode

`ash
# Run with nodemon for development
npm run dev
`

## Output Format

### JSON Output
All scrapers produce standardized JSON files in the output/ directory:

`json
{
  "productName": "Example Product",
  "reviewSite": "G2",
  "stars": "4.5",
  "totalReviews": 150,
  "allReviews": [
    {
      "stars": "5",
      "date": "2023-12-01",
      "like": "Great features and easy to use",
      "dislike": "Could improve mobile app",
      "problemsSolved": "Streamlined our workflow"
    }
  ]
}
`

### CSV Export
CSV files are generated in the csv_output/ directory with the same data structure.

## Platform-Specific Features

### G2 Reviews
- **Special Fields**: like, dislike, problemsSolved instead of eviewText
- **Star Format**: Numeric (e.g., "4.6")
- **Proxy Support**: Full ScrapeOps integration

### Capterra Reviews
- **Fields**: Standard eviewText field
- **Star Format**: Numeric (e.g., "4.5")
- **Proxy Support**: Full ScrapeOps integration

### Trustpilot Reviews
- **Fields**: Standard eviewText field
- **Star Format**: Numeric (e.g., "4.0")
- **Proxy Support**: Full ScrapeOps integration

## Error Handling

The scraper includes comprehensive error handling:

- **Retry Logic**: 3 automatic retries with exponential backoff
- **Proxy Rotation**: Automatic proxy switching on failures
- **Rate Limiting**: Built-in delays between requests
- **Validation**: Input URL and date validation
- **Logging**: Detailed console output for debugging

## Project Structure

`
reviews-scraper/
 scrapers/
    g2-scraper.js          # G2 platform scraper
    capterra-scraper.js    # Capterra platform scraper
    trustpilot-scraper.js  # Trustpilot platform scraper
 utils/
    common.js              # Shared utilities
 output/                    # JSON output files
 csv_output/               # CSV export files
 scrapper.js               # Main application entry
 export_reviews.js         # CSV export utility
 input.json                # Scraping configuration
 .env.example              # Environment variables template
 package.json              # Project dependencies
`

## API Rate Limits & Best Practices

### Rate Limiting
- **Built-in delays**: 2-5 seconds between requests
- **Respect robots.txt**: Check platform policies
- **Proxy rotation**: Reduces IP-based blocking

### Best Practices
1. **Use date ranges**: Limit scraping to specific periods
2. **Monitor usage**: Check ScrapeOps dashboard for API usage
3. **Test first**: Start with small date ranges
4. **Respect platforms**: Don't overload servers

## Troubleshooting

### Common Issues

1. **"Blocked by platform"**
   - Ensure ScrapeOps API key is configured
   - Check API key limits on ScrapeOps dashboard
   - Try smaller date ranges

2. **"No reviews found"**
   - Verify URL format is correct
   - Check if date range contains reviews
   - Ensure product has public reviews

3. **"Environment variable not found"**
   - Copy .env.example to .env
   - Add your ScrapeOps API key

### Debug Mode
Enable detailed logging by setting environment variable:
`ash
DEBUG=true npm start
`

## Contributing

1. Fork the repository
2. Create a feature branch (git checkout -b feature/new-feature)
3. Commit your changes (git commit -am 'Add new feature')
4. Push to the branch (git push origin feature/new-feature)
5. Create a Pull Request

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is for educational and research purposes. Always respect website terms of service and robots.txt files. Be mindful of rate limits and server resources.

## Support

- Create an issue for bug reports
- Check existing issues before creating new ones
- Provide detailed information including error messages and logs

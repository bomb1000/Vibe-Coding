// JavaScript for Financial News Aggregator

// Placeholder data - will be replaced with actual API calls
const sampleTweets = [
    {
        user: "MarketWatch",
        avatar: "https://via.placeholder.com/50", // Placeholder image
        text: "Breaking: Federal Reserve announces interest rate hike by 0.25%. #Fed #InterestRates",
        timestamp: "Oct 26, 2023"
    },
    {
        user: "Investopedia",
        avatar: "https://via.placeholder.com/50", // Placeholder image
        text: "Understanding a company's P/E ratio is crucial for value investing. Learn more on our site. #Investing #Stocks",
        timestamp: "Oct 25, 2023"
    },
    {
        user: "Bloomberg",
        avatar: "https://via.placeholder.com/50", // Placeholder image
        text: "Global markets react to new trade agreements. Dow Jones up 150 points. #Markets #Trade",
        timestamp: "Oct 26, 2023"
    },
    {
        user: "ReutersBiz",
        avatar: "https://via.placeholder.com/50", // Placeholder image
        text: "Tech stocks continue their rally, with NASDAQ hitting a new all-time high. #TechStocks #NASDAQ",
        timestamp: "Oct 24, 2023"
    }
];

/**
 * Fetches tweets.
 * Currently returns sample data. Will be updated to fetch from an API.
 * @returns {Array} An array of tweet objects.
 */
function fetchTweets() {
    // For now, just return the sample data
    // Later, this will involve an API call, e.g., using fetch()
    return sampleTweets;
}

/**
 * Displays tweets in the main content area.
 * @param {Array} tweets - An array of tweet objects to display.
 */
function displayTweets(tweets) {
    const mainElement = document.getElementById('news-feed');
    if (!mainElement) {
        console.error("Error: Main element with ID 'news-feed' not found.");
        return;
    }

    mainElement.innerHTML = ''; // Clear existing content

    tweets.forEach(tweet => {
        const tweetDiv = document.createElement('div');
        tweetDiv.className = 'tweet-card'; // Add class for styling

        const userPara = document.createElement('p');
        userPara.className = 'tweet-user';
        userPara.textContent = tweet.user;

        const textPara = document.createElement('p');
        textPara.className = 'tweet-text';
        textPara.textContent = tweet.text;

        const timestampPara = document.createElement('p');
        timestampPara.className = 'tweet-timestamp';
        timestampPara.textContent = tweet.timestamp;

        // We're not displaying the avatar for now, but it's in the data.
        // We could add an <img> tag here if needed.

        tweetDiv.appendChild(userPara);
        tweetDiv.appendChild(textPara);
        tweetDiv.appendChild(timestampPara);

        mainElement.appendChild(tweetDiv);
    });
}

// Add event listener for when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const tweets = fetchTweets();
    displayTweets(tweets);
});

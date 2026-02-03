const express = require('express');
const cors = require('cors');
const RSSParser = require('rss-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const parser = new RSSParser();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// X Bearer Token
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

// === UPDATED SOURCE LIST ===
// X accounts to monitor (primary news source)
const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson', weight: 1.0 },
    { handle: 'ggreenwald', name: 'Glenn Greenwald', weight: 1.0 },
    { handle: 'NickJFuentes', name: 'Nick Fuentes', weight: 1.0 },
    { handle: 'OwenShroyer', name: 'Owen Shroyer', weight: 1.0 },
    { handle: 'shellaborger', name: 'Michael Shellenberger', weight: 1.0 },
    { handle: 'Judgenap', name: 'Judge Napolitano', weight: 1.0 },
    { handle: 'AFpost', name: 'AF Post', weight: 1.0 },
    { handle: 'BreakingPoints', name: 'Breaking Points', weight: 1.0 },
    { handle: 'DropsiteNews', name: 'Drop Site News', weight: 1.0 },
    { handle: 'ComicDaveSmith', name: 'Dave Smith', weight: 1.0 },
    { handle: 'BretWeinstein', name: 'Bret Weinstein', weight: 1.0 },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone', weight: 1.0 },
    { handle: 'VigilantFox', name: 'Vigilant Fox', weight: 1.0 },
    { handle: 'MarioNawfal', name: 'Mario Nawfal', weight: 1.0 },
    { handle: 'jimmy_dore', name: 'Jimmy Dore', weight: 1.0 }
];

// RSS feeds for articles/videos
const RSS_FEEDS = [
    // Articles
    { name: 'Glenn Greenwald', url: 'https://greenwald.substack.com/feed', weight: 1.0, type: 'article' },
    { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed', weight: 1.0, type: 'article' },
    { name: 'The Grayzone', url: 'https://thegrayzone.com/feed/', weight: 1.0, type: 'article' },
    { name: 'Michael Shellenberger', url: 'https://public.substack.com/feed', weight: 1.0, type: 'article' },
    // Videos - YouTube
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsox8LQ1disc39gKMO7SBDg', weight: 1.0, type: 'video' },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7MpzwYC_T_V1HvxSWu9f0g', weight: 1.0, type: 'video' },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCULvqbr5KVJqa5cMGvfgx7A', weight: 1.0, type: 'video' },
    { name: 'Jimmy Dore', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3M7l8ved_rYQ45AVzS0RGA', weight: 1.0, type: 'video' },
    { name: 'Bret Weinstein', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCi5N_uAqApEUIlg32QzkPlg', weight: 1.0, type: 'video' },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6gH70EPp8QQjRfEcW2t4uA', weight: 1.0, type: 'video' },
    { name: 'The Grayzone', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEXR8pRTkE2vFeJePNe9UcQ', weight: 1.0, type: 'video' },
    { name: 'Owen Shroyer', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCVt4pCBSXMqmNbIpvx1Rary', weight: 1.0, type: 'video' }
];

// === SOURCE DIVERSITY CAP ===
const MAX_PER_SOURCE_PER_SECTION = 2;

// Words that indicate NON-news content (filter these out)
const NON_NEWS_FILTERS = [
    'episode', 'ep.', 'ep ', '#', 'podcast', 'full show', 'full episode',
    'compilation', 'best of', 'highlights', 'preview', 'trailer',
    'subscribe', 'join us', 'live stream starting', 'going live'
];

// Corporate media blacklist
const CORPORATE_BLACKLIST = [
    'nytimes.com', 'washingtonpost.com', 'cnn.com', 'foxnews.com', 'msnbc.com',
    'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'wsj.com', 'usatoday.com',
    'reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com', 'politico.com',
    'thehill.com', 'axios.com', 'huffpost.com', 'vox.com', 'vice.com',
    'buzzfeed.com', 'dailybeast.com', 'slate.com', 'salon.com', 'motherjones.com',
    'forbes.com', 'bloomberg.com', 'businessinsider.com', 'cnbc.com'
];

// In-memory cache - now separated by section
let cachedTweets = [];
let cachedVideos = [];
let cachedArticles = [];
let cachedStories = [];
let lastFetch = null;

// Check if headline is actual news (not podcast episode)
function isNewsContent(headline) {
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
}

// Check if URL is from corporate media
function isCorporateMedia(url) {
    if (!url) return false;
    return CORPORATE_BLACKLIST.some(domain => url.toLowerCase().includes(domain));
}

// Fetch tweets from X API
async function fetchXPosts() {
    if (!X_BEARER_TOKEN) {
        console.log('No X Bearer Token - skipping X API');
        return [];
    }

    const stories = [];

    for (const account of X_ACCOUNTS) {
        try {
            const userResponse = await fetch(
                `https://api.twitter.com/2/users/by/username/${account.handle}`,
                { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
            );

            if (!userResponse.ok) continue;

            const userData = await userResponse.json();
            if (!userData.data) continue;

            const userId = userData.data.id;

            const tweetsResponse = await fetch(
                `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
                { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
            );

            if (!tweetsResponse.ok) continue;

            const tweetsData = await tweetsResponse.json();

            if (tweetsData.data) {
                for (const tweet of tweetsData.data) {
                    if (!isNewsContent(tweet.text)) continue;
                    if (tweet.text.length < 50) continue;

                    let headline = tweet.text.split('\n')[0];
                    if (headline.length > 150) {
                        headline = headline.substring(0, 147) + '...';
                    }

                    stories.push({
                        headline: `${account.name.toUpperCase()}: ${headline}`,
                        url: `https://x.com/${account.handle}/status/${tweet.id}`,
                        source: account.name,
                        pubDate: tweet.created_at,
                        type: 'tweet',
                        engagement: tweet.public_metrics ? 
                            (tweet.public_metrics.like_count + tweet.public_metrics.retweet_count * 2 + tweet.public_metrics.reply_count) : 0,
                        sourceWeight: account.weight
                    });
                }
            }

            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`Error fetching X posts for ${account.handle}:`, error.message);
        }
    }

    return stories;
}

// Fetch RSS feeds (articles and videos)
async function fetchRSSFeeds() {
    const stories = [];

    for (const feed of RSS_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);

            for (const item of parsed.items.slice(0, 5)) {
                if (!isNewsContent(item.title)) continue;
                if (isCorporateMedia(item.link)) continue;

                const headline = formatHeadline(feed.name, item.title);

                stories.push({
                    headline: headline,
                    url: item.link,
                    source: feed.name,
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    excerpt: item.contentSnippet?.slice(0, 200) || '',
                    imageUrl: getImageUrl(item, feed),
                    type: feed.type,
                    engagement: 0,
                    sourceWeight: feed.weight
                });
            }
        } catch (error) {
            console.error(`Error fetching ${feed.name}:`, error.message);
        }
    }

    return stories;
}

function getImageUrl(item, feed) {
    if (item.enclosure?.url) return item.enclosure.url;

    if (feed.url.includes('youtube.com') && item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }

    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
    }

    return null;
}

function formatHeadline(source, headline) {
    const sourceName = source.toUpperCase();
    const firstName = sourceName.split(' ')[0];

    if (headline.toUpperCase().startsWith(firstName) || headline.toUpperCase().startsWith(sourceName)) {
        return headline;
    }

    return `${sourceName}: ${headline}`;
}

// === UPDATED SCORING - ENGAGEMENT/TRENDING PRIORITY ===
function calculateScore(story) {
    const now = Date.now();
    const storyDate = new Date(story.pubDate).getTime();
    const ageHours = (now - storyDate) / (1000 * 60 * 60);

    // Recency score (max 30 points) - reduced from before
    let recencyScore = 0;
    if (ageHours < 3) recencyScore = 30;
    else if (ageHours < 6) recencyScore = 25;
    else if (ageHours < 12) recencyScore = 20;
    else if (ageHours < 24) recencyScore = 15;
    else if (ageHours < 48) recencyScore = 10;
    else recencyScore = Math.max(0, 5 - (ageHours / 24));

    // Source weight score (max 20 points)
    const sourceScore = (story.sourceWeight || 0.5) * 20;

    // === ENGAGEMENT/TRENDING SCORE (max 50 points) - NOW PRIMARY FACTOR ===
    let engagementScore = 5;
    if (story.type === 'tweet' && story.engagement) {
        // Logarithmic scale for engagement
        // 100 engagement = ~15 points, 1000 = ~25 points, 10000 = ~35 points, 100000 = ~45 points
        engagementScore = Math.min(50, 5 + Math.log10(story.engagement + 1) * 10);
    }

    return recencyScore + sourceScore + engagementScore;
}

// === APPLY SOURCE DIVERSITY CAP PER SECTION ===
function applySourceCap(stories, maxPerSource) {
    const sourceCounts = {};
    return stories.filter(story => {
        const source = story.source.toLowerCase();
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        return sourceCounts[source] <= maxPerSource;
    });
}

async function refreshStories() {
    console.log('Refreshing stories...');

    try {
        const [xPosts, rssStories] = await Promise.all([fetchXPosts(), fetchRSSFeeds()]);

        console.log(`Fetched ${xPosts.length} X posts, ${rssStories.length} RSS items`);

        // Score all stories
        const scoredXPosts = xPosts.map(story => ({ ...story, score: calculateScore(story) }));
        const scoredRSS = rssStories.map(story => ({ ...story, score: calculateScore(story) }));

        // Sort by score (trending/engagement priority)
        scoredXPosts.sort((a, b) => b.score - a.score);
        scoredRSS.sort((a, b) => b.score - a.score);

        // Separate videos and articles
        const videos = scoredRSS.filter(s => s.type === 'video');
        const articles = scoredRSS.filter(s => s.type === 'article');

        // Apply source cap PER SECTION (Option B: 2 per source per section)
        cachedTweets = applySourceCap(scoredXPosts, MAX_PER_SOURCE_PER_SECTION);
        cachedVideos = applySourceCap(videos, MAX_PER_SOURCE_PER_SECTION);
        cachedArticles = applySourceCap(articles, MAX_PER_SOURCE_PER_SECTION);

        // Combined feed for top 10 (also capped)
        const allStories = [...scoredXPosts, ...scoredRSS];
        allStories.sort((a, b) => b.score - a.score);
        cachedStories = applySourceCap(allStories, MAX_PER_SOURCE_PER_SECTION);

        lastFetch = new Date();

        console.log(`Cached: ${cachedTweets.length} tweets, ${cachedVideos.length} videos, ${cachedArticles.length} articles`);
        console.log(`Total combined: ${cachedStories.length} stories`);

    } catch (error) {
        console.error('Error refreshing stories:', error);
    }
}

// === API ENDPOINTS ===

// All stories combined
app.get('/api/stories', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ 
        stories: cachedStories.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: cachedStories.length 
    });
});

// Top 10 trending
app.get('/api/top10', (req, res) => {
    const top10 = cachedStories.slice(0, 10).map((story, index) => ({
        rank: index + 1, 
        headline: story.headline, 
        url: story.url, 
        source: story.source, 
        type: story.type,
        engagement: story.engagement || 0,
        hot: index < 3
    }));
    res.json({ top10, lastUpdated: lastFetch });
});

// Tweets only
app.get('/api/tweets', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({ 
        tweets: cachedTweets.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: cachedTweets.length 
    });
});

// Videos only
app.get('/api/videos', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({ 
        videos: cachedVideos.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: cachedVideos.length 
    });
});

// Articles only
app.get('/api/articles', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({ 
        articles: cachedArticles.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: cachedArticles.length 
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        stories: cachedStories.length,
        tweets: cachedTweets.length,
        videos: cachedVideos.length,
        articles: cachedArticles.length,
        lastFetch: lastFetch, 
        uptime: process.uptime() 
    });
});

app.get('/api/refresh', async (req, res) => {
    await refreshStories();
    res.json({ 
        success: true, 
        count: cachedStories.length,
        tweets: cachedTweets.length,
        videos: cachedVideos.length,
        articles: cachedArticles.length
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

refreshStories().then(() => {
    app.listen(PORT, () => { 
        console.log(`McMahon.News server running on port ${PORT}`); 
    });
});

// Refresh every 15 minutes
setInterval(refreshStories, 15 * 60 * 1000);

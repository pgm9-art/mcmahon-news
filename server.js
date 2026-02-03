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

// === X ACCOUNTS (Primary news source) ===
const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson', weight: 1.0 },
    { handle: 'ggreenwald', name: 'Glenn Greenwald', weight: 1.0 },
    { handle: 'NickJFuentes', name: 'Nick Fuentes', weight: 1.0 },
    { handle: 'OwenShroyer', name: 'Owen Shroyer', weight: 1.0 },
    { handle: 'shellenberger', name: 'Michael Shellenberger', weight: 1.0 },
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

// === VIDEO FEEDS (YouTube + Rumble) ===
const VIDEO_FEEDS = [
    // YouTube channels
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsox8LQ1disc39gKMO7SBDg', weight: 1.0 },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7MpzwYC_T_V1HvxSWu9f0g', weight: 1.0 },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCULvqbr5KVJqa5cMGvfgx7A', weight: 1.0 },
    { name: 'Jimmy Dore', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3M7l8ved_rYQ45AVzS0RGA', weight: 1.0 },
    { name: 'Bret Weinstein', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCi5N_uAqApEUIlg32QzkPlg', weight: 1.0 },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6gH70EPp8QQjRfEcW2t4uA', weight: 1.0 },
    { name: 'The Grayzone', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEXR8pRTkE2vFeJePNe9UcQ', weight: 1.0 },
    { name: 'Owen Shroyer', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCVt4pCBSXMqmNbIpvx1Rary', weight: 1.0 },
    { name: 'Glenn Greenwald', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC_IjKSS2HjhjBrC3Xb-qSdg', weight: 1.0 },
    { name: 'The Young Turks', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1yBKRuGpC1tSM73A0ZjYjQ', weight: 1.0 },
    // Rumble - Nick Fuentes
    { name: 'Nick Fuentes', url: 'https://rumble.com/c/NickJFuentes/feed', weight: 1.0, platform: 'rumble' }
];

// === ARTICLE FEEDS ===
const ARTICLE_FEEDS = [
    { name: 'Glenn Greenwald', url: 'https://greenwald.substack.com/feed', weight: 1.0 },
    { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed', weight: 1.0 },
    { name: 'The Grayzone', url: 'https://thegrayzone.com/feed/', weight: 1.0 },
    { name: 'Michael Shellenberger', url: 'https://public.substack.com/feed', weight: 1.0 }
];

// === SOURCE DIVERSITY: 1 post per source per section ===
const MAX_PER_SOURCE_PER_SECTION = 1;

// Words that indicate NON-news content (filter these out)
const NON_NEWS_FILTERS = [
    'episode', 'ep.', 'ep ', 'podcast', 'full show', 'full episode',
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

// In-memory cache
let cachedTweets = [];
let cachedVideos = [];
let cachedArticles = [];
let lastFetch = null;

// Check if headline is actual news
function isNewsContent(headline) {
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
}

// Check if URL is from corporate media
function isCorporateMedia(url) {
    if (!url) return false;
    return CORPORATE_BLACKLIST.some(domain => url.toLowerCase().includes(domain));
}

// Get video thumbnail URL
function getVideoThumbnail(item, feed) {
    // YouTube thumbnail
    if (feed.url.includes('youtube.com') && item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    
    // Rumble thumbnail from enclosure or media
    if (item.enclosure?.url) return item.enclosure.url;
    
    // Try to extract from content
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
    }
    
    // Rumble specific - try media:thumbnail
    if (item['media:thumbnail']?.$.url) return item['media:thumbnail'].$.url;
    
    return null;
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
                        headline: headline,
                        url: `https://x.com/${account.handle}/status/${tweet.id}`,
                        source: account.name,
                        sourceHandle: account.handle,
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

// Fetch video feeds
async function fetchVideoFeeds() {
    const videos = [];

    for (const feed of VIDEO_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);

            for (const item of parsed.items.slice(0, 5)) {
                if (!isNewsContent(item.title)) continue;

                const thumbnail = getVideoThumbnail(item, feed);

                videos.push({
                    headline: item.title,
                    url: item.link,
                    source: feed.name,
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    imageUrl: thumbnail,
                    type: 'video',
                    platform: feed.platform || 'youtube',
                    engagement: 0,
                    sourceWeight: feed.weight
                });
            }
        } catch (error) {
            console.error(`Error fetching videos from ${feed.name}:`, error.message);
        }
    }

    return videos;
}

// Fetch article feeds
async function fetchArticleFeeds() {
    const articles = [];

    for (const feed of ARTICLE_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);

            for (const item of parsed.items.slice(0, 5)) {
                if (!isNewsContent(item.title)) continue;
                if (isCorporateMedia(item.link)) continue;

                articles.push({
                    headline: item.title,
                    url: item.link,
                    source: feed.name,
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    excerpt: item.contentSnippet?.slice(0, 200) || '',
                    type: 'article',
                    engagement: 0,
                    sourceWeight: feed.weight
                });
            }
        } catch (error) {
            console.error(`Error fetching articles from ${feed.name}:`, error.message);
        }
    }

    return articles;
}

// Score stories for ranking
function calculateScore(story) {
    const now = Date.now();
    const storyDate = new Date(story.pubDate).getTime();
    const ageHours = (now - storyDate) / (1000 * 60 * 60);

    let recencyScore = 0;
    if (ageHours < 3) recencyScore = 30;
    else if (ageHours < 6) recencyScore = 25;
    else if (ageHours < 12) recencyScore = 20;
    else if (ageHours < 24) recencyScore = 15;
    else if (ageHours < 48) recencyScore = 10;
    else recencyScore = Math.max(0, 5 - (ageHours / 24));

    const sourceScore = (story.sourceWeight || 0.5) * 20;

    let engagementScore = 5;
    if (story.type === 'tweet' && story.engagement) {
        engagementScore = Math.min(50, 5 + Math.log10(story.engagement + 1) * 10);
    }

    return recencyScore + sourceScore + engagementScore;
}

// Get only highest-engagement post per source
function getTopPostPerSource(stories, maxPerSource = 1) {
    const sorted = [...stories].sort((a, b) => b.score - a.score);
    
    const sourceCounts = {};
    return sorted.filter(story => {
        const source = story.source.toLowerCase();
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        return sourceCounts[source] <= maxPerSource;
    });
}

async function refreshStories() {
    console.log('Refreshing stories...');

    try {
        const [xPosts, videos, articles] = await Promise.all([
            fetchXPosts(),
            fetchVideoFeeds(),
            fetchArticleFeeds()
        ]);

        console.log(`Fetched ${xPosts.length} X posts, ${videos.length} videos, ${articles.length} articles`);

        // Score all stories
        const scoredXPosts = xPosts.map(story => ({ ...story, score: calculateScore(story) }));
        const scoredVideos = videos.map(story => ({ ...story, score: calculateScore(story) }));
        const scoredArticles = articles.map(story => ({ ...story, score: calculateScore(story) }));

        // Apply: 1 post per source per section (highest engagement wins)
        cachedTweets = getTopPostPerSource(scoredXPosts, MAX_PER_SOURCE_PER_SECTION);
        cachedVideos = getTopPostPerSource(scoredVideos, MAX_PER_SOURCE_PER_SECTION);
        cachedArticles = getTopPostPerSource(scoredArticles, MAX_PER_SOURCE_PER_SECTION);

        lastFetch = new Date();

        console.log(`Cached: ${cachedTweets.length} tweets, ${cachedVideos.length} videos, ${cachedArticles.length} articles`);
        console.log(`Video sources: ${cachedVideos.map(v => v.source).join(', ')}`);

    } catch (error) {
        console.error('Error refreshing stories:', error);
    }
}

// === API ENDPOINTS ===

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

// All stories combined (legacy)
app.get('/api/stories', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const allStories = [...cachedTweets, ...cachedVideos, ...cachedArticles];
    allStories.sort((a, b) => b.score - a.score);
    res.json({ 
        stories: allStories.slice(0, limit), 
        lastUpdated: lastFetch, 
        count: allStories.length 
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
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

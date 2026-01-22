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

// X accounts to monitor (primary news source)
const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson', weight: 1.0 },
    { handle: 'ggreenwald', name: 'Glenn Greenwald', weight: 1.0 },
    { handle: 'NickJFuentes', name: 'Nick Fuentes', weight: 1.0 },
    { handle: 'Judgenap', name: 'Judge Napolitano', weight: 1.0 },
    { handle: 'ComicDaveSmith', name: 'Dave Smith', weight: 0.9 },
    { handle: 'BreakingPoints', name: 'Breaking Points', weight: 1.0 },
    { handle: 'KrsytalBall', name: 'Krystal Ball', weight: 0.9 },
    { handle: 'esikilar', name: 'Saagar Enjeti', weight: 0.9 },
    { handle: 'DropsiteNews', name: 'Drop Site News', weight: 1.0 },
    { handle: 'RealCandaceO', name: 'Candace Owens', weight: 0.8 },
    { handle: 'WarRoomPandemic', name: 'Steve Bannon', weight: 0.8 },
    { handle: 'Douglasmacgregor', name: 'Col. Macgregor', weight: 0.8 },
    { handle: 'JeffreySachs', name: 'Jeffrey Sachs', weight: 0.8 },
    { handle: 'RedactedNews', name: 'Redacted', weight: 0.8 },
    { handle: 'mtaibbi', name: 'Matt Taibbi', weight: 0.5 },
    { handle: 'MaxBlumenthal', name: 'Max Blumenthal', weight: 0.7 },
    { handle: 'ScottRitter', name: 'Scott Ritter', weight: 0.7 }
];

// RSS feeds for articles/videos (secondary source - filtered for news)
const RSS_FEEDS = [
    { name: 'Glenn Greenwald', url: 'https://greenwald.substack.com/feed', weight: 1.0, type: 'article' },
    { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed', weight: 1.0, type: 'article' },
    { name: 'The Grayzone', url: 'https://thegrayzone.com/feed/', weight: 0.8, type: 'article' },
    { name: 'Matt Taibbi', url: 'https://www.racket.news/feed', weight: 0.5, type: 'article' },
    { name: 'Seymour Hersh', url: 'https://seymourhersh.substack.com/feed', weight: 0.7, type: 'article' },
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsox8LQ1disc39gKMO7SBDg', weight: 1.0, type: 'video' },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7MpzwYC_T_V1HvxSWu9f0g', weight: 1.0, type: 'video' },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCULvqbr5KVJqa5cMGvfgx7A', weight: 1.0, type: 'video' },
    { name: 'Redacted', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCR-dJMi0d8BXxj5PTGCP12Q', weight: 0.8, type: 'video' }
];

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

// In-memory cache
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
            // Get user ID first
            const userResponse = await fetch(
                `https://api.twitter.com/2/users/by/username/${account.handle}`,
                {
                    headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` }
                }
            );
            
            if (!userResponse.ok) continue;
            const userData = await userResponse.json();
            if (!userData.data) continue;
            
            const userId = userData.data.id;
            
            // Get recent tweets
            const tweetsResponse = await fetch(
                `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
                {
                    headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` }
                }
            );
            
            if (!tweetsResponse.ok) continue;
            const tweetsData = await tweetsResponse.json();
            
            if (tweetsData.data) {
                for (const tweet of tweetsData.data) {
                    // Skip if not news-like content
                    if (!isNewsContent(tweet.text)) continue;
                    
                    // Skip very short tweets (likely not news)
                    if (tweet.text.length < 50) continue;
                    
                    // Create headline from tweet (first 150 chars or first sentence)
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
                            (tweet.public_metrics.like_count + tweet.public_metrics.retweet_count * 2) : 0,
                        sourceWeight: account.weight
                    });
                }
            }
            
            // Rate limiting - small delay between requests
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
                // Skip non-news content
                if (!isNewsContent(item.title)) continue;
                
                // Skip corporate media links
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
                    sourceWeight: feed.weight
                });
            }
        } catch (error) {
            console.error(`Error fetching ${feed.name}:`, error.message);
        }
    }
    
    return stories;
}

// Get image URL from feed item
function getImageUrl(item, feed) {
    if (item.enclosure?.url) return item.enclosure.url;
    
    // YouTube thumbnail
    if (feed.url.includes('youtube.com') && item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    
    // Extract from content
    if (item.content) {
        const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) return imgMatch[1];
    }
    
    return null;
}

// Format headline with source name
function formatHeadline(source, headline) {
    const sourceName = source.toUpperCase();
    const firstName = sourceName.split(' ')[0];
    if (headline.toUpperCase().startsWith(firstName) || headline.toUpperCase().startsWith(sourceName)) {
        return headline;
    }
    return `${sourceName}: ${headline}`;
}

// Calculate story score
function calculateScore(story) {
    const now = Date.now();
    const storyDate = new Date(story.pubDate).getTime();
    const ageHours = (now - storyDate) / (1000 * 60 * 60);
    
    // Recency score (50%) - news is time-sensitive
    let recencyScore = 0;
    if (ageHours < 3) {
        recencyScore = 50;
    } else if (ageHours < 6) {
        recencyScore = 45;
    } else if (ageHours < 12) {
        recencyScore = 35;
    } else if (ageHours < 24) {
        recencyScore = 20;
    } else {
        recencyScore = Math.max(0, 10 - (ageHours / 12));
    }
    
    // Source weight (30%)
    const sourceScore = (story.sourceWeight || 0.5) * 30;
    
    // Engagement boost for tweets (20%)
    let engagementScore = 10;
    if (story.type === 'tweet' && story.engagement) {
        engagementScore = Math.min(20, 10 + Math.log10(story.engagement + 1) * 3);
    }
    
    return recencyScore + sourceScore + engagementScore;
}

// Refresh stories
async function refreshStories() {
    console.log('Refreshing stories...');
    
    try {
        // Fetch from both sources
        const [xPosts, rssStories] = await Promise.all([
            fetchXPosts(),
            fetchRSSFeeds()
        ]);
        
        console.log(`Fetched ${xPosts.length} X posts, ${rssStories.length} RSS items`);
        
        // Combine all stories
        const allStories = [...xPosts, ...rssStories];
        
        // Score stories
        const scored = allStories.map(story => ({
            ...story,
            score: calculateScore(story)
        }));

        // Sort by score
        scored.sort((a, b) => b.score - a.score);

        // Limit to 3 stories per source for diversity
        const sourceCounts = {};
        const diverseStories = scored.filter(story => {
            const source = story.source.toLowerCase();
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            return sourceCounts[source] <= 3;
        });

        cachedStories = diverseStories;
        lastFetch = new Date();
        
        console.log(`Cached ${cachedStories.length} stories from ${Object.keys(sourceCounts).length} sources`);
    } catch (error) {
        console.error('Error refreshing stories:', error);
    }
}

// API Routes
app.get('/api/stories', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        stories: cachedStories.slice(0, limit),
        lastUpdated: lastFetch,
        count: cachedStories.length
    });
});

app.get('/api/top10', (req, res) => {
    const top10 = cachedStories.slice(0, 10).map((story, index) => ({
        rank: index + 1,
        headline: story.headline,
        url: story.url,
        source: story.source,
        hot: index < 3
    }));
    
    res.json({ top10, lastUpdated: lastFetch });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        stories: cachedStories.length,
        lastFetch: lastFetch,
        uptime: process.uptime()
    });
});

app.get('/api/refresh', async (req, res) => {
    await refreshStories();
    res.json({ success: true, count: cachedStories.length });
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Initial fetch and start server
refreshStories().then(() => {
    app.listen(PORT, () => {
        console.log(`McMahon.News server running on port ${PORT}`);
    });
});

// Refresh every 15 minutes (news moves fast)
setInterval(refreshStories, 15 * 60 * 1000);

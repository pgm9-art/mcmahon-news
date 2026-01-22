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

// X/Twitter handles to monitor
const X_HANDLES = [
    'TuckerCarlson', 'mtaibbi', 'ggreenwald', 'BreakingPoints',
    'DropsiteNews', 'RealCandaceO', 'NickJFuentes', 'WarRoomPandemic',
    'ComicDaveSmith', 'joerogan', 'TimDillon', 'RedactedNews',
    'Judgenap', 'JeffreySachs', 'Harrisonhill66', 'ScottRitter',
    'MaxBlumenthal', 'SesHersh', 'ShshoenbergeDr', 'KrstyalBall', 'esaajar'
];

// RSS feeds for independent sources
const RSS_FEEDS = [
    { name: 'Breaking Points', url: 'https://breakingpoints.com/feed/', weight: 1.0 },
    { name: 'Glenn Greenwald', url: 'https://greenwald.substack.com/feed', weight: 1.0 },
    { name: 'Matt Taibbi', url: 'https://www.racket.news/feed', weight: 1.0 },
    { name: 'Seymour Hersh', url: 'https://seymourhersh.substack.com/feed', weight: 1.0 },
    { name: 'Michael Shellenberger', url: 'https://public.substack.com/feed', weight: 0.9 },
    { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed', weight: 1.0 },
    { name: 'The Grayzone', url: 'https://thegrayzone.com/feed/', weight: 0.9 },
    { name: 'Redacted', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCR-dJMi0d8BXxj5PTGCP12Q', weight: 0.85 },
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsox8LQ1disc39gKMO7SBDg', weight: 1.0 },
    { name: 'Joe Rogan', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCzQUP1qoWDoEbmsQxvdjxgQ', weight: 0.9 },
    { name: 'Tim Dillon', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4woSp8ITBoYDmjkukhEhxg', weight: 0.85 },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7MpzwYC_T_V1HvxSWu9f0g', weight: 0.9 },
    { name: 'Part of the Problem', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKMijXgeVTgP4C8EXVSs7Sw', weight: 0.9 },
    { name: 'Rumble Trending', url: 'https://rumble.com/feeds/videos', weight: 0.7 }
];

// Corporate media blacklist
const CORPORATE_BLACKLIST = [
    'nytimes.com', 'washingtonpost.com', 'cnn.com', 'foxnews.com', 'msnbc.com',
    'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'wsj.com', 'usatoday.com',
    'reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com', 'politico.com',
    'thehill.com', 'axios.com', 'huffpost.com', 'vox.com', 'vice.com',
    'buzzfeed.com', 'dailybeast.com', 'slate.com', 'salon.com', 'motherjones.com',
    'thedailywire.com', 'breitbart.com', 'newsmax.com', 'oann.com', 'theblaze.com',
    'nationalreview.com', 'weeklystandard.com', 'nypost.com', 'dailymail.co.uk',
    'forbes.com', 'bloomberg.com', 'businessinsider.com', 'cnbc.com', 'ft.com',
    'time.com', 'newsweek.com', 'usnews.com', 'latimes.com', 'chicagotribune.com'
];

// In-memory cache
let cachedStories = [];
let lastFetch = null;

// Check if URL is from corporate media
function isCorporateMedia(url) {
    if (!url) return false;
    return CORPORATE_BLACKLIST.some(domain => url.toLowerCase().includes(domain));
}

// Calculate story score
function calculateScore(story) {
    const now = Date.now();
    const ageHours = (now - new Date(story.pubDate).getTime()) / (1000 * 60 * 60);
    
    // Recency score (30%)
    const recencyScore = Math.max(0, 1 - (ageHours / 24)) * 30;
    
    // Engagement velocity (25%) - simulated based on source weight
    const engagementScore = (story.sourceWeight || 0.5) * 25;
    
    // Source weight (20%)
    const sourceScore = (story.sourceWeight || 0.5) * 20;
    
    // Topic clustering bonus (15%) - boost if multiple sources cover same topic
    const clusterScore = (story.clusterCount || 1) * 5;
    
    // Content type bonus (10%)
    const contentBonus = story.hasVideo ? 10 : story.hasImage ? 7 : 5;
    
    return recencyScore + engagementScore + sourceScore + Math.min(clusterScore, 15) + contentBonus;
}

// Fetch RSS feeds
async function fetchRSSFeeds() {
    const stories = [];
    
    for (const feed of RSS_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);
            
            for (const item of parsed.items.slice(0, 10)) {
                if (isCorporateMedia(item.link)) continue;
                
                stories.push({
                    headline: item.title,
                    url: item.link,
                    source: feed.name,
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    excerpt: item.contentSnippet?.slice(0, 200) || '',
                    imageUrl: item.enclosure?.url || extractImageFromContent(item.content) || null,
                    hasVideo: feed.url.includes('youtube.com') || feed.url.includes('rumble.com'),
                    hasImage: true,
                    sourceWeight: feed.weight
                });
            }
        } catch (error) {
            console.error(`Error fetching ${feed.name}:`, error.message);
        }
    }
    
    return stories;
}

// Extract image from content
function extractImageFromContent(content) {
    if (!content) return null;
    const match = content.match(/<img[^>]+src="([^">]+)"/);
    return match ? match[1] : null;
}

// Format headline with source name
function formatHeadline(source, headline) {
    const sourceName = source.toUpperCase().split(' ')[0];
    if (headline.toUpperCase().startsWith(sourceName)) {
        return headline;
    }
    return `${sourceName}: ${headline}`;
}

// Refresh stories
async function refreshStories() {
    console.log('Refreshing stories...');
    
    try {
        const rssStories = await fetchRSSFeeds();
        
        // Score and sort stories
        const scored = rssStories.map(story => ({
            ...story,
            score: calculateScore(story),
            headline: formatHeadline(story.source, story.headline)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        
        cachedStories = scored;
        lastFetch = new Date();
        
        console.log(`Cached ${cachedStories.length} stories`);
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
        hot: story.score > 70,
        imageUrl: story.imageUrl
    }));
    
    res.json({ top10, lastUpdated: lastFetch });
});

app.get('/api/breaking', (req, res) => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const breaking = cachedStories.filter(s => 
        new Date(s.pubDate).getTime() > oneHourAgo
    ).slice(0, 5);
    
    res.json({ breaking, lastUpdated: lastFetch });
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

// Refresh every hour

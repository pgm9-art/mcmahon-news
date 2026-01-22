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

// Source weights - prioritize daily content creators
const SOURCE_WEIGHTS = {
    // Top Tier - Daily content
    'Tucker Carlson': 1.0,
    'Glenn Greenwald': 1.0,
    'Nick Fuentes': 1.0,
    'Judge Napolitano': 1.0,
    'Dave Smith': 1.0,
    'Breaking Points': 1.0,
    'Drop Site News': 1.0,
    'Redacted': 1.0,
    
    // Mid Tier
    'Candace Owens': 0.7,
    'Steve Bannon': 0.7,
    'Col. Macgregor': 0.7,
    'Jeffrey Sachs': 0.7,
    'Tim Dillon': 0.7,
    'Joe Rogan': 0.7,
    'Max Blumenthal': 0.7,
    'The Grayzone': 0.7,
    
    // Lower Tier - Less frequent content
    'Matt Taibbi': 0.4,
    'Seymour Hersh': 0.4,
    'Michael Shellenberger': 0.4
};

// RSS feeds for independent sources
const RSS_FEEDS = [
    // Top Tier - Daily
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsox8LQ1disc39gKMO7SBDg', weight: 1.0 },
    { name: 'Glenn Greenwald', url: 'https://greenwald.substack.com/feed', weight: 1.0 },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCULvqbr5KVJqa5cMGvfgx7A', weight: 1.0 },
    { name: 'Drop Site News', url: 'https://www.dropsitenews.com/feed', weight: 1.0 },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC7MpzwYC_T_V1HvxSWu9f0g', weight: 1.0 },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCKMijXgeVTgP4C8EXVSs7Sw', weight: 1.0 },
    { name: 'Nick Fuentes', url: 'https://rumble.com/c/CozyTV/feed', weight: 1.0 },
    { name: 'Redacted', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCR-dJMi0d8BXxj5PTGCP12Q', weight: 1.0 },
    
    // Mid Tier
    { name: 'Steve Bannon', url: 'https://rumble.com/c/Warroom/feed', weight: 0.7 },
    { name: 'Tim Dillon', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC4woSp8ITBoYDmjkukhEhxg', weight: 0.7 },
    { name: 'Joe Rogan', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCzQUP1qoWDoEbmsQxvdjxgQ', weight: 0.7 },
    { name: 'The Grayzone', url: 'https://thegrayzone.com/feed/', weight: 0.7 },
    
    // Lower Tier - Less frequent
    { name: 'Matt Taibbi', url: 'https://www.racket.news/feed', weight: 0.4 },
    { name: 'Seymour Hersh', url: 'https://seymourhersh.substack.com/feed', weight: 0.4 },
    { name: 'Michael Shellenberger', url: 'https://public.substack.com/feed', weight: 0.4 }
];

// Corporate media blacklist
const CORPORATE_BLACKLIST = [
    'nytimes.com', 'washingtonpost.com', 'cnn.com', 'foxnews.com', 'msnbc.com',
    'nbcnews.com', 'abcnews.go.com', 'cbsnews.com', 'wsj.com', 'usatoday.com',
    'reuters.com', 'apnews.com', 'bbc.com', 'theguardian.com', 'politico.com',
    'thehill.com', 'axios.com', 'huffpost.com', 'vox.com', 'vice.com',
    'buzzfeed.com', 'dailybeast.com', 'slate.com', 'salon.com', 'motherjones.com',
    'thedailywire.com', 'breitbart.com', 'newsmax.com', 'oann.com', 'theblaze.com',
    'nationalreview.com', 'nypost.com', 'dailymail.co.uk',
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

// Calculate story score with strong recency boost
function calculateScore(story) {
    const now = Date.now();
    const storyDate = new Date(story.pubDate).getTime();
    const ageHours = (now - storyDate) / (1000 * 60 * 60);
    
    // Strong recency score (40%) - last 6 hours get big boost
    let recencyScore = 0;
    if (ageHours < 6) {
        recencyScore = 40;
    } else if (ageHours < 12) {
        recencyScore = 35;
    } else if (ageHours < 24) {
        recencyScore = 25;
    } else if (ageHours < 48) {
        recencyScore = 15;
    } else {
        recencyScore = Math.max(0, 10 - (ageHours / 24));
    }
    
    // Source weight (40%)
    const sourceWeight = story.sourceWeight || 0.5;
    const sourceScore = sourceWeight * 40;
    
    // Content type bonus (20%)
    const contentBonus = story.hasVideo ? 20 : story.hasImage ? 15 : 10;
    
    return recencyScore + sourceScore + contentBonus;
}

// Fetch RSS feeds
async function fetchRSSFeeds() {
    const stories = [];
    
    for (const feed of RSS_FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);
            
            for (const item of parsed.items.slice(0, 5)) {
                if (isCorporateMedia(item.link)) continue;
                
                stories.push({
                    headline: item.title,
                    url: item.link,
                    source: feed.name,
                    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
                    excerpt: item.contentSnippet?.slice(0, 200) || '',
                    imageUrl: item.enclosure?.url || extractImageFromContent(item.content) || getYouTubeThumbnail(item.link),
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

// Get YouTube thumbnail from URL
function getYouTubeThumbnail(url) {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (match) {
        return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    return null;
}

// Extract image from content
function extractImageFromContent(content) {
    if (!content) return null;
    const match = content.match(/<img[^>]+src="([^">]+)"/);
    return match ? match[1] : null;
}

// Format headline with source name
function formatHeadline(source, headline) {
    const sourceName = source.toUpperCase();
    const firstName = sourceName.split(' ')[0];
    if (headline.toUpperCase().startsWith(firstName)) {
        return headline;
    }
    return `${sourceName}: ${headline}`;
}

// Refresh stories
async function refreshStories() {
    console.log('Refreshing stories...');
    
    try {
        const rssStories = await fetchRSSFeeds();
        
        // Score stories
        const scored = rssStories.map(story => ({
            ...story,
            score: calculateScore(story),
            headline: formatHeadline(story.source, story.headline)
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
        hot: story.score > 60,
        imageUrl: story.imageUrl
    }));
    
    res.json({ top10, lastUpdated: lastFetch });
});

app.get('/api/breaking', (req, res) => {
    const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
    const breaking = cachedStories.filter(s => 
        new Date(s.pubDate).getTime() > sixHoursAgo
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

// Refresh every 30 minutes
setInterval(refreshStories, 30 * 60 * 1000);

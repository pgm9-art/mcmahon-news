const RSSParser = require('rss-parser');

const parser = new RSSParser({
    customFields: {
        item: [['media:group', 'mediaGroup']]
    }
});

const VIDEO_FEEDS = [
    { name: 'Tucker Carlson', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCjjBjVc0b1cIpNGEeZtS2lg' },
    { name: 'Judge Napolitano', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDkEYb-TXJVWLv0okshtlsw' },
    { name: 'Breaking Points', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDRIjKy6eZ0vKt0ELtTdeUA' },
    { name: 'Jimmy Dore', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC3M718ved_rYQ45AVzS0RGA' },
    { name: 'Bret Weinstein', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCi5N_uAqApEUIlg32QzkPlg' },
    { name: 'Dave Smith', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEfe80CP2cs1eLRNQazffZw' },
    { name: 'The Grayzone', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCEXR8pRTkE2vFeJePNe9UcQ' },
    { name: 'Glenn Greenwald', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UChzVhAwzGR7hV-408ZmBLHg' },
    { name: 'The Young Turks', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC1yBKRuGpC1tSM73A0ZjYjQ' },
    { name: 'Owen Shroyer', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC-hW9CchHhAEZNfPgkMpysg' },
    { name: 'Nick Fuentes', url: 'https://openrss.org/rumble.com/c/NickJFuentes', platform: 'rumble' }
];

const MAX_PER_SOURCE = 3;
const NON_NEWS_FILTERS = ['subscribe', 'join us', 'live stream starting', 'going live', 'trailer', 'preview'];

function isNewsContent(headline) {
    if (!headline) return false;
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
}

function getVideoThumbnail(item) {
    if (item.link) {
        const match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    if (item.mediaGroup && item.mediaGroup['media:thumbnail']) {
        const thumb = item.mediaGroup['media:thumbnail'];
        if (Array.isArray(thumb) && thumb[0] && thumb[0].$) return thumb[0].$.url;
        if (thumb && thumb.$) return thumb.$.url;
    }
    return null;
}

function timeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 172800) return 'yesterday';
    return Math.floor(seconds / 86400) + 'd ago';
}

function sortByRecency(items) {
    return items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

function limitPerSource(items, max) {
    const counts = {};
    return items.filter(item => {
        const src = item.source.toLowerCase();
        counts[src] = (counts[src] || 0) + 1;
        return counts[src] <= max;
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    try {
        const limit = parseInt(req.query.limit) || 20;
        const videos = [];
        const errors = [];
        
        const results = await Promise.allSettled(
            VIDEO_FEEDS.map(async (feed) => {
                try {
                    const parsed = await parser.parseURL(feed.url);
                    if (parsed.items && parsed.items.length > 0) {
                        const feedVideos = [];
                        for (const item of parsed.items.slice(0, 5)) {
                            if (!isNewsContent(item.title)) continue;
                            const pubDate = item.pubDate || item.isoDate || new Date().toISOString();
                            feedVideos.push({
                                headline: item.title,
                                url: item.link,
                                source: feed.name,
                                pubDate: pubDate,
                                timeAgo: timeAgo(pubDate),
                                imageUrl: getVideoThumbnail(item),
                                type: 'video',
                                platform: feed.platform || 'youtube'
                            });
                        }
                        return { feed: feed, videos: feedVideos };
                    }
                    return { feed: feed, videos: [] };
                } catch (error) {
                    return { feed: feed, error: error.message };
                }
            })
        );
        
        for (const result of results) {
            if (result.status === 'fulfilled') {
                if (result.value.videos) videos.push(...result.value.videos);
                if (result.value.error) errors.push(result.value.feed.name + ': ' + result.value.error);
            }
        }
        
        const sorted = sortByRecency(videos);
        const limited = limitPerSource(sorted, MAX_PER_SOURCE);
        
        res.status(200).json({
            videos: limited.slice(0, limit),
            count: limited.length,
            errors: errors.slice(0, 10),
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, videos: [] });
    }
};

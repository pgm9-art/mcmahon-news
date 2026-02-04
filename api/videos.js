const RSSParser = require('rss-parser');

const parser = new RSSParser({
    customFields: {
        item: [['media:group', 'mediaGroup'], ['media:thumbnail', 'mediaThumbnail']]
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
    var lower = headline.toLowerCase();
    for (var i = 0; i < NON_NEWS_FILTERS.length; i++) {
        if (lower.indexOf(NON_NEWS_FILTERS[i]) !== -1) return false;
    }
    return true;
}

function getVideoThumbnail(item, platform, feedName) {
    // Try YouTube thumbnail from link
    if (item.link) {
        var match = item.link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
        if (match) return 'https://img.youtube.com/vi/' + match[1] + '/hqdefault.jpg';
    }
    
    // Try media:group thumbnail
    if (item.mediaGroup && item.mediaGroup['media:thumbnail']) {
        var thumb = item.mediaGroup['media:thumbnail'];
        if (Array.isArray(thumb) && thumb[0] && thumb[0].$) return thumb[0].$.url;
        if (thumb && thumb.$) return thumb.$.url;
    }
    
    // Try media:thumbnail directly
    if (item.mediaThumbnail) {
        if (Array.isArray(item.mediaThumbnail) && item.mediaThumbnail[0]) {
            if (item.mediaThumbnail[0].$ && item.mediaThumbnail[0].$.url) return item.mediaThumbnail[0].$.url;
            if (typeof item.mediaThumbnail[0] === 'string') return item.mediaThumbnail[0];
        }
        if (item.mediaThumbnail.$ && item.mediaThumbnail.$.url) return item.mediaThumbnail.$.url;
    }
    
    // Try enclosure
    if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.indexOf('image') !== -1) {
        return item.enclosure.url;
    }
    
    // Rumble fallback - use a placeholder with channel branding
    if (platform === 'rumble') {
        return 'https://placehold.co/640x360/1a1a2e/ffffff?text=' + encodeURIComponent(feedName);
    }
    
    return null;
}

function timeAgo(dateString) {
    var now = new Date();
    var date = new Date(dateString);
    var seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 172800) return 'yesterday';
    return Math.floor(seconds / 86400) + 'd ago';
}

function sortByRecency(items) {
    return items.sort(function(a, b) {
        return new Date(b.pubDate) - new Date(a.pubDate);
    });
}

function limitPerSource(items, max) {
    var counts = {};
    return items.filter(function(item) {
        var src = item.source.toLowerCase();
        counts[src] = (counts[src] || 0) + 1;
        return counts[src] <= max;
    });
}

module.exports = async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    
    try {
        var limit = parseInt(req.query.limit) || 20;
        var videos = [];
        var errors = [];
        
        var results = await Promise.allSettled(
            VIDEO_FEEDS.map(async function(feed) {
                try {
                    var parsed = await parser.parseURL(feed.url);
                    if (parsed.items && parsed.items.length > 0) {
                        var feedVideos = [];
                        var items = parsed.items.slice(0, 5);
                        for (var i = 0; i < items.length; i++) {
                            var item = items[i];
                            if (!isNewsContent(item.title)) continue;
                            var pubDate = item.pubDate || item.isoDate || new Date().toISOString();
                            var platform = feed.platform || 'youtube';
                            feedVideos.push({
                                headline: item.title,
                                url: item.link,
                                source: feed.name,
                                pubDate: pubDate,
                                timeAgo: timeAgo(pubDate),
                                imageUrl: getVideoThumbnail(item, platform, feed.name),
                                type: 'video',
                                platform: platform
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
        
        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            if (result.status === 'fulfilled') {
                if (result.value.videos) {
                    for (var j = 0; j < result.value.videos.length; j++) {
                        videos.push(result.value.videos[j]);
                    }
                }
                if (result.value.error) {
                    errors.push(result.value.feed.name + ': ' + result.value.error);
                }
            }
        }
        
        var sorted = sortByRecency(videos);
        var limited = limitPerSource(sorted, MAX_PER_SOURCE);
        
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

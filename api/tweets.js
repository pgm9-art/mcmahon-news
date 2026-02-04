const fetch = require('node-fetch');

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

const X_ACCOUNTS = [
    { handle: 'TuckerCarlson', name: 'Tucker Carlson' },
    { handle: 'ggreenwald', name: 'Glenn Greenwald' },
    { handle: 'NickJFuentes', name: 'Nick Fuentes' },
    { handle: 'OwenShroyer1776', name: 'Owen Shroyer' },
    { handle: 'JudgeNap', name: 'Judge Napolitano' },
    { handle: 'BreakingPoints', name: 'Breaking Points' },
    { handle: 'jimmy_dore', name: 'Jimmy Dore' },
    { handle: 'BretWeinstein', name: 'Bret Weinstein' },
    { handle: 'ComicDaveSmith', name: 'Dave Smith' },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone' },
    { handle: 'TheYoungTurks', name: 'The Young Turks' },
    { handle: 'DropSiteNews', name: 'Drop Site News' },
    { handle: 'MaxBlumenthal', name: 'Max Blumenthal' },
    { handle: 'AasaWitteveen', name: 'Aasa Witteveen' },
    { handle: 'RealAlexJones', name: 'Alex Jones' }
];

const MAX_PER_SOURCE = 3;
const NON_NEWS_FILTERS = ['subscribe', 'join us', 'live stream starting', 'going live', 'trailer', 'preview'];

function isNewsContent(headline) {
    if (!headline) return false;
    const lower = headline.toLowerCase();
    return !NON_NEWS_FILTERS.some(filter => lower.includes(filter));
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
    
    if (!X_BEARER_TOKEN) {
        return res.status(200).json({
            tweets: [],
            errors: ['No X Bearer Token configured'],
            lastUpdated: new Date().toISOString()
        });
    }
    
    try {
        const limit = parseInt(req.query.limit) || 30;
        const stories = [];
        const errors = [];
        
        const results = await Promise.allSettled(
            X_ACCOUNTS.map(async (account) => {
                try {
                    const userResponse = await fetch(
                        'https://api.twitter.com/2/users/by/username/' + account.handle,
                        { headers: { 'Authorization': 'Bearer ' + X_BEARER_TOKEN } }
                    );
                    
                    if (!userResponse.ok) {
                        return { account: account, error: 'User fetch failed (' + userResponse.status + ')' };
                    }
                    
                    const userData = await userResponse.json();
                    if (!userData.data || !userData.data.id) {
                        return { account: account, error: 'No user data' };
                    }
                    
                    const tweetsResponse = await fetch(
                        'https://api.twitter.com/2/users/' + userData.data.id + '/tweets?max_results=5&tweet.fields=created_at,public_metrics&exclude=retweets,replies',
                        { headers: { 'Authorization': 'Bearer ' + X_BEARER_TOKEN } }
                    );
                    
                    if (!tweetsResponse.ok) {
                        return { account: account, error: 'Tweets fetch failed (' + tweetsResponse.status + ')' };
                    }
                    
                    const tweetsData = await tweetsResponse.json();
                    
                    if (tweetsData.data && tweetsData.data.length > 0) {
                        const accountTweets = [];
                        for (const tweet of tweetsData.data) {
                            if (!isNewsContent(tweet.text) || tweet.text.length < 30) continue;
                            
                            var headline = tweet.text.split('\n')[0];
                            if (headline.length > 200) {
                                headline = headline.substring(0, 197) + '...';
                            }
                            
                            var engagement = 0;
                            if (tweet.public_metrics) {
                                engagement = tweet.public_metrics.like_count + (tweet.public_metrics.retweet_count * 2) + tweet.public_metrics.reply_count;
                            }
                            
                            accountTweets.push({
                                headline: headline,
                                url: 'https://x.com/' + account.handle + '/status/' + tweet.id,
                                source: account.name,
                                sourceHandle: account.handle,
                                pubDate: tweet.created_at,
                                timeAgo: timeAgo(tweet.created_at),
                                type: 'tweet',
                                engagement: engagement
                            });
                        }
                        return { account: account, tweets: accountTweets };
                    }
                    return { account: account, tweets: [] };
                } catch (error) {
                    return { account: account, error: error.message };
                }
            })
        );
        
        for (const result of results) {
            if (result.status === 'fulfilled') {
                if (result.value.tweets) stories.push(...result.value.tweets);
                if (result.value.error) errors.push(result.value.account.handle + ': ' + result.value.error);
            }
        }
        
        const sorted = sortByRecency(stories);
        const limited = limitPerSource(sorted, MAX_PER_SOURCE);
        
        res.status(200).json({
            tweets: limited.slice(0, limit),
            count: limited.length,
            errors: errors.slice(0, 10),
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message, tweets: [] });
    }
};

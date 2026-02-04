const fetch = require('node-fetch');

const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

// 18 X Sources - one tweet per source
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
    { handle: 'shellenberger', name: 'Michael Shellenberger' },
    { handle: 'MarioNawfal', name: 'Mario Nawfal' },
    { handle: 'AFpost', name: 'AF Post' },
    { handle: 'EndWokeness', name: 'End Wokeness' },
    { handle: 'VigilantFox', name: 'Vigilant Fox' },
    { handle: 'realstewpeters', name: 'Stew Peters' }
];

function timeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 172800) return 'yesterday';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return Math.floor(seconds / 604800) + 'w ago';
}

module.exports = async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    
    if (!X_BEARER_TOKEN) {
        return res.status(200).json({
            tweets: [],
            count: 0,
            errors: ['X_BEARER_TOKEN not configured'],
            lastUpdated: new Date().toISOString()
        });
    }
    
    const tweets = [];
    const errors = [];
    
    const results = await Promise.allSettled(
        X_ACCOUNTS.map(async (account) => {
            try {
                const userRes = await fetch(
                    `https://api.twitter.com/2/users/by/username/${account.handle}?user.fields=profile_image_url`,
                    { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
                );
                
                if (!userRes.ok) {
                    throw new Error(`User fetch failed (${userRes.status})`);
                }
                
                const userData = await userRes.json();
                if (!userData.data?.id) {
                    throw new Error('No user data');
                }
                
                const tweetsRes = await fetch(
                    `https://api.twitter.com/2/users/${userData.data.id}/tweets?max_results=5&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
                    { headers: { 'Authorization': `Bearer ${X_BEARER_TOKEN}` } }
                );
                
                if (!tweetsRes.ok) {
                    throw new Error(`Tweets fetch failed (${tweetsRes.status})`);
                }
                
                const tweetsData = await tweetsRes.json();
                
                if (tweetsData.data && tweetsData.data.length > 0) {
                    const tweet = tweetsData.data.find(t => t.text && t.text.length > 20) || tweetsData.data[0];
                    
                    let text = tweet.text;
                    if (text.length > 280) {
                        text = text.substring(0, 277) + '...';
                    }
                    
                    // Get higher res profile image
                    let profileImage = userData.data.profile_image_url || null;
                    if (profileImage) {
                        profileImage = profileImage.replace('_normal', '_400x400');
                    }
                    
                    return {
                        id: tweet.id,
                        text: text,
                        url: `https://x.com/${account.handle}/status/${tweet.id}`,
                        source: account.name,
                        sourceHandle: account.handle,
                        profileImage: profileImage,
                        pubDate: tweet.created_at,
                        timeAgo: timeAgo(tweet.created_at),
                        metrics: tweet.public_metrics || {}
                    };
                }
                return null;
            } catch (error) {
                errors.push(`${account.handle}: ${error.message}`);
                return null;
            }
        })
    );
    
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            tweets.push(result.value);
        }
    });
    
    tweets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    res.status(200).json({
        tweets: tweets,
        count: tweets.length,
        errors: errors.slice(0, 5),
        lastUpdated: new Date().toISOString()
    });
};

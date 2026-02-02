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

// Source metadata with colors and branding
const SOURCE_META = {
        'Tucker Carlson': { color: '#dc2626', logo: 'TC', category: 'video', bias: 'right' },
        'Glenn Greenwald': { color: '#16a34a', logo: 'GG', category: 'journalist', bias: 'independent' },
        'Nick Fuentes': { color: '#7c3aed', logo: 'NF', category: 'commentary', bias: 'right' },
        'Judge Napolitano': { color: '#0369a1', logo: 'JN', category: 'video', bias: 'libertarian' },
        'Dave Smith': { color: '#ca8a04', logo: 'DS', category: 'podcast', bias: 'libertarian' },
        'Breaking Points': { color: '#ea580c', logo: 'BP', category: 'video', bias: 'independent' },
        'Krystal Ball': { color: '#db2777', logo: 'KB', category: 'video', bias: 'left' },
        'Saagar Enjeti': { color: '#0891b2', logo: 'SE', category: 'video', bias: 'right' },
        'Drop Site News': { color: '#059669', logo: 'DS', category: 'investigative', bias: 'left' },
        'Candace Owens': { color: '#be185d', logo: 'CO', category: 'commentary', bias: 'right' },
        'Steve Bannon': { color: '#b91c1c', logo: 'SB', category: 'podcast', bias: 'right' },
        'Col. Macgregor': { color: '#365314', logo: 'CM', category: 'analysis', bias: 'independent' },
        'Jeffrey Sachs': { color: '#1e40af', logo: 'JS', category: 'analysis', bias: 'left' },
        'Redacted': { color: '#7c2d12', logo: 'RD', category: 'video', bias: 'independent' },
        'Matt Taibbi': { color: '#4338ca', logo: 'MT', category: 'journalist', bias: 'independent' },
        'Max Blumenthal': { color: '#166534', logo: 'MB', category: 'journalist', bias: 'left' },
        'Scott Ritter': { color: '#1e3a8a', logo: 'SR', category: 'analysis', bias: 'independent' },
        'The Grayzone': { color: '#065f46', logo: 'GZ', category: 'investigative', bias: 'left' },
        'Seymour Hersh': { color: '#78350f', logo: 'SH', category: 'investigative', bias: 'independent' },
        'Citizen Free Press': { color: '#dc2626', logo: 'CFP', category: 'aggregator', bias: 'right' },
        'Reason': { color: '#f59e0b', logo: 'R', category: 'magazine', bias: 'libertarian' },
        'The Young Turks': { color: '#2563eb', logo: 'TYT', category: 'video', bias: 'left' }
};

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
    { handle: 'ScottRitter', name: 'Scott Ritter', weight: 0.7 },
    { handle: 'TheGrayzoneNews', name: 'The Grayzone', weight: 0.8 },
    { handle: 'seabornehersh', name: 'Seymour Hersh', weight: 0.9 },
    { handle: 'CitizenFreePres', name: 'Citizen Free Press', weight: 0.9 },
    { handle: 'reason', name: 'Reason', weight: 0.8 },
    { handle: 'TheYoungTurks', name: 'The Young Turks', weight: 0.8 }
    ];

// RSS feeds for articles/videos (secondary source - filtered for news)
const RSS_FEEDS = [
    { name: 'Glenn Greenwald', url: 'https://greenwald.substack.com/feed', weight: 1.0, type: 'article' },
    { name: 'Drop Site News', url:const express = require('express');
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

// Source metadata with colors and branding
const SOURCE_META = {
        'Tucker Carlson': { color: '#dc2626', logo: 'TC', category: 'video', bias: 'right' },
        'Glenn Greenwald': { color: '#16a34a', logo: 'GG', category: 'journalist', bias: 'independent' },
        'Nick Fuentes': { color: '#7c3aed', logo: 'NF', category: 'commentary', bias: 'right' },
        'Judge Napolitano': { color: '#0369a1', logo: 'JN', category: 'video', bias: 'libertarian' },
        'Dave Smith': { color: '#ca8a04', logo: 'DS', category: 'podcast', bias: 'libertarian' },
        'Breaking Points': { color: '#ea580c', logo: 'BP', category: 'video', bias: 'independent' },
        'Krystal Ball': { color: '#db2777', logo: 'KB', category: 'video', bias: 'left' },
        'Saagar Enjeti': { color: '#0891b2', logo: 'SE', category: 'video', bias: 'right' },
        'Drop Site News': { color: '#059669', logo: 'DS', category: 'investigative', bias: 'left' },
        'Candace Owens': { color: '#be185d', logo: 'CO', category: 'commentary', bias: 'right' },
        'Steve Bannon': { color: '#b91c1c', logo: 'SB', category: 'podcast', bias: 'right' },
        'Col. Macgregor': { color: '#365314', logo: 'CM', category: 'analysis', bias: 'independent' },
        'Jeffrey Sachs': { color: '#1e40af', logo: 'JS', category: 'analysis', bias: 'left' },
        'Redacted': { color: '#7c2d12', logo: 'RD', category: 'video', bias: 'independent' },
        'Matt Taibbi': { color: '#4338ca', logo: 'MT', category: 'journalist', bias: 'independent' },
        'Max Blumenthal': { color: '#166534', logo: 'MB', category: 'journalist', bias: 'left' },
        'Scott Ritter': { color: '#1e3a8a', logo: 'SR', category: 'analysis', bias: 'independent' },
        'The Grayzone': { color: '#065f46', logo: 'GZ', category: 'investigative', bias: 'left' },
        'Seymour Hersh': { color: '#78350f', logo: 'SH', category: 'investigative', bias: 'independent' },
        'Citizen Free Press': { color: '#dc2626', logo: 'CFP', category: 'aggregator', bias: 'right' },
        'Reason': { color: '#f59e0b', logo: 'R', category: 'magazine', bias: 'libertarian' },
        'The Young Turks': { color: '#2563eb', logo: 'TYT', category: 'video', bias: 'left' }
};

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
    { handle: 'JeffreySachs', name: '

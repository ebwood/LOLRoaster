const express = require('express');
const config = require('./config.js');
const path = require('path');

/**
 * Creates the Express proxy server that forwards requests to LoL's Live Client Data API.
 * 
 * @param {import('./detector.js').GameDetector} detector
 */
function createProxyServer(detector) {
  const app = express();

  // CORS - allow access from any origin (for LAN access)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Serve static files (dashboard)
  // In pkg, __dirname points to the virtual filesystem inside the executable
  // We need to point to where we configured assets in package.json
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health / status endpoint
  app.get('/status', (req, res) => {
    const gameData = detector.lastGameData;
    res.json({
      proxy: 'running',
      gameRunning: detector.isGameRunning,
      gameTime: gameData?.gameData?.gameTime ?? null,
      gameMode: gameData?.gameData?.gameMode ?? null,
      mapName: gameData?.gameData?.mapName ?? null,
      playerCount: gameData?.allPlayers?.length ?? 0,
    });
  });

  // Proxy all /liveclientdata/* requests to LoL's local API
  app.get('/liveclientdata/*', async (req, res) => {
    if (!detector.isGameRunning) {
      return res.status(503).json({
        error: 'Game not running',
        message: 'LoL 游戏未在运行中，无法获取数据',
      });
    }

    try {
      // Remove /liveclientdata prefix if it's already in the base URL, or just proxy the path
      // Our config.lolApiUrl is '.../liveclientdata'
      // req.originalUrl is '/liveclientdata/allgamedata'
      // We want: '.../liveclientdata/allgamedata'
      // But wait, the original code did `${config.lolBaseUrl}${req.originalUrl}` where base was root.
      // Now config.lolApiUrl includes /liveclientdata.
      // Actually let's use the URL constructor to be safe or just string replacement if simplistic.
      // Retaining logic: config.lolApiUrl is .../liveclientdata.
      // request path is /liveclientdata/xxx. 
      // We should strip /liveclientdata from request path if we append to config.lolApiUrl

      const endpoint = req.originalUrl.replace(/^\/liveclientdata/, '');
      const targetUrl = `${config.lolApiUrl}${endpoint}`;

      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `LoL API returned ${response.status}`,
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: 'Failed to fetch from LoL API',
        message: err.message,
      });
    }
  });

  return app;
}

module.exports = { createProxyServer };

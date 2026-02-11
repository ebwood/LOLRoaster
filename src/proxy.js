import express from 'express';
import { config } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Creates the Express proxy server that forwards requests to LoL's Live Client Data API.
 * 
 * @param {import('./detector.js').GameDetector} detector
 */
export function createProxyServer(detector) {
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
      const targetUrl = `${config.lolBaseUrl}${req.originalUrl}`;
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

  // Convenience: proxy /swagger/v3/openapi.json and /swagger/v2/swagger.json
  app.get('/swagger/*', async (req, res) => {
    if (!detector.isGameRunning) {
      return res.status(503).json({ error: 'Game not running' });
    }

    try {
      const targetUrl = `${config.lolBaseUrl}${req.originalUrl}`;
      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(3000),
      });
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return app;
}

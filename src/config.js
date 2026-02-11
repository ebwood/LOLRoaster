/**
 * Configuration for the LoL Live Client Data Proxy
 */
const config = {
  // Proxy server port
  port: process.env.PORT || 8099,

  // LoL Live Client Data API base URL
  lolApiUrl: 'https://127.0.0.1:2999/liveclientdata',

  // Polling interval for game detection (ms)
  detectInterval: 3000,

  // WebSocket push interval when game is active (ms)
  wsPushInterval: 1000,

  // Bind address (0.0.0.0 for LAN access)
  host: '0.0.0.0'
};

module.exports = config;

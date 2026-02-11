/**
 * Configuration for the LoL Live Client Data Proxy
 */
export const config = {
  // Proxy server port
  port: parseInt(process.env.PORT || '8099'),

  // LoL Live Client Data API base URL
  lolBaseUrl: 'https://127.0.0.1:2999',

  // Polling interval for game detection (ms)
  detectInterval: 3000,

  // WebSocket push interval when game is active (ms)
  wsPushInterval: 1000,

  // Bind address (0.0.0.0 for LAN access)
  host: '0.0.0.0',
};

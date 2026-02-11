const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

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
  host: '0.0.0.0',

  // LLM Configuration (DeepSeek / Gemini / OpenAI)
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    model: process.env.LLM_MODEL || 'deepseek-chat',
    enabled: process.env.LLM_ENABLED === 'true' // Feature flag
  },

  // TTS Configuration
  tts: {
    provider: process.env.TTS_PROVIDER || 'edge', // 'edge' or 'elevenlabs'
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || '',
      voiceId: process.env.ELEVENLABS_VOICE_ID || '5mZxJZhSmJTjL7GoYfYI', // Default: Karo Yang (Clear, Lively, Energetic - Chinese)
    }
  }
};

module.exports = config;

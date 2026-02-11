const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function getConfigPath() {
  const defaultPath = path.join(__dirname, '../config.json');
  // In packaged Electron, __dirname is inside read-only app.asar
  if (__dirname.includes('app.asar')) {
    try {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'config.json');
    } catch {
      return path.join(require('os').homedir(), '.lol-proxy', 'config.json');
    }
  }
  return defaultPath;
}

const CONFIG_FILE = getConfigPath();

/**
 * Load user config from config.json (if exists)
 */
function loadUserConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load config.json:', e.message);
  }
  return {};
}

/**
 * Save user config to config.json
 */
function saveUserConfig(settings) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Build runtime config: .env defaults → config.json overrides
 */
function buildConfig(userConfig = {}) {
  return {
    port: process.env.PORT || 8099,
    lolApiUrl: 'https://127.0.0.1:2999/liveclientdata',
    detectInterval: 3000,
    wsPushInterval: 1000,
    host: '0.0.0.0',

    llm: {
      enabled: userConfig.llmEnabled ?? (process.env.LLM_ENABLED === 'true'),
      apiKey: userConfig.llmApiKey || process.env.LLM_API_KEY || '',
      baseUrl: userConfig.llmBaseUrl || process.env.LLM_BASE_URL || 'https://api.deepseek.com',
      model: userConfig.llmModel || process.env.LLM_MODEL || 'deepseek-chat',
    },

    tts: {
      provider: userConfig.ttsProvider || process.env.TTS_PROVIDER || 'edge',
      elevenlabs: {
        apiKey: userConfig.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY || '',
        voiceId: userConfig.elevenlabsVoiceId || process.env.ELEVENLABS_VOICE_ID || '5mZxJZhSmJTjL7GoYfYI',
      }
    }
  };
}

// Initial load
let userConfig = loadUserConfig();
let config = buildConfig(userConfig);

/**
 * Get current runtime config
 */
function getConfig() {
  return config;
}

/**
 * Update config from settings UI, persist to config.json
 */
function updateConfig(settings) {
  // Merge into user config (only save non-empty values)
  const clean = {};
  if (settings.llmEnabled !== undefined) clean.llmEnabled = settings.llmEnabled;
  if (settings.llmApiKey) clean.llmApiKey = settings.llmApiKey;
  if (settings.llmBaseUrl) clean.llmBaseUrl = settings.llmBaseUrl;
  if (settings.llmModel) clean.llmModel = settings.llmModel;
  if (settings.ttsProvider) clean.ttsProvider = settings.ttsProvider;
  if (settings.elevenlabsApiKey) clean.elevenlabsApiKey = settings.elevenlabsApiKey;
  if (settings.elevenlabsVoiceId) clean.elevenlabsVoiceId = settings.elevenlabsVoiceId;

  userConfig = { ...userConfig, ...clean };
  saveUserConfig(userConfig);

  // Hot-reload
  config = buildConfig(userConfig);
  return config;
}

/**
 * Get settings for UI display (masks sensitive keys)
 */
function getSettingsForUI() {
  const mask = (key) => {
    if (!key || key.length < 8) return key ? '***' : '';
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  };

  return {
    llmEnabled: config.llm.enabled,
    llmApiKey: mask(config.llm.apiKey),
    llmBaseUrl: config.llm.baseUrl,
    llmModel: config.llm.model,
    ttsProvider: config.tts.provider,
    elevenlabsApiKey: mask(config.tts.elevenlabs.apiKey),
    elevenlabsVoiceId: config.tts.elevenlabs.voiceId,
  };
}

// Export as a proxy so existing `config.xxx` usage still works
module.exports = new Proxy(config, {
  get(target, prop) {
    // Expose utility functions
    if (prop === 'getConfig') return getConfig;
    if (prop === 'updateConfig') return updateConfig;
    if (prop === 'getSettingsForUI') return getSettingsForUI;
    // Return from live config (supports hot-reload)
    return getConfig()[prop];
  }
});

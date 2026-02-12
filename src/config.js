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
 * LLM Provider presets - users only need to pick a provider and enter API key
 */
const LLM_PROVIDERS = {
  google: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
    hint: 'Get key: ai.google.dev',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    hint: 'Get key: platform.deepseek.com',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    hint: 'Get key: platform.openai.com',
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    hint: 'Runs locally. Install: ollama.com',
  },
  custom: {
    name: 'Custom',
    baseUrl: '',
    defaultModel: '',
    hint: 'Any OpenAI-compatible endpoint',
  },
};

/**
 * Build runtime config: .env defaults → config.json overrides
 */
function buildConfig(userConfig = {}) {
  // Resolve provider → base_url/model
  const provider = userConfig.llmProvider || process.env.LLM_PROVIDER || 'deepseek';
  const preset = LLM_PROVIDERS[provider] || LLM_PROVIDERS.custom;

  return {
    port: process.env.PORT || 8099,
    lolApiUrl: 'https://127.0.0.1:2999/liveclientdata',
    detectInterval: 3000,
    wsPushInterval: 1000,
    host: '0.0.0.0',

    llm: {
      enabled: userConfig.llmEnabled ?? (process.env.LLM_ENABLED === 'true'),
      provider: provider,
      apiKey: userConfig.llmApiKey || process.env.LLM_API_KEY || '',
      baseUrl: userConfig.llmBaseUrl || process.env.LLM_BASE_URL || preset.baseUrl,
      model: userConfig.llmModel || process.env.LLM_MODEL || preset.defaultModel,
    },

    tts: {
      provider: userConfig.ttsProvider || process.env.TTS_PROVIDER || 'edge',
      cache: userConfig.ttsCache !== undefined ? userConfig.ttsCache : true,
      elevenlabs: {
        apiKey: userConfig.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY || '',
        voiceId: userConfig.elevenlabsVoiceId || process.env.ELEVENLABS_VOICE_ID || '5mZxJZhSmJTjL7GoYfYI',
      },
      volcengine: {
        appId: userConfig.volcengineAppId || process.env.VOLCENGINE_APP_ID || '',
        accessToken: userConfig.volcengineAccessToken || process.env.VOLCENGINE_ACCESS_TOKEN || '',
        voiceType: userConfig.volcengineVoiceType || process.env.VOLCENGINE_VOICE_TYPE || 'BV001_streaming',
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
  if (settings.llmProvider) clean.llmProvider = settings.llmProvider;
  if (settings.llmApiKey) clean.llmApiKey = settings.llmApiKey;
  if (settings.llmBaseUrl) clean.llmBaseUrl = settings.llmBaseUrl;
  if (settings.llmModel) clean.llmModel = settings.llmModel;
  if (settings.ttsProvider) clean.ttsProvider = settings.ttsProvider;
  if (settings.ttsCache !== undefined) clean.ttsCache = settings.ttsCache;
  if (settings.elevenlabsApiKey) clean.elevenlabsApiKey = settings.elevenlabsApiKey;
  if (settings.elevenlabsVoiceId) clean.elevenlabsVoiceId = settings.elevenlabsVoiceId;
  if (settings.volcengineAppId) clean.volcengineAppId = settings.volcengineAppId;
  if (settings.volcengineAccessToken) clean.volcengineAccessToken = settings.volcengineAccessToken;
  if (settings.volcengineVoiceType) clean.volcengineVoiceType = settings.volcengineVoiceType;

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
    llmProvider: config.llm.provider,
    llmApiKey: mask(config.llm.apiKey),
    llmBaseUrl: config.llm.baseUrl,
    llmModel: config.llm.model,
    ttsProvider: config.tts.provider,
    ttsCache: config.tts.cache,
    elevenlabsApiKey: mask(config.tts.elevenlabs.apiKey),
    elevenlabsVoiceId: config.tts.elevenlabs.voiceId,
    volcengineAppId: config.tts.volcengine.appId,
    volcengineAccessToken: mask(config.tts.volcengine.accessToken),
    volcengineVoiceType: config.tts.volcengine.voiceType,
    llmProviders: LLM_PROVIDERS,
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

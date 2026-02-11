const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { EdgeTTS } = require('node-edge-tts');
const player = require('play-sound')(opts = {});
const logger = require('../logger');
const config = require('../config');
const EventEmitter = require('events');

class TTS extends EventEmitter {
  constructor() {
    super();
    // Edge TTS voices
    this.edgeVoices = {
      zh: 'zh-CN-YunxiNeural',
      en: 'en-US-ChristopherNeural'
    };
    this.currentLang = 'zh';
    this.voice = this.edgeVoices.zh;
    this.isPlaying = false;
    this.queue = [];
    this.cacheDir = this._getCacheDir();
    this.currentProcess = null; // Track current play-sound process

    // TTS Provider (read dynamically from config for hot-reload)
    this.provider = config.tts.provider || 'edge';
    this.elevenlabsApiKey = config.tts.elevenlabs.apiKey;
    this.elevenlabsVoiceId = config.tts.elevenlabs.voiceId;

    // Playback history for web UI replay
    this.history = []; // { text, hash, timestamp }

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    logger.tts(`Provider: ${this.provider}${this.provider === 'elevenlabs' ? ` (Voice: ${this.elevenlabsVoiceId})` : ''}`);
  }

  // Re-read config (called after settings update)
  reloadConfig() {
    this.provider = config.tts.provider || 'edge';
    this.elevenlabsApiKey = config.tts.elevenlabs.apiKey;
    this.elevenlabsVoiceId = config.tts.elevenlabs.voiceId;
    logger.tts(`Config reloaded → Provider: ${this.provider}`);
  }

  // Clear all cached TTS files
  clearCache() {
    try {
      const files = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.mp3'));
      for (const f of files) {
        fs.unlinkSync(path.join(this.cacheDir, f));
      }
      logger.tts(`Cache cleared: ${files.length} files removed`);
      return files.length;
    } catch (e) {
      logger.error(`Failed to clear cache: ${e.message}`);
      return 0;
    }
  }

  _getCacheDir() {
    // In packaged Electron, __dirname is inside read-only app.asar
    if (process.pkg || (process.versions && process.versions.electron && __dirname.includes('app.asar'))) {
      try {
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'cache_tts');
      } catch {
        // Fallback for non-electron packaged builds
        return path.join(require('os').homedir(), '.lol-proxy', 'cache_tts');
      }
    }
    return path.join(__dirname, '../../cache_tts');
  }

  setLanguage(lang) {
    if (this.edgeVoices[lang]) {
      this.currentLang = lang;
      this.voice = this.edgeVoices[lang];
      logger.tts(`Language set to: ${lang} (Voice: ${this.voice})`);
    } else {
      logger.error(`Unsupported TTS language: ${lang}`);
    }
  }

  getHash(text) {
    const prefix = this.provider === 'elevenlabs' ? `el:${this.elevenlabsVoiceId}` : `edge:${this.voice}`;
    return crypto.createHash('md5').update(`${prefix}:${text}`).digest('hex');
  }

  getFilePath(hash) {
    return path.join(this.cacheDir, `${hash}.mp3`);
  }

  async preload(texts) {
    if (this.provider !== 'edge') {
      logger.tts(`Skipping preload (provider: ${this.provider}, costs per character)`);
      return;
    }
    logger.tts(`Preloading ${texts.length} lines...`);
    for (const text of texts) {
      const hash = this.getHash(text);
      const filePath = this.getFilePath(hash);
      if (!fs.existsSync(filePath)) {
        await this.generateFile(text, filePath);
      }
    }
    logger.tts('Preloading complete.');
  }

  async generateFile(text, filePath) {
    if (this.provider === 'elevenlabs') {
      await this.generateElevenLabs(text, filePath);
    } else {
      await this.generateEdge(text, filePath);
    }
  }

  // --- Edge TTS (Free) ---
  async generateEdge(text, filePath) {
    const tts = new EdgeTTS({
      voice: this.voice,
      lang: this.currentLang === 'zh' ? 'zh-CN' : 'en-US',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
    });
    await tts.ttsPromise(text, filePath);
  }

  // --- ElevenLabs V3 Dialogue API (supports emotion tags) ---
  async generateElevenLabs(text, filePath) {
    try {
      const response = await axios.post(
        'https://api.elevenlabs.io/v1/text-to-dialogue',
        {
          model_id: 'eleven_v3',
          inputs: [
            {
              text: text,
              voice_id: this.elevenlabsVoiceId
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.elevenlabsApiKey
          },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      fs.writeFileSync(filePath, Buffer.from(response.data));
    } catch (error) {
      logger.error(`ElevenLabs TTS Error: ${error.message}`);
      if (error.response) {
        logger.error(`ElevenLabs Response: ${Buffer.from(error.response.data).toString()}`);
      }
      throw error;
    }
  }

  // Stop current playback
  stop() {
    if (this.currentProcess) {
      try { this.currentProcess.kill(); } catch (e) { /* ignore */ }
      this.currentProcess = null;
    }
    this.isPlaying = false;
  }

  async speak(text) {
    if (this.isPlaying) {
      this.queue.push(text);
      return;
    }

    this.isPlaying = true;

    try {
      const hash = this.getHash(text);
      let filePath = this.getFilePath(hash);

      // Check cache (skip if cache disabled)
      const useCache = config.tts.cache !== false;
      if (useCache && fs.existsSync(filePath)) {
        logger.tts(`Speaking (Cached): "${text.substring(0, 50)}..."`);
      } else {
        if (!useCache) {
          logger.tts(`Cache disabled. Generating via ${this.provider}...`);
        } else {
          logger.tts(`Cache miss for: "${text.substring(0, 50)}...". Generating via ${this.provider}...`);
        }
        await this.generateFile(text, filePath);
      }

      // Add to history for web UI
      const entry = { text, hash, timestamp: Date.now() };
      this.history.unshift(entry);
      if (this.history.length > 20) this.history.pop(); // Keep last 20

      // Emit event for WebSocket relay (browser handles playback)
      this.emit('audioReady', { text, hash, url: `/audio/${hash}` });

      // Mark as done and process queue
      this.isPlaying = false;
      if (this.queue.length > 0) {
        const nextText = this.queue.shift();
        this.speak(nextText);
      }

    } catch (e) {
      logger.error('TTS Generation Error:', e.message || e);
      this.isPlaying = false;
      if (this.queue.length > 0) {
        const nextText = this.queue.shift();
        this.speak(nextText);
      }
    }
  }
}

module.exports = new TTS();

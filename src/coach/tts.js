const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EdgeTTS } = require('node-edge-tts');
const player = require('play-sound')(opts = {});

class TTS {
  constructor() {
    this.voice = 'zh-CN-YunxiNeural'; // The "Toxic" voice
    this.isPlaying = false;
    this.queue = [];
    this.cacheDir = path.join(__dirname, '../../cache_tts');

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  async preload(texts) {
    console.log(`[TTS] Preloading ${texts.length} lines...`);
    for (const text of texts) {
      const hash = this.getHash(text);
      const filePath = path.join(this.cacheDir, `${hash}.mp3`);

      if (!fs.existsSync(filePath)) {
        console.log(`[TTS] Generating cache for: "${text.substring(0, 10)}..."`);
        await this.generateFile(text, filePath);
      }
    }
    console.log('[TTS] Preloading complete.');
  }

  async generateFile(text, filePath) {
    const tts = new EdgeTTS({
      voice: this.voice,
      lang: 'zh-CN',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
    });
    await tts.ttsPromise(text, filePath);
  }

  async speak(text) {
    if (this.isPlaying) {
      this.queue.push(text);
      return;
    }

    this.isPlaying = true;

    try {
      const hash = this.getHash(text);
      let filePath = path.join(this.cacheDir, `${hash}.mp3`);

      // If not cached, generate temp file
      if (!fs.existsSync(filePath)) {
        console.log(`[TTS] Cache miss for: "${text}". Generating...`);
        // We use the cache dir even for dynamic text to save it for later
        await this.generateFile(text, filePath);
      }

      // Play audio
      player.play(filePath, (err) => {
        if (err) console.error('Audio play error:', err);

        // We do NOT delete the file here anymore, enabling caching

        this.isPlaying = false;

        // Process queue
        if (this.queue.length > 0) {
          const nextText = this.queue.shift();
          this.speak(nextText);
        }
      });

    } catch (e) {
      console.error('TTS Generation Error:', e);
      this.isPlaying = false;
    }
  }
}

module.exports = new TTS();

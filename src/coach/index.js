const axios = require('axios');
const https = require('https');
const GameState = require('./gamestate');
const tts = require('./tts');
const config = require('../config'); // Use existing config

// Toxic Lines
const DEATH_ROASTS = [
  "这就死了？我奶奶用脚玩都比你强。",
  "如果泉水里有空调，你应该是想去吹空调了吧？",
  "别送了别送了，对面都要被你喂饱了。",
  "看黑白电视的感觉怎么样？清晰吗？",
  "你再死一次，我就卸载游戏。",
  "操作很下饭，建议去应聘饿了么厨师。",
  "稳住！我们要赢！... 算了，当我没说。",
  "对面那个英雄是你亲戚吗？这么照顾他生意。",
];

class Coach {
  constructor() {
    this.gameState = new GameState();
    this.isRunning = false;
    this.intervalId = null;

    // Create axios instance with SSL ignore
    this.client = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('AI Coach Started: Toxic Mode ON');

    // Poll every 1s
    this.intervalId = setInterval(async () => {
      try {
        await this.tick();
      } catch (e) {
        // Ignore fetch errors (game not running)
      }
    }, 1000);
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.intervalId);
  }

  async tick() {
    try {
      // 1. Fetch data from LOCAL lol client (port 2999)
      const response = await this.client.get('https://127.0.0.1:2999/liveclientdata/allgamedata');
      const gameData = response.data;

      // 2. Diff Logic
      const events = this.gameState.diff(gameData);

      // 3. Handle Events
      if (events.length > 0) {
        events.forEach(event => {
          if (event.type === 'DEATH') {
            this.triggerRoast();
          }
        });
      }
    } catch (e) {
      // Ignore errors (game not running or API unreachable)
      // console.error(e.message);
    }
  }

  triggerRoast() {
    const roast = DEATH_ROASTS[Math.floor(Math.random() * DEATH_ROASTS.length)];
    console.log(`[Coach] Triggered Roast: ${roast}`);
    tts.speak(roast);
  }
}

module.exports = new Coach();

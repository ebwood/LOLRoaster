const EventEmitter = require('events');
const config = require('./config.js');

/**
 * Detects whether a LoL game is currently running by polling the Live Client Data API.
 * More reliable than process name detection since the API is only available during a game.
 */
class GameDetector extends EventEmitter {
  constructor() {
    super();
    this.isGameRunning = false;
    this.lastGameData = null;
    this._timer = null;
  }

  /**
   * Start polling for game status
   */
  start() {
    console.log(`🔍 开始检测 LoL 游戏状态 (每 ${config.detectInterval / 1000}s)`);
    this._poll();
    this._timer = setInterval(() => this._poll(), config.detectInterval);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Poll the LoL Live Client Data API
   */
  async _poll() {
    try {
      const response = await fetch(`${config.lolApiUrl}/allgamedata`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        const data = await response.json();
        this.lastGameData = data;

        if (!this.isGameRunning) {
          this.isGameRunning = true;
          console.log('🎮 检测到 LoL 游戏正在运行!');
          this.emit('gameStarted', data);
        }

        this.emit('gameData', data);
      } else {
        this._handleGameNotRunning();
      }
    } catch {
      this._handleGameNotRunning();
    }
  }

  _handleGameNotRunning() {
    if (this.isGameRunning) {
      this.isGameRunning = false;
      this.lastGameData = null;
      console.log('⏹️  LoL 游戏已结束');
      this.emit('gameEnded');
    }
  }
}

module.exports = { GameDetector };

class GameState {
  constructor() {
    this.previousData = null;
  }

  /**
   * Compare new game data with previous state to detect events.
   * @param {Object} newData - The full game data from /allgamedata
   * @returns {Array} - List of detected events (e.g., [{ type: 'DEATH' }])
   */
  diff(newData) {
    const events = [];

    // If no previous data, just initialize and return empty (or handle "Game Start")
    if (!this.previousData) {
      this.previousData = newData;
      return events;
    }

    // Check for Active Player
    const oldP = this.previousData.activePlayer;
    const newP = newData.activePlayer;

    if (oldP && newP) {
      // DEATH DETECTION
      // Note: activePlayer.scores might differ from playerList scores, usually activePlayer is reliable for self
      // But /activeplayer endpoint sometimes doesn't have scores. /allgamedata does.
      // Let's assume we are using /allgamedata which has 'activePlayer' and 'allPlayers'.
      // We need to find the active player in 'allPlayers' to get accurate KDA usually, 
      // or use activePlayer.scores if available. 
      // Let's check typical response structure. 
      // Usually activePlayer has: { abilityPower, championStats, currentGold, fullRunes, level, summonerName, ... }
      // It might NOT have scores directly.
      // We should use 'allPlayers' to find the player by summonerName to get scores.

      const playerName = newP.summonerName;
      const oldStats = this.getPlayerStats(this.previousData.allPlayers, playerName);
      const newStats = this.getPlayerStats(newData.allPlayers, playerName);

      if (oldStats && newStats) {
        // DEATH
        if (newStats.scores.deaths > oldStats.scores.deaths) {
          const count = newStats.scores.deaths - oldStats.scores.deaths;
          for (let i = 0; i < count; i++) {
            events.push({ type: 'DEATH', kda: newStats.scores });
          }
        }

        // KILL
        if (newStats.scores.kills > oldStats.scores.kills) {
          const count = newStats.scores.kills - oldStats.scores.kills;
          for (let i = 0; i < count; i++) {
            events.push({ type: 'KILL', kda: newStats.scores });
          }
        }
      }
    }

    // Update state
    this.previousData = newData;
    return events;
  }

  getPlayerStats(allPlayers, summonerName) {
    if (!allPlayers) return null;
    return allPlayers.find(p => p.summonerName === summonerName);
  }
}

module.exports = GameState;

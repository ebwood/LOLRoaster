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

      const playerName = newP.summonerName || newP.riotId || newP.riotIdGameName;
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
      } else {
        // Debug: help identify matching issue
        if (!this._warnedNoStats) {
          console.log(`[GameState] ⚠️ Could not find player "${playerName}" in allPlayers. Available:`,
            newData.allPlayers?.map(p => p.summonerName || p.riotId).join(', '));
          this._warnedNoStats = true;
        }
      }
    }

    // Update state
    this.previousData = newData;
    return events;
  }

  getPlayerStats(allPlayers, name) {
    if (!allPlayers || !name) return null;
    return allPlayers.find(p =>
      p.summonerName === name || p.riotId === name || p.riotIdGameName === name
    );
  }

  processGlobalEvents(eventData, activePlayerName) {
    const events = [];
    if (!eventData || !eventData.Events) return events;

    if (!this.processedEvents) {
      this.processedEvents = new Set();
    }

    eventData.Events.forEach(e => {
      // Use EventID to dedupe. If EventID is 0 or missing, use a combo key
      const uniqueKey = e.EventID || `${e.EventName}_${e.EventTime}`;

      if (this.processedEvents.has(uniqueKey)) return;
      this.processedEvents.add(uniqueKey);

      // Only care about recent events (last 5 seconds) to avoid spam on startup
      // But for EventID based logic, we just track all seen IDs.

      if (e.EventName === 'TurretKilled') {
        // Example: "TurretKilled"
        events.push({ type: 'OBJECTIVE', subtype: 'TURRET', killer: e.KillerName });
      } else if (e.EventName === 'InhibKilled') {
        events.push({ type: 'OBJECTIVE', subtype: 'INHIB', killer: e.KillerName });
      } else if (e.EventName === 'DragonKill') {
        events.push({ type: 'OBJECTIVE', subtype: 'DRAGON', killer: e.KillerName, dragonType: e.DragonType });
      } else if (e.EventName === 'BaronKill') {
        events.push({ type: 'OBJECTIVE', subtype: 'BARON', killer: e.KillerName });
      } else if (e.EventName === 'HeraldKill') {
        events.push({ type: 'OBJECTIVE', subtype: 'HERALD', killer: e.KillerName });
      } else if (e.EventName === 'ChampionKill') {
        // We handle kills via diff logic usually, but this is good for multi-kills if we want
      }
    });

    return events;
  }
}

module.exports = GameState;

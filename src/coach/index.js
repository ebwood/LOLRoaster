const axios = require('axios');
const https = require('https');
const llm = require('./llm');
const GameState = require('./gamestate');
const tts = require('./tts');
const config = require('../config');

// ... (existing constants)




// 1. Toxic Lines (Death)
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

// 2. Praise Lines (Kill)
const KILL_PRAISE = [
  "这就杀人了？对面是人机吧？",
  "哟，瞎猫碰上死耗子了？",
  "居然杀了一个，看来对面键盘坏了。",
  "如果不是运气好，刚才死的就是你了。",
  "别骄傲，这只是开始，你这把至少还要死十次。",
  "终于开张了，我都睡着了。",
];

// 3. Roast Lines (CS Gap)
const CS_ROASTS = [
  "你的平A是用来治愈小兵的吗？",
  "你也太善良了，看着小兵一个个老死都不忍心补。",
  "我看你补刀像在做慈善，全送给塔了。",
  "这把玩的是绝食流打法吗？",
  "漏那两个炮车，心不痛吗？",
  "这种补刀水平，还是去打野吧... 哦打野你也会被野怪打死。",
];

// 4. Roast Lines (Teammate Death)
const TEAMMATE_DEATH_ROASTS = [
  "你的队友又送了一个，这把看来是带不动了。",
  "如果送人头有奥运会，你的队友一定是金牌。",
  "又是他？我都看累了。",
  "这种队友，建议打完直接拉黑。",
  "看来对面给了不少好处费啊。",
];

// 5. Objective Lines
const OBJECTIVE_GOOD = [
  "拿龙了？不容易啊。",
  "推掉了？拆迁办这就来了。",
  "终于干了点正事。",
];

const OBJECTIVE_BAD = [
  "龙都没了，还在那刷野呢？",
  "塔都掉了，你们是在塔下睡觉吗？",
  "水晶都要炸了，还不回家？",
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
    this.language = 'zh'; // Default language
  }

  setLanguage(lang) {
    this.language = lang;
    console.log(`[Coach] Language set to: ${lang}`);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('AI Coach Started: Toxic Mode ON');

    // Preload TTS cache (All lines)
    const allLines = [
      ...DEATH_ROASTS, ...KILL_PRAISE, ...CS_ROASTS,
      ...TEAMMATE_DEATH_ROASTS, ...OBJECTIVE_GOOD, ...OBJECTIVE_BAD
    ];
    tts.preload(allLines);

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
      // 1. Fetch data from LOCAL lol client (use config URL)
      const baseUrl = config.lolApiUrl; // e.g. https://127.0.0.1:2999/liveclientdata
      const [allGameData, eventData] = await Promise.all([
        this.client.get(`${baseUrl}/allgamedata`).catch(e => ({ data: null })),
        this.client.get(`${baseUrl}/eventdata`).catch(e => ({ data: null }))
      ]);

      const gameData = allGameData.data;
      const eventsList = eventData.data;

      if (!gameData) return;

      // 2. Diff Logic (Player Stats)
      const diffEvents = this.gameState.diff(gameData);

      // 3. Process Global Events (Objectives + ChampionKill)
      const activePlayerName = gameData.activePlayer.summonerName || gameData.activePlayer.riotId;
      const globalEvents = this.gameState.processGlobalEvents(eventsList, activePlayerName, gameData.allPlayers);

      const allEvents = [...diffEvents, ...globalEvents];

      // 4. Handle Events
      if (allEvents.length > 0) {
        const playerName = gameData.activePlayer.summonerName || gameData.activePlayer.riotId;
        const playerStats = gameData.allPlayers.find(p =>
          p.summonerName === playerName || p.riotId === playerName
        );
        const currentContext = {
          gameTime: gameData.gameData.gameTime,
          kda: playerStats
            ? `${playerStats.scores.kills}/${playerStats.scores.deaths}/${playerStats.scores.assists}`
            : '0/0/0',
          cs: playerStats ? playerStats.scores.creepScore : 0,
          champion: playerStats ? playerStats.championName : 'Unknown',
          position: playerStats ? (playerStats.position || '') : ''
        };

        allEvents.forEach(event => {
          console.log(`[Coach] 📡 Event: ${event.type}${event.subtype ? ` (${event.subtype})` : ''} | KDA: ${currentContext.kda} | CS: ${currentContext.cs}`);

          if (event.type === 'DEATH') {
            this.triggerRoast(DEATH_ROASTS, { ...currentContext, type: 'DEATH', details: `Killed by ${event.kda ? 'enemy' : 'unknown'}` });
          } else if (event.type === 'KILL') {
            this.triggerRoast(KILL_PRAISE, { ...currentContext, type: 'KILL' });
          } else if (event.type === 'CS_GAP') {
            this.triggerRoast(CS_ROASTS, { ...currentContext, type: 'CS_GAP', details: `Missed too many minions. Gap: ${event.diff}` });
          } else if (event.type === 'TEAMMATE_DEATH') {
            this.triggerRoast(TEAMMATE_DEATH_ROASTS, { ...currentContext, type: 'TEAMMATE_DEATH', details: `Teammate ${event.name} died` });
          } else if (event.type === 'OBJECTIVE') {
            const myName = playerName;
            const me = gameData.allPlayers.find(p => p.summonerName === myName || p.riotId === myName);
            const myTeam = me ? me.team : 'ORDER';

            const killer = gameData.allPlayers.find(p => p.summonerName === event.killer);

            if (killer && killer.team === myTeam) {
              this.triggerRoast(OBJECTIVE_GOOD, { ...currentContext, type: 'OBJECTIVE_TAKEN', details: `We took ${event.subtype}` });
            } else {
              this.triggerRoast(OBJECTIVE_BAD, { ...currentContext, type: 'OBJECTIVE_LOST', details: `Enemy took ${event.subtype}` });
            }
          }
        });
      }
    } catch (e) {
      // Only log real errors, not connection errors (game not running)
      if (e.code !== 'ECONNREFUSED' && e.code !== 'ECONNRESET') {
        console.error('[Coach] tick error:', e.message);
      }
    }
  }

  triggerDebugRoast(type) {
    let list = DEATH_ROASTS;
    if (type === 'KILL') list = KILL_PRAISE;
    if (type === 'CS_GAP') list = CS_ROASTS;
    if (type === 'TEAMMATE_DEATH') list = TEAMMATE_DEATH_ROASTS;
    if (type === 'OBJECTIVE') list = OBJECTIVE_GOOD; // Default to good for debug

    if (type === 'LLM_TEST') {
      const scenarios = [
        { type: 'DEATH', gameTime: 15 * 60, kda: '0/5/0', cs: 20, details: 'Died to Teammate (Testing)' },
        { type: 'DEATH', gameTime: 3 * 60, kda: '0/2/0', cs: 5, details: 'First blood given at level 1' },
        { type: 'DEATH', gameTime: 25 * 60, kda: '1/8/2', cs: 85, details: 'Dove enemy tower and died' },
        { type: 'DEATH', gameTime: 30 * 60, kda: '2/10/1', cs: 110, details: 'Got caught face-checking a bush alone' },
        { type: 'DEATH', gameTime: 10 * 60, kda: '0/4/0', cs: 30, details: 'Killed by jungle camp (raptors)' },
        { type: 'DEATH', gameTime: 20 * 60, kda: '3/7/0', cs: 60, details: 'Flashed into 5 enemies and died instantly' },
        { type: 'DEATH', gameTime: 8 * 60, kda: '0/3/1', cs: 15, details: 'Ganked while overextended with no wards' },
        { type: 'DEATH', gameTime: 35 * 60, kda: '0/12/0', cs: 50, details: 'Tried to 1v1 the fed enemy carry' },
        { type: 'DEATH', gameTime: 5 * 60, kda: '0/1/0', cs: 8, details: 'Walked into enemy jungle and got collapsed on' },
        { type: 'DEATH', gameTime: 40 * 60, kda: '4/9/3', cs: 150, details: 'Got caught splitting alone while team was fighting Baron' },
      ];
      const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
      this.triggerRoast(DEATH_ROASTS, scenario);
      return;
    }

    this.triggerRoast(list, { type: type, gameTime: 10, kda: '0/0/0', cs: 0, details: 'Debug Trigger' });
  }

  async triggerRoast(roastList = DEATH_ROASTS, context = {}) {
    // 1. Try LLM first (if enabled)
    // We only use LLM for DEATH events for now to save cost/latency, or if explicitly passed
    if (config.llm.enabled && (!context.type || context.type === 'DEATH')) {
      const llmRoast = await llm.generateRoast({
        event: context.type || 'DEATH',
        kda: context.kda || '0/0/0',
        cs: context.cs || 0,
        gameTime: Math.floor(context.gameTime / 60) || 0,
        details: context.details || 'Player died',
        language: this.language
      });

      if (llmRoast) {
        console.log(`[Coach] Triggered LLM Roast: ${llmRoast}`);
        tts.speak(llmRoast);
        return;
      }
    }

    // 2. Fallback to Static Lines
    const roast = roastList[Math.floor(Math.random() * roastList.length)];
    console.log(`[Coach] Triggered Static Roast: ${roast}`);
    tts.speak(roast);
  }
}

module.exports = new Coach();

const axios = require('axios');
const https = require('https');
const GameState = require('./gamestate');
const tts = require('./tts');
const config = require('../config'); // Use existing config

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
      // 1. Fetch data from LOCAL lol client
      // We need both /allgamedata (for players/stats) and /eventdata (for objectives)
      const [allGameData, eventData] = await Promise.all([
        this.client.get('https://127.0.0.1:2999/liveclientdata/allgamedata').catch(e => ({ data: null })),
        this.client.get('https://127.0.0.1:2999/liveclientdata/eventdata').catch(e => ({ data: null }))
      ]);

      const gameData = allGameData.data;
      const eventsList = eventData.data;

      if (!gameData) return;

      // 2. Diff Logic (Player Stats)
      const diffEvents = this.gameState.diff(gameData);

      // 3. Process Global Events (Objectives)
      const globalEvents = this.gameState.processGlobalEvents(eventsList);

      const allEvents = [...diffEvents, ...globalEvents];

      // 4. Handle Events
      if (allEvents.length > 0) {
        allEvents.forEach(event => {
          if (event.type === 'DEATH') {
            this.triggerRoast(DEATH_ROASTS);
          } else if (event.type === 'KILL') {
            this.triggerRoast(KILL_PRAISE);
          } else if (event.type === 'CS_GAP') {
            this.triggerRoast(CS_ROASTS);
          } else if (event.type === 'TEAMMATE_DEATH') {
            // 30% chance to roast teammate death to avoid spam
            if (Math.random() > 0.7) this.triggerRoast(TEAMMATE_DEATH_ROASTS);
          } else if (event.type === 'OBJECTIVE') {
            // Simple logic: if killer is on our team -> Good, else -> Bad
            // We need to know our team. gameData.activePlayer.summonerName -> find in allPlayers -> team
            const myName = gameData.activePlayer.summonerName;
            const me = gameData.allPlayers.find(p => p.summonerName === myName);
            const myTeam = me ? me.team : 'ORDER'; // Default to Order if fail

            // Check if killer is on my team
            // KillerName in events is SummonerName.
            const killer = gameData.allPlayers.find(p => p.summonerName === event.killer);

            if (killer && killer.team === myTeam) {
              this.triggerRoast(OBJECTIVE_GOOD);
            } else {
              this.triggerRoast(OBJECTIVE_BAD);
            }
          }
        });
      }
    } catch (e) {
      // console.error(e.message);
    }
  }

  triggerDebugRoast(type) {
    let list = DEATH_ROASTS;
    if (type === 'KILL') list = KILL_PRAISE;
    if (type === 'CS_GAP') list = CS_ROASTS;
    if (type === 'TEAMMATE_DEATH') list = TEAMMATE_DEATH_ROASTS;
    if (type === 'OBJECTIVE') list = OBJECTIVE_GOOD; // Default to good for debug

    this.triggerRoast(list);
  }

  triggerRoast(roastList = DEATH_ROASTS) {
    const roast = roastList[Math.floor(Math.random() * roastList.length)];
    console.log(`[Coach] Triggered Roast: ${roast}`);
    tts.speak(roast);
  }
}

module.exports = new Coach();

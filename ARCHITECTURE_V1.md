# 🎮 LoL AI 毒舌教练 — v1 进阶架构实施方案

> 基于外部建议 + 代码现状 + Live Client API 实际能力，整理的可落地方案。
> 目标：从"事件触发型"升级为"陪玩式吐槽"，让 AI 更像损友而不是机器人。

---

## 一、当前版本（v0.3.6）现状

### 已有能力
- 事件检测：DEATH / KILL / TEAMMATE_DEATH / OBJECTIVE（龙/塔/峡谷先锋/男爵）/ MULTIKILL
- 每 3 秒轮询 Live Client API
- LLM 生成嘲讽（DeepSeek 等 OpenAI 兼容 API）
- TTS 多引擎（Edge / ElevenLabs / 豆包 / Fish Audio）
- Web Settings 面板，热重载

### 核心问题
| 问题 | 原因 |
|---|---|
| 每次嘲讽"从零生成" | 没有上下文记忆，不知道你之前死了几次 |
| 80% 时间沉默 | 只盯事件，没有"观察型"评论 |
| 嘲讽不够精准 | 没有利用英雄名、装备、技能等细节 |
| 语气没有递进 | 第1次死和第10次死一样毒 |

---

## 二、Live Client API 实际可用数据（实测）

### ✅ 能拿到的

| 数据 | 来源 | 用途 |
|---|---|---|
| KDA | `allPlayers[].scores` | 死亡/击杀/助攻 |
| CS（补刀） | `allPlayers[].scores.creepScore` | CS/min 计算 |
| 等级 | `activePlayer.level` | 等级差 |
| 英雄名 | `allPlayers[].championName` | 英雄针对性嘲讽 |
| 装备 | `allPlayers[].items` | 出装吐槽 |
| 召唤师技能CD | `activePlayer.summonerSpells` | 闪现检测 |
| 血量/蓝量 | `activePlayer.championStats.currentHealth/maxHealth` | 低血检测 |
| 游戏时间 | `gameData.gameTime` | 时间线 |
| 全局事件 | `eventdata.Events` | 龙/塔/击杀 |
| 所有玩家KDA | `allPlayers[].scores` | 对比/排名 |
| 队伍 | `allPlayers[].team` | 敌我判断 |
| 技能等级 | `activePlayer.abilities` | 是否点了大招 |
| 符文 | `activePlayer.fullRunes` | — |

### ❌ 拿不到的（别浪费时间）

| 数据 | 影响 |
|---|---|
| 玩家位置 (x, y) | 无法判断"远离兵线"、"河道"、"团战距离" |
| currentGold / totalGold | 无法精确算经济差 |
| Ping 信号 | 无法检测"队友打信号" |
| 技能命中率 | 无法检测"空Q" |
| 视野/眼 | 无法检测"不插眼" |
| 对线对手 | 需要自己推断 |

---

## 三、新增模块设计

### 模块 1：Memory Store（短期记忆）⭐ P0

**目标**：让 AI "记仇"，知道最近发生了什么。

```javascript
// src/coach/memory.js
class Memory {
  constructor() {
    this.deathCount = 0;           // 本局总死亡
    this.recentDeaths = [];        // 最近 5 分钟的死亡时间戳
    this.killStreak = 0;           // 连杀
    this.deathStreak = 0;          // 连死（没杀人期间死了几次）
    this.killedBy = {};            // { "敌方名字": 次数 } — 被谁杀
    this.lastDeathTime = 0;        // 上次死亡时间（gameTime）
    this.lastKillTime = 0;         // 上次击杀时间
    this.lastSpokenTime = 0;       // 上次 AI 说话的 gameTime
    this.lastSpokenType = '';      // 上次说话类型（避免重复类型）
    this.csHistory = [];           // [{time, cs}] 用于算 CS/min 变化
    this.mood = 'calm';            // calm | annoyed | furious
    this.flashUsedTime = 0;        // 上次交闪现的时间
    this.champion = '';            // 当前英雄
    this.totalRoastCount = 0;      // 本局总嘲讽次数
  }

  // 死亡时更新
  onDeath(gameTime, killerName) { ... }

  // 击杀时更新
  onKill(gameTime) { ... }

  // 每次 tick 更新 CS
  updateCS(gameTime, cs) { ... }

  // 更新情绪状态
  updateMood() { ... }

  // 获取上下文摘要（给 LLM 用）
  getSummary() { ... }

  // 重置（新游戏）
  reset() { ... }
}
```

**关键派生指标**：
- `csPerMin` = totalCS / (gameTime / 60)
- `recentDeathCount` = 最近 3 分钟内死亡次数
- `deathStreak` = 连续死亡次数（中间没有击杀）
- `killedBySame` = 被同一人杀 >= 2 次
- `flashThenDie` = 交闪现后 15 秒内死亡

**工作量**：~2 小时

---

### 模块 2：Policy Engine（说话策略）⭐ P0

**目标**：控制说话频率、类型和强度，避免刷屏或重复。

#### 频率控制
```
- 事件吐槽：事件后 1-2 秒触发（给游戏音效让路）
- 节奏吐槽：每 20-30 秒尝试一次（有可说的才说）
- 冷却：同类型吐槽至少间隔 30 秒
- 全局冷却：任意吐槽之间至少 8 秒
```

#### 嘴臭等级（绑定 mood）
| Mood | 触发条件 | 说话风格 |
|---|---|---|
| `calm` | 默认 / 长时间没死 | 轻微调侃、阴阳怪气 |
| `annoyed` | 3分钟死>=2 或 csPerMin<3.5 | 开始上强度 |
| `furious` | 3分钟死>=3 或 连死>=4 或 0/5+ | 贴脸输出、不留情面 |

#### 情绪状态机
```
calm → annoyed：3分钟死>=2 或 csPerMin<3.5
annoyed → furious：连死>=4 或 KDA 极差
furious → annoyed：3分钟无死亡
annoyed → calm：5分钟无死亡且 csPerMin 回升
```

**工作量**：~2 小时

---

### 模块 3：Rhythm Roast（节奏吐槽）⭐ P1

**目标**：游戏 80% 时间不再沉默，每 20-30 秒可能插一句。

#### 可检测的节奏触发条件（基于实际 API）

| 触发条件 | 检测方式 | 示例台词 |
|---|---|---|
| CS/min < 4 | csHistory 计算 | "兄弟你这补刀，按月结的吧？" |
| CS/min < 2.5（严重） | csHistory 计算 | "小兵看到你都绕路走了吧" |
| 低血持续 20s+ | championStats.currentHealth | "你血条都见底了还不回家？等着被人来收了？" |
| 等级落后 >= 2 | 与对面同位比较 level | "人家都 11 了你还 9，你挂机了？" |
| 被同一人杀 >= 2 | memory.killedBy | "又是他？你俩私下认识吧" |
| 连死后又死 | memory.deathStreak>=3 | "我数着呢，第四次了啊兄弟" |
| 长时间无收益 | 60s 无击杀/助攻/CS不涨 | "你在干啥呢，发呆吗？" |
| 出装奇怪 | items 检查 | "你这出装是让 AI 推荐的吧" |
| 队友连死 | teammate death 事件 | "你队友都死完了你知道吗" |

#### 不能做的（需要位置数据）
- ❌ "远离兵线" — 没有位置
- ❌ "团战不在" — 没有距离
- ❌ "走同一路线送死" — 没有路径
- ❌ "队友打信号" — 没有 ping

**工作量**：~3 小时

---

### 模块 4：Template Layer（模板层）⭐ P1

**目标**：让 LLM 输出更稳定、更口语化。

#### 设计思路
不再完全依赖 LLM 自由生成。改为：
1. **系统根据数据匹配最佳模板类型**（1-3 个候选）
2. **把模板候选 + 游戏数据 + 记忆上下文发给 LLM**
3. **LLM 只做"润色/选择/加细节"**

#### 模板类型（首批 15 个）

| 模板 ID | 触发条件 | 示例 |
|---|---|---|
| `death_generic` | 每次死亡 | "又死了，你是觉得泉水舒服是吗" |
| `death_streak` | 连死 >= 3 | "第 {n} 次了，我都不想数了" |
| `cs_shame` | csPerMin < 4 | "{min} 分钟 {cs} 刀，你在拿补刀锻炼耐心呢？" |
| `cs_severe` | csPerMin < 2.5 | "这补刀数，我用脚玩都比你强" |
| `flash_shame` | 交闪现后还是死了 | "闪现交得真好看，然后呢？" |
| `killed_by_same` | 被同一人杀 >= 2 | "又是 {killer}？你俩加好友了吧" |
| `low_hp_no_recall` | 低血持续 >= 20s | "你这血条都红了还在逛街呢？" |
| `level_behind` | 等级落后 >= 2 | "人家 {enemy_level} 你才 {my_level}" |
| `kill_praise` | 击杀 | "可以啊，这次没砸" |
| `kill_streak` | 连续击杀 >= 3 | "行啊你今天状态不错" |
| `objective_taken` | 我方拿龙/塔 | "终于干了点正事" |
| `objective_lost` | 敌方拿龙/塔 | "龙都没了你们在那摸鱼呢" |
| `long_idle` | 60s 无收益 | "你在干啥呢？AFK了？" |
| `bad_build` | 装备异常 | "你这出装...认真的？" |
| `teammate_dying` | 队友连死 | "你队友都快投了你知道吗" |

#### LLM 输入结构（新版）

```json
{
  "persona": "嘴臭损友",
  "mood": "annoyed",
  "memory": {
    "deathStreak": 3,
    "csPerMin": 2.8,
    "killedBy": {"Blitzcrank": 2},
    "lastRoastType": "death_generic",
    "recentDeathCount": 3
  },
  "game": {
    "minute": 12,
    "champion": "亚索",
    "kda": "0/4/1",
    "cs": 38
  },
  "candidateTemplates": ["death_streak", "cs_shame", "killed_by_same"],
  "rules": {
    "maxChars": 50,
    "style": "口语短句",
    "mustUseStats": true
  }
}
```

**工作量**：~3 小时

---

### 模块 5：英雄针对性嘲讽 ⭐ P1

**目标**：利用英雄名生成更精准的嘲讽。

Live Client API 的 `allPlayers[].championName` 可以拿到英雄名。

#### 热门英雄梗库
| 英雄 | 梗 |
|---|---|
| Yasuo 亚索 | 0/10 必经之路、快乐风男 |
| Teemo 提莫 | 蘑菇人、人人喊打 |
| Master Yi 易大师 | 无脑右键 |
| Vayne 薇恩 | 天选之人综合症、1v5 狂人 |
| Lee Sin 盲僧 | 回旋踢踢到队友 |
| Thresh 锤石 | 灯笼不点 |
| Riven 锐雯 | 光速QA |

将英雄名传入 LLM prompt 即可，LLM 本身知道大部分英雄梗。

**工作量**：~1 小时（改 prompt 传入 champion 字段）

---

### 模块 6：人格系统 ⭐ P2

**目标**：用户选择不同人设，影响所有嘲讽的语气和用词。

#### 预设人格
| 人格 | 风格 | 口癖 |
|---|---|---|
| 嘴臭损友（默认） | 像一起开黑的朋友 | "兄弟"、"你认真的？"、"我服了" |
| 失望老父亲 | 叹气、长辈式 | "唉"、"我当年…"、"算了算了" |
| 阴阳怪气队友 | 假客气、反讽 | "没事没事"、"不怪你"、"加油哦" |
| 热血解说 | 激动但嫌弃 | "观众朋友们！"、"不敢相信" |
| 自定义 | 用户写 system prompt | — |

实现：Settings 加下拉选择，system prompt 开头加人设描述。

**工作量**：~2 小时

---

### 模块 7：对局总结 ⭐ P3

**目标**：游戏结束时生成全场回顾。

检测 `GameEnd` 事件，把 Memory 中的数据汇总发给 LLM 生成总结。

**输入**：总 KDA、总 CS、总死亡、连死峰值、被谁杀最多、MVP 时刻
**输出**：一段 100-200 字的全场点评

**工作量**：~2 小时

---

### 模块 8：Vision Layer（视觉感知层）⭐ P4 — 终极形态

**目标**：通过屏幕截图 + Gemini Live API，获取 Live Client API 无法提供的视觉信息。

#### 解决的核心问题

| 之前拿不到的 | 视觉感知后 |
|---|---|
| 玩家位置 | ✅ 小地图读取 |
| 团战正在发生 | ✅ 画面混战识别 |
| 技能空了/命中 | ✅ 直接看到 |
| 走位好坏 | ✅ 看得出来 |
| 队友打信号(ping) | ✅ ping 图标可见 |
| 视野/眼位 | ✅ 小地图可见 |
| 你在摸鱼还是对线 | ✅ 大画面判断 |

#### 架构设计

```
屏幕截图 (screenshot-desktop, 每 3-5 秒)
        ↓
  图片 Base64 编码
        ↓
  Gemini Live API (WebSocket 长连接)
    - 发送：截图 + 结构化提问
    - 接收：JSON 格式的场景分析
        ↓
  合并到 Memory Store → Policy Engine → 触发嘲讽
```

#### Gemini 提问模板

```
你是一个 LOL 游戏分析员。看这张截图，快速回答：
1. 玩家在做什么？（对线/打团/打野/回城/游走/发呆）
2. 有没有明显失误？（空技能/走位差/不看地图）
3. 小地图上的局势如何？
4. 有队友在打信号吗？
用 JSON 回答，每个字段一句话。
```

#### 采样策略（控制成本）

| 场景 | 截图频率 | 原因 |
|---|---|---|
| 正常对线 | 每 5 秒 | 低消耗 |
| 检测到死亡/击杀 | 立即截图 | 抓现场 |
| 团战中 | 每 2 秒 | 密集分析 |
| 死亡等待复活 | 暂停 | 无需分析 |

#### 成本估算

- 一局 30 分钟 ≈ 360-600 张截图
- Gemini Flash 处理图片：~260 token/张
- 总成本约 **$0.01-0.03/局**（用 gemini-2.0-flash-lite）

#### 嘲讽升级示例

| 之前（纯数据） | 之后（视觉+数据） |
|---|---|
| "又死了，第3次了" | "你刚才那个 Q 空了吧？然后还往前走，第3次了兄弟" |
| "补刀太少了" | "你在河道晃了半天什么都没干" |
| "队友死了" | "队友在上路打团你在下面刷野呢？" |

**工作量**：~4-5 小时
**前提**：需要 Gemini API Key

---

## 四、暂不实现的功能

| 功能 | 原因 |
|---|---|
| TTS 情绪/停顿控制 | 当前中文 TTS 引擎不支持细粒度控制 |
| 音量混音 | 需要 ffmpeg 处理，增加复杂度 |
| 音效系统 | 优先级低，体验提升不大 |

---

## 五、实施路线

### Phase 1：核心体验升级（预计 1 天）
```
1. Memory Store — 让 AI 记住上下文
2. Policy Engine — 频率控制 + 情绪状态机
3. 英雄名传入 prompt — 最小改动最大收益
```
**完成后效果**：嘲讽有上下文（"第 4 次死了"）、有递进（越死越毒）、有英雄梗。

### Phase 2：丰富内容（预计 1 天）
```
4. Rhythm Roast — 不再只盯事件
5. Template Layer — 稳定输出质量
6. 人格系统 — 多种风格
```
**完成后效果**：整局都有评论、质量稳定、可选人设。

### Phase 3：锦上添花（预计 0.5 天）
```
7. 对局总结
8. 成就系统（连死 5 次触发特殊播报）
```

### Phase 4：视觉感知（预计 1 天）
```
9. Vision Layer — 屏幕截图 + Gemini Live API
10. 视觉触发嘲讽（空技能/走位/摸鱼检测）
```
**完成后效果**：AI 真正"看到"你在玩什么，嘲讽达到解说级别。

---

## 六、文件改动预估

| 文件 | 改动 |
|---|---|
| `src/coach/memory.js` | 新建 — Memory Store |
| `src/coach/policy.js` | 新建 — Policy Engine |
| `src/coach/templates.js` | 新建 — Template Layer |
| `src/coach/rhythm.js` | 新建 — Rhythm Roast 检测 |
| `src/coach/gamestate.js` | 增加闪现检测、装备变化检测 |
| `src/coach/index.js` | 集成新模块，改造 tick 循环 |
| `src/coach/llm.js` | 改造 prompt 结构，接收 Memory 上下文 |
| `src/config.js` | 新增人格设置、视觉层开关 |
| `public/index.html` | Settings 加人格选择下拉、视觉层开关 |
| `src/coach/vision.js` | 新建 — 截屏 + Gemini 视觉分析（Phase 4） |

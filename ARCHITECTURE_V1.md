# 🎮 LoL AI Toxic Coach — v1 Advanced Architecture Plan

> Based on external suggestions + current codebase + Live Client API capabilities, this is a practical implementation plan.
> Goal: Evolve from "event-triggered" to "companion-style roasting" — making the AI feel more like a trash-talking friend than a robot.

---

## 1. Current Version (v0.3.6) Status

### Existing Capabilities
- Event detection: DEATH / KILL / TEAMMATE_DEATH / OBJECTIVE (Dragon/Turret/Herald/Baron) / MULTIKILL
- Polls Live Client API every 3 seconds
- LLM-generated roasts (DeepSeek and other OpenAI-compatible APIs)
- Multi-engine TTS (Edge / ElevenLabs / Volcengine / Fish Audio)
- Web Settings panel with hot-reload

### Core Issues
| Issue | Root Cause |
|---|---|
| Every roast is "generated from scratch" | No context memory — doesn't know you've died several times already |
| Silent 80% of the time | Only watches for events, no "observational" commentary |
| Roasts lack precision | Doesn't leverage champion names, items, abilities, etc. |
| No escalation in tone | 1st death and 10th death get the same level of toxicity |

---

## 2. Live Client API Available Data (Tested)

### ✅ What We Can Get

| Data | Source | Usage |
|---|---|---|
| KDA | `allPlayers[].scores` | Deaths/Kills/Assists |
| CS (Creep Score) | `allPlayers[].scores.creepScore` | CS/min calculation |
| Level | `activePlayer.level` | Level difference |
| Champion Name | `allPlayers[].championName` | Champion-specific roasts |
| Items | `allPlayers[].items` | Build roasting |
| Summoner Spell CD | `activePlayer.summonerSpells` | Flash detection |
| HP/Mana | `activePlayer.championStats.currentHealth/maxHealth` | Low HP detection |
| Game Time | `gameData.gameTime` | Timeline |
| Global Events | `eventdata.Events` | Dragon/Turret/Kills |
| All Player KDAs | `allPlayers[].scores` | Comparison/Ranking |
| Team | `allPlayers[].team` | Friend/Foe detection |
| Ability Levels | `activePlayer.abilities` | Ult level check |
| Runes | `activePlayer.fullRunes` | — |

### ❌ What We Can't Get (Don't Waste Time)

| Data | Impact |
|---|---|
| Player Position (x, y) | Can't detect "away from minions", "in river", "teamfight distance" |
| currentGold / totalGold | Can't precisely calculate gold difference |
| Ping Signals | Can't detect "teammate pinging" |
| Ability Hit Rate | Can't detect "missed skillshot" |
| Vision/Wards | Can't detect "not placing wards" |
| Lane Opponent | Must be inferred |

---

## 3. New Module Designs

### Module 1: Memory Store (Short-term Memory) ⭐ P0

**Goal**: Let the AI "hold grudges" — know what happened recently.

```javascript
// src/coach/memory.js
class Memory {
  constructor() {
    this.deathCount = 0;           // Total deaths this game
    this.recentDeaths = [];        // Death timestamps in the last 5 minutes
    this.killStreak = 0;           // Kill streak
    this.deathStreak = 0;          // Death streak (deaths without any kills in between)
    this.killedBy = {};            // { "enemy_name": count } — who killed you
    this.lastDeathTime = 0;        // Last death time (gameTime)
    this.lastKillTime = 0;         // Last kill time
    this.lastSpokenTime = 0;       // Last time the AI spoke (gameTime)
    this.lastSpokenType = '';      // Last roast type (avoid repeating same type)
    this.csHistory = [];           // [{time, cs}] for calculating CS/min changes
    this.mood = 'calm';            // calm | annoyed | furious
    this.flashUsedTime = 0;        // Last time Flash was used
    this.champion = '';            // Current champion
    this.totalRoastCount = 0;      // Total roasts this game
  }

  // Update on death
  onDeath(gameTime, killerName) { ... }

  // Update on kill
  onKill(gameTime) { ... }

  // Update CS each tick
  updateCS(gameTime, cs) { ... }

  // Update mood state
  updateMood() { ... }

  // Get context summary (for LLM)
  getSummary() { ... }

  // Reset (new game)
  reset() { ... }
}
```

**Key Derived Metrics**:
- `csPerMin` = totalCS / (gameTime / 60)
- `recentDeathCount` = deaths within the last 3 minutes
- `deathStreak` = consecutive deaths (no kills in between)
- `killedBySame` = killed by the same person >= 2 times
- `flashThenDie` = died within 15 seconds of using Flash

**Effort**: ~2 hours

---

### Module 2: Policy Engine (Speech Strategy) ⭐ P0

**Goal**: Control speech frequency, type, and intensity — avoid spam or repetition.

#### Frequency Control
```
- Event roasts: Trigger 1-2 seconds after event (give game sound effects room)
- Rhythm roasts: Attempt every 20-30 seconds (only if there's something to say)
- Cooldown: Same roast type at least 30 seconds apart
- Global cooldown: At least 8 seconds between any roasts
```

#### Toxicity Level (Tied to Mood)
| Mood | Trigger Condition | Speech Style |
|---|---|---|
| `calm` | Default / long time without dying | Light teasing, subtle sarcasm |
| `annoyed` | >= 2 deaths in 3 min OR csPerMin < 3.5 | Ramping up intensity |
| `furious` | >= 3 deaths in 3 min OR death streak >= 4 OR 0/5+ KDA | Full-on roasting, no mercy |

#### Mood State Machine
```
calm → annoyed:  >= 2 deaths in 3 min OR csPerMin < 3.5
annoyed → furious:  death streak >= 4 OR extremely bad KDA
furious → annoyed:  3 minutes without dying
annoyed → calm:  5 minutes without dying AND csPerMin recovers
```

**Effort**: ~2 hours

---

### Module 3: Rhythm Roast (Periodic Commentary) ⭐ P1

**Goal**: No more silence during 80% of the game — potential comment every 20-30 seconds.

#### Detectable Rhythm Triggers (Based on Actual API)

| Trigger Condition | Detection Method | Example Line |
|---|---|---|
| CS/min < 4 | csHistory calculation | "Bro, your CS... are you getting paid monthly?" |
| CS/min < 2.5 (severe) | csHistory calculation | "The minions are dodging YOU at this point" |
| Low HP for 20s+ | championStats.currentHealth | "Your health bar is empty — waiting for someone to collect you?" |
| Level behind >= 2 | Compare with enemy level | "They're level 11 and you're still 9... are you AFK?" |
| Killed by same person >= 2 | memory.killedBy | "Him again? You two dating or something?" |
| Dying again on a death streak | memory.deathStreak >= 3 | "I'm counting — that's number four, buddy" |
| No activity for 60s | No kills/assists/CS increase | "What are you doing? Just standing there?" |
| Weird item build | items check | "Did an AI recommend that build?" |
| Teammate dying repeatedly | Teammate death events | "Your teammates are all dead, you know that right?" |

#### What We Can't Do (Requires Position Data)
- ❌ "Away from minion wave" — no position data
- ❌ "Not in teamfight" — no distance data
- ❌ "Walking the same path to die" — no pathing data
- ❌ "Teammate pinging you" — no ping data

**Effort**: ~3 hours

---

### Module 4: Template Layer ⭐ P1

**Goal**: Make LLM output more stable and natural-sounding.

#### Design Approach
Stop relying entirely on free-form LLM generation. Instead:
1. **System matches best template types based on data** (1-3 candidates)
2. **Send template candidates + game data + memory context to LLM**
3. **LLM only does "polish/select/add details"**

#### Template Types (Initial 15)

| Template ID | Trigger Condition | Example |
|---|---|---|
| `death_generic` | Every death | "Dead again. Is the fountain that comfy?" |
| `death_streak` | Death streak >= 3 | "That's death #{n}. I've lost count" |
| `cs_shame` | csPerMin < 4 | "{min} minutes, {cs} CS — practicing patience?" |
| `cs_severe` | csPerMin < 2.5 | "I could CS better with my feet" |
| `flash_shame` | Flashed and still died | "Nice Flash! And then... what?" |
| `killed_by_same` | Killed by same person >= 2 | "{killer} again? You two friends now?" |
| `low_hp_no_recall` | Low HP for >= 20s | "Your health bar is red and you're just... shopping?" |
| `level_behind` | Level behind >= 2 | "They're level {enemy_level}, you're {my_level}" |
| `kill_praise` | Kill secured | "Not bad, you didn't mess that one up" |
| `kill_streak` | Kill streak >= 3 | "Okay, you're actually on fire today" |
| `objective_taken` | Team takes Dragon/Turret | "Finally doing something useful" |
| `objective_lost` | Enemy takes Dragon/Turret | "Dragon's gone. What were you all doing?" |
| `long_idle` | No activity for 60s | "Hello? Are you AFK?" |
| `bad_build` | Abnormal items | "That build... are you serious?" |
| `teammate_dying` | Teammates dying repeatedly | "Your teammates are about to surrender, FYI" |

#### LLM Input Structure (New)

```json
{
  "persona": "trash-talking friend",
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
    "champion": "Yasuo",
    "kda": "0/4/1",
    "cs": 38
  },
  "candidateTemplates": ["death_streak", "cs_shame", "killed_by_same"],
  "rules": {
    "maxChars": 50,
    "style": "short colloquial sentences",
    "mustUseStats": true
  }
}
```

**Effort**: ~3 hours

---

### Module 5: Champion-Specific Roasts ⭐ P1

**Goal**: Leverage champion names for more targeted roasts.

The Live Client API's `allPlayers[].championName` provides champion names.

#### Popular Champion Meme Library
| Champion | Memes |
|---|---|
| Yasuo | The 0/10 power spike, inting swordsman |
| Teemo | Satan, universally hated |
| Master Yi | Right-click champion, braindead |
| Vayne | Main character syndrome, 1v5 delusion |
| Lee Sin | Insec kick... into your own team |
| Thresh | Lantern? What lantern? |
| Riven | Fast Q combo... or not |

Just pass the champion name into the LLM prompt — most LLMs already know champion memes.

**Effort**: ~1 hour (add champion field to prompt)

---

### Module 6: Personality System ⭐ P2

**Goal**: Let users choose different personas that affect the tone and vocabulary of all roasts.

#### Preset Personalities
| Personality | Style | Catchphrases |
|---|---|---|
| Trash-Talking Friend (Default) | Like a duo-queue buddy | "Bro", "Are you serious?", "I can't even" |
| Disappointed Dad | Sighing, elder-like | "Sigh", "Back in my day...", "Forget it" |
| Passive-Aggressive Teammate | Fake kindness, irony | "It's fine, it's fine", "Not your fault", "Keep it up :)" |
| Hype Caster | Excited but disdainful | "Ladies and gentlemen!", "Unbelievable!" |
| Custom | User writes system prompt | — |

Implementation: Add dropdown in Settings, prepend persona description to system prompt.

**Effort**: ~2 hours

---

### Module 7: Post-Game Summary ⭐ P3

**Goal**: Generate a full game review when the match ends.

Detect the `GameEnd` event, aggregate Memory data, and send to LLM for summary generation.

**Input**: Total KDA, total CS, total deaths, peak death streak, who killed you most, MVP moments
**Output**: A 100-200 word match review

**Effort**: ~2 hours

---

### Module 8: Vision Layer (Visual Perception) ⭐ P4 — Ultimate Form

**Goal**: Use screen capture + Gemini Live API to obtain visual information that the Live Client API cannot provide.

#### Core Problems Solved

| Previously Unavailable | With Visual Perception |
|---|---|
| Player position | ✅ Minimap reading |
| Teamfight happening | ✅ Screen chaos detection |
| Missed/landed abilities | ✅ Directly visible |
| Good/bad positioning | ✅ Observable |
| Teammate pings | ✅ Ping icons visible |
| Vision/wards | ✅ Visible on minimap |
| Farming vs. idling | ✅ Full-screen context |

#### Architecture Design

```
Screen Capture (screenshot-desktop, every 3-5 seconds)
        ↓
  Image Base64 Encoding
        ↓
  Gemini Live API (WebSocket persistent connection)
    - Send: screenshot + structured query
    - Receive: JSON-formatted scene analysis
        ↓
  Merge into Memory Store → Policy Engine → Trigger Roasts
```

#### Gemini Query Template

```
You are a LoL game analyst. Look at this screenshot and quickly answer:
1. What is the player doing? (laning/teamfighting/jungling/recalling/roaming/idling)
2. Any obvious mistakes? (missed abilities/bad positioning/not watching minimap)
3. How does the minimap situation look?
4. Are any teammates pinging?
Answer in JSON, one sentence per field.
```

#### Sampling Strategy (Cost Control)

| Scenario | Capture Frequency | Reason |
|---|---|---|
| Normal laning | Every 5 seconds | Low consumption |
| Death/kill detected | Immediate capture | Catch the scene |
| During teamfight | Every 2 seconds | Dense analysis |
| Dead, waiting to respawn | Paused | No need to analyze |

#### Cost Estimate

- One 30-minute game ≈ 360-600 screenshots
- Gemini Flash image processing: ~260 tokens/image
- Total cost approximately **$0.01-0.03/game** (using gemini-2.0-flash-lite)

#### Roast Upgrade Examples

| Before (Data Only) | After (Vision + Data) |
|---|---|
| "Dead again, that's the 3rd time" | "You missed that Q, then walked forward anyway — that's death #3, buddy" |
| "CS too low" | "You've been wandering around the river doing nothing" |
| "Teammate died" | "Your team is fighting top lane and you're farming jungle?" |

**Effort**: ~4-5 hours
**Prerequisite**: Requires Gemini API Key

---

## 4. Features Not Planned for Now

| Feature | Reason |
|---|---|
| TTS Emotion/Pause Control | Current Chinese TTS engines don't support fine-grained prosody control |
| Audio Mixing | Requires ffmpeg processing, adds complexity |
| Sound Effects System | Low priority, minimal UX improvement |

---

## 5. Implementation Roadmap

### Phase 1: Core Experience Upgrade (Est. 1 day)
```
1. Memory Store — Give the AI context awareness
2. Policy Engine — Frequency control + mood state machine
3. Pass champion name in prompt — Minimum effort, maximum impact
```
**After completion**: Roasts have context ("that's your 4th death"), escalation (more toxic as you die more), and champion memes.

### Phase 2: Content Enrichment (Est. 1 day)
```
4. Rhythm Roast — No longer event-only
5. Template Layer — Stabilize output quality
6. Personality System — Multiple styles
```
**After completion**: Commentary throughout the whole game, stable quality, selectable personas.

### Phase 3: Polish (Est. 0.5 day)
```
7. Post-Game Summary
8. Achievement System (e.g., 5 death streak triggers special announcement)
```

### Phase 4: Visual Perception (Est. 1 day)
```
9. Vision Layer — Screen capture + Gemini Live API
10. Vision-triggered roasts (missed abilities/positioning/idle detection)
```
**After completion**: The AI truly "sees" your gameplay — roasts reach caster-level commentary.

---

## 6. Estimated File Changes

| File | Change |
|---|---|
| `src/coach/memory.js` | New — Memory Store |
| `src/coach/policy.js` | New — Policy Engine |
| `src/coach/templates.js` | New — Template Layer |
| `src/coach/rhythm.js` | New — Rhythm Roast detection |
| `src/coach/gamestate.js` | Add Flash detection, item change detection |
| `src/coach/index.js` | Integrate new modules, refactor tick loop |
| `src/coach/llm.js` | Refactor prompt structure, accept Memory context |
| `src/config.js` | Add personality settings, Vision Layer toggle |
| `public/index.html` | Add personality dropdown, Vision Layer toggle in Settings |
| `src/coach/vision.js` | New — Screen capture + Gemini visual analysis (Phase 4) |

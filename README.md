# LoL Live Client Data Proxy

[English](README.md) | [简体中文](README_zh-CN.md)

A local proxy that exposes the League of Legends [Live Client Data API](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api) to your LAN, featuring an **AI Toxic Coach** that roasts you in real-time when you die.

## ✨ Features

- 🔍 **Auto Detection** — Automatically detects the LoL game client
- 🔄 **HTTP Proxy** — Proxies all `/liveclientdata/*` endpoints to LAN
- 📡 **WebSocket Push** — Real-time game data via WebSocket
- 📊 **Status Dashboard** — Web UI for game status, players, and events
- 🤖 **AI Toxic Coach** — LLM-powered roasts with dynamic themes (powered by Google Gemini)
- 🗣️ **Premium TTS** — ElevenLabs V3 Dialogue API with 60+ emotion audio tags, or free Edge TTS
- 🎵 **Web Audio Player** — Browser-based player with progress bar, pause/resume, replay, and history
- 🌐 **Multilingual** — Chinese & English UI and roast generation

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Start (development)
npm run dev

# Start (production)
npm start
```

Open `http://localhost:8099` in your browser to see the dashboard.

## Configuration

All settings are managed via `.env`:

```bash
# LLM (Google Gemini)
LLM_ENABLED=true
LLM_API_KEY=your_gemini_api_key
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_MODEL=gemini-2.0-flash

# TTS Provider: "edge" (free) or "elevenlabs" (paid, with emotion tags)
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=5mZxJZhSmJTjL7GoYfYI  # Karo Yang (Chinese)
```

### ElevenLabs Emotion Tags

When using ElevenLabs V3 Dialogue API, the AI coach can express emotions:

```
[laughs] [sighs] [sarcastic tone] [angry] [whispers] [shouts] ...
```

60+ tags are available including emotions, delivery styles, reactions, and pacing controls.

## 🤖 AI Toxic Coach

The coach triggers roasts based on in-game events:

| Event | Trigger |
|-------|---------|
| 💀 Death | Player dies |
| ⚔️ Kill | Player gets a kill |
| 💰 CS Gap | Poor CS performance |
| 🐷 Teammate Death | Teammate dies |
| 🐉 Objective | Dragon/Baron/Herald taken |

Each roast uses a random theme (e.g., "disappointed parent", "suggest uninstall", "compare to minions") for variety.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /status` | Service status |
| `GET /liveclientdata/allgamedata` | All game data |
| `GET /liveclientdata/activeplayer` | Active player |
| `GET /liveclientdata/playerlist` | Player list |
| `GET /liveclientdata/eventdata` | Game events |
| `GET /liveclientdata/gamestats` | Game statistics |
| `GET /audio/:hash` | Serve cached TTS audio |
| `WS /ws` | WebSocket real-time push |

## Package as CLI Executable

```bash
# Build for both Windows and Mac
npm run build

# Windows only
npm run build:win

# Mac only
npm run build:mac
```

Output in `dist/` directory. Users can run the executable directly without Node.js.

## �️ Desktop App (Electron)

Package as a desktop application with system tray and built-in browser window:

```bash
# Development
npm run electron:dev

# Build for Mac (.dmg)
npm run electron:build:mac

# Build for Windows (.exe installer)
npm run electron:build:win

# Build for both
npm run electron:build
```

Output in `dist-electron/` directory.

## �🚀 Automated Release (GitHub Actions)

```bash
git tag v0.2.0
git push origin v0.2.0
```

Pushing a tag triggers GitHub Actions to automatically build:
- **CLI**: `lol-proxy-win.exe` + `lol-proxy-macos` (via pkg)
- **Desktop**: `.dmg` (macOS) + `.exe` installer (Windows) (via electron-builder)

All artifacts are published on the GitHub Releases page.

## How It Works

1. Polls `https://127.0.0.1:2999/liveclientdata/allgamedata` to detect game status
2. Proxies all API requests to the local LoL client
3. Pushes game data via WebSocket to connected browsers
4. AI Coach monitors events → generates roasts via LLM → converts to speech via TTS → streams audio to browser

## License

MIT

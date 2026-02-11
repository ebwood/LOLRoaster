# LoL Live Client Data Proxy

[English](README.md) | [简体中文](README_zh-CN.md)

Expose the League of Legends [Live Client Data API](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api) to your local network (LAN) for access by other devices.

## Features

- 🔍 **Auto Detection** — Automatically detects if the LoL game client is running.
- 🔄 **HTTP Proxy** — Proxies all `/liveclientdata/*` endpoints.
- 📡 **WebSocket Push** — Pushes real-time game data via WebSocket.
- 📊 **Status Dashboard** — Web interface to view game status, player data, and events.

## Quick Start

```bash
# Install dependencies
npm install

# Start the service
npm start

# Development mode (auto-restart)
npm run dev
```

Once started, the LAN access address will be displayed. You can access it by entering this address in a browser on another device.

## Package as Executable (For End Users)

If you want to distribute this program to friends (who may not have Node.js installed), you can run the following commands to generate standalone executables for Windows (`.exe`) or macOS:

```bash
# Generate for both Windows and Mac
npm run build

# Generate for Windows only
npm run build:win

# Generate for Mac only
npm run build:mac
```

The generated files can be found in the `dist/` directory.

## 🚀 Automated Release Workflow (GitHub Actions)

This project is configured with an automated release workflow. To publish a new version:

1.  **Create a Tag**:
    ```bash
    git tag v1.0.0
    ```
2.  **Push the Tag**:
    ```bash
    git push origin v1.0.0
    ```

After pushing, GitHub Actions will automatically build the project and publish a new version on the GitHub repository's **Releases** page, including executables for Windows (`lol-proxy-win.exe`) and Mac (`lol-proxy-macos`).

## API Endpoints

| Endpoint | Description |
|------|------|
| `GET /status` | Proxy service status |
| `GET /liveclientdata/allgamedata` | All game data |
| `GET /liveclientdata/activeplayer` | Active player data |
| `GET /liveclientdata/activeplayerabilities` | Active player abilities |
| `GET /liveclientdata/activeplayername` | Active player name |
| `GET /liveclientdata/activeplayerrunes` | Active player runes |
| `GET /liveclientdata/eventdata` | Game events |
| `GET /liveclientdata/gamestats` | Game statistics |
| `GET /liveclientdata/playerlist` | Player list |
| `GET /liveclientdata/playeritems?summonerName=xxx` | Player items |
| `GET /liveclientdata/playerscores?summonerName=xxx` | Player scores |
| `GET /liveclientdata/playersummonerspells?summonerName=xxx` | Player summoner spells |
| `WS /ws` | WebSocket real-time push |

## WebSocket Message Format

```json
// Service Status
{ "type": "status", "gameRunning": true }

// Game Started
{ "type": "gameStarted" }

// Game Data (Pushed every second)
{ "type": "gameData", "data": { ... }, "timestamp": 1234567890 }

// Game Ended
{ "type": "gameEnded" }
```

## Configuration

Configure via environment variables:

```bash
PORT=8099 npm start   # Change port
```

## How It Works

1. The proxy service periodically polls `https://127.0.0.1:2999/liveclientdata/allgamedata` to detect game status.
2. Once the game is running, it proxies all API requests to the local LoL service.
3. It also pushes full game data every second via WebSocket.
4. The service binds to `0.0.0.0`, allowing other devices on the LAN to access it via IP.

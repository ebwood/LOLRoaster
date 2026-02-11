# LoL Live Client Data Proxy

将 LoL 英雄联盟游戏运行时的 [Live Client Data API](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api) 代理暴露到局域网，供其他设备访问。

## 功能

- 🔍 **自动检测** — 自动检测 LoL 游戏是否在运行
- 🔄 **HTTP 代理** — 代理转发所有 `/liveclientdata/*` 端点
- 📡 **WebSocket 推送** — 通过 WebSocket 实时推送游戏数据
- 📊 **状态面板** — Web 页面查看游戏状态、玩家数据、事件

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 开发模式 (自动重启)
npm run dev
```

启动后会显示局域网访问地址，在另一台电脑浏览器输入该地址即可访问。

## 打包成可执行文件 (给玩家使用)

如果你想把这个程序发给朋友使用（无需安装 Node.js），可以运行以下命令生成 `.exe` (Windows) 或可执行文件 (Mac)：

```bash
# 生成 Windows 和 Mac 版本
npm run build

# 仅生成 Windows 版本
npm run build:win

# 仅生成 Mac 版本
npm run build:mac
```

生成的文件位于 `dist/` 目录下。

## 🚀 自动发布流程 (GitHub Actions)

本项目配置了自动化发布流程。当你需要发布新版本时：

1.  **打标签**:
    ```bash
    git tag v1.0.0
    ```
2.  **推送标签**:
    ```bash
    git push origin v1.0.0
    ```

推送后，GitHub Actions 会自动构建项目，并在 GitHub 仓库的 **Releases** 页面发布新版本，包含 Windows (`.exe`) 和 Mac 可执行文件供下载。


## API 端点

| 端点 | 说明 |
|------|------|
| `GET /status` | 代理服务状态 |
| `GET /liveclientdata/allgamedata` | 所有游戏数据 |
| `GET /liveclientdata/activeplayer` | 当前玩家 |
| `GET /liveclientdata/activeplayerabilities` | 当前玩家技能 |
| `GET /liveclientdata/activeplayername` | 当前玩家名称 |
| `GET /liveclientdata/activeplayerrunes` | 当前玩家符文 |
| `GET /liveclientdata/eventdata` | 游戏事件 |
| `GET /liveclientdata/gamestats` | 游戏统计 |
| `GET /liveclientdata/playerlist` | 所有玩家列表 |
| `GET /liveclientdata/playeritems?summonerName=xxx` | 玩家装备 |
| `GET /liveclientdata/playerscores?summonerName=xxx` | 玩家分数 |
| `GET /liveclientdata/playersummonerspells?summonerName=xxx` | 召唤师技能 |
| `WS /ws` | WebSocket 实时推送 |

## WebSocket 消息格式

```json
// 游戏状态
{ "type": "status", "gameRunning": true }

// 游戏开始
{ "type": "gameStarted" }

// 游戏数据 (每秒推送)
{ "type": "gameData", "data": { ... }, "timestamp": 1234567890 }

// 游戏结束
{ "type": "gameEnded" }
```

## 配置

通过环境变量配置:

```bash
PORT=8099 npm start   # 修改端口
```

## 工作原理

1. 代理服务定期请求 `https://127.0.0.1:2999/liveclientdata/allgamedata` 检测游戏状态
2. 检测到游戏运行后，将所有 API 请求代理转发到 LoL 本地服务
3. 同时通过 WebSocket 每秒推送完整游戏数据
4. 服务绑定 `0.0.0.0` 允许局域网其他设备通过 IP 访问

# LoL 实时数据代理

[English](README.md) | [简体中文](README_zh-CN.md)

一个本地代理服务，将英雄联盟 [实时客户端数据 API](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api) 暴露到局域网，并内置 **AI 毒舌教练**，在你送人头时实时嘲讽你。

## ✨ 功能

- 🔍 **自动检测** — 自动检测 LoL 游戏客户端是否运行
- 🔄 **HTTP 代理** — 将所有 `/liveclientdata/*` 端点代理到局域网
- 📡 **WebSocket 推送** — 通过 WebSocket 实时推送游戏数据
- 📊 **数据面板** — Web 界面查看游戏状态、玩家数据和事件
- 🤖 **AI 毒舌教练** — 基于 LLM 的动态嘲讽，主题随机切换 (Google Gemini 驱动)
- 🗣️ **高级语音** — ElevenLabs V3 对话 API 支持 60+ 语气标签，或免费 Edge TTS
- 🎵 **网页播放器** — 浏览器内播放音频，支持暂停/继续/重播/历史记录
- 🌐 **双语支持** — 中英文界面和嘲讽

## 快速开始

```bash
# 安装依赖
npm install

# 复制并配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API 密钥

# 开发模式启动
npm run dev

# 生产模式启动
npm start
```

打开 `http://localhost:8099` 查看面板。

## 配置

所有设置通过 `.env` 管理：

```bash
# LLM (Google Gemini)
LLM_ENABLED=true
LLM_API_KEY=你的_Gemini_API_Key
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_MODEL=gemini-2.0-flash

# TTS 引擎: "edge" (免费) 或 "elevenlabs" (付费，支持语气标签)
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=你的_ElevenLabs_API_Key
ELEVENLABS_VOICE_ID=5mZxJZhSmJTjL7GoYfYI  # Karo Yang (中文)
```

### ElevenLabs 语气标签

使用 ElevenLabs V3 对话 API 时，AI 教练可以表达情感：

```
[laughs] [sighs] [sarcastic tone] [angry] [whispers] [shouts] ...
```

支持 60+ 标签，包括情感、语气、反应和语速控制。

## 🤖 AI 毒舌教练

教练会根据游戏事件触发嘲讽：

| 事件 | 触发条件 |
|------|---------|
| 💀 死亡 | 玩家阵亡 |
| ⚔️ 击杀 | 玩家击杀敌人 |
| 💰 漏刀 | 补刀表现差 |
| 🐷 队友阵亡 | 队友被击杀 |
| 🐉 目标 | 击杀龙/男爵/先锋 |

每次嘲讽使用随机主题（如"失望的父母"、"建议卸载"、"跟小兵比"）。

## API 端点

| 端点 | 描述 |
|------|------|
| `GET /status` | 服务状态 |
| `GET /liveclientdata/allgamedata` | 所有游戏数据 |
| `GET /liveclientdata/activeplayer` | 当前玩家数据 |
| `GET /liveclientdata/playerlist` | 所有玩家列表 |
| `GET /liveclientdata/eventdata` | 游戏事件 |
| `GET /liveclientdata/gamestats` | 游戏统计 |
| `GET /audio/:hash` | 获取缓存语音 |
| `WS /ws` | WebSocket 实时推送 |

## 打包为 CLI 可执行文件

```bash
# 同时生成 Windows 和 Mac 版本
npm run build

# 仅 Windows
npm run build:win

# 仅 Mac
npm run build:mac
```

输出文件在 `dist/` 目录，用户无需安装 Node.js 即可直接运行。

## 🖥️ 桌面应用 (Electron)

打包为带系统托盘的桌面应用，内嵌浏览器窗口：

```bash
# 开发模式
npm run electron:dev

# 打包 Mac (.dmg)
npm run electron:build:mac

# 打包 Windows (.exe 安装包)
npm run electron:build:win

# 同时打包
npm run electron:build
```

输出文件在 `dist-electron/` 目录。

## 🚀 自动发布 (GitHub Actions)

```bash
git tag v0.2.0
git push origin v0.2.0
```

推送 tag 后，GitHub Actions 会自动构建：
- **CLI**: `lol-proxy-win.exe` + `lol-proxy-macos` (via pkg)
- **桌面应用**: `.dmg` (macOS) + `.exe` 安装包 (Windows) (via electron-builder)

所有产物发布到 GitHub Releases 页面。

## 运行原理

1. 轮询 `https://127.0.0.1:2999/liveclientdata/allgamedata` 检测游戏状态
2. 将所有 API 请求代理到本地 LoL 客户端
3. 通过 WebSocket 将游戏数据推送到浏览器
4. AI 教练监听事件 → LLM 生成嘲讽 → TTS 转语音 → 流式推送到浏览器播放

## License

MIT

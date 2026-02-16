const http = require('http');
const config = require('./config.js');
const { GameDetector } = require('./detector.js');
const { createProxyServer } = require('./proxy.js');
const { createWebSocketService } = require('./websocket.js');
const coach = require('./coach/index.js');
const tts = require('./coach/tts.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Disable TLS certificate validation for LoL's self-signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Get local IP addresses for display
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🎮 LoL Roaster - AI Toxic Coach        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 1. Create game detector
  const detector = new GameDetector();

  // 2. Create Express proxy app
  const app = createProxyServer(detector);

  // 3. Create HTTP server
  const server = http.createServer(app);

  // Debug Endpoint for AI Coach (Only in Dev Mode)
  if (!process.pkg) {
    app.use(require('express').json()); // Ensure JSON body parsing
    app.post('/debug/roast', (req, res) => {
      try {
        const type = req.body.type || 'DEATH';
        coach.triggerDebugRoast(type);
        res.json({ status: 'ok', message: `Roast triggered: ${type}` });
      } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
      }
    });
  }

  // Audio serving endpoint (serve cached TTS MP3 files)
  app.get('/audio/:hash', (req, res) => {
    const hash = req.params.hash.replace(/[^a-f0-9]/gi, ''); // Sanitize
    const filePath = path.join(__dirname, '../cache_tts', `${hash}.mp3`);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).json({ error: 'Audio not found' });
    }
  });

  // App Info Endpoint
  app.get('/app-info', (req, res) => {
    res.json({
      version: require('../package.json').version,
      isPackaged: !!process.pkg,
      debugEnabled: process.env.DEBUG === 'true',
      ttsProvider: config.tts.provider || 'edge'
    });
  });

  // Settings API
  app.get('/settings', (req, res) => {
    res.json(config.getSettingsForUI());
  });

  app.post('/settings', require('express').json(), (req, res) => {
    try {
      // Handle language change for coach (runtime only, not saved to config.json)
      if (req.body.language) {
        coach.setLanguage(req.body.language);
      }
      // Only save to config.json when real settings fields are present
      const hasSettings = req.body.llmEnabled !== undefined || req.body.llmProvider ||
        req.body.llmApiKey || req.body.ttsProvider || req.body.elevenlabsApiKey ||
        req.body.ttsCache !== undefined;
      if (hasSettings) {
        config.updateConfig(req.body);
        // Hot-reload TTS config
        tts.reloadConfig();
      }
      res.json({ status: 'ok', message: 'Settings saved.' });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // TTS Cache Management
  app.post('/tts/clear-cache', (req, res) => {
    const count = tts.clearCache();
    res.json({ status: 'ok', count });
  });

  // 4. Attach WebSocket service
  const wss = createWebSocketService(server, detector);

  // 5. Relay TTS audio events to browser
  tts.on('audioReady', (data) => {
    const message = JSON.stringify({ type: 'audioReady', ...data });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(message);
    }
  });

  // 5. Start listening (auto-find available port)
  const startPort = parseInt(config.port, 10);
  let actualPort = startPort;

  function findAvailablePort(port, maxRetries = 10) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      function tryPort(p, retries) {
        const tester = net.createServer();
        tester.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && retries > 0) {
            console.log(`⚠️  端口 ${p} 被占用，尝试 ${p + 1}...`);
            tryPort(p + 1, retries - 1);
          } else {
            reject(err);
          }
        });
        tester.once('listening', () => {
          tester.close(() => resolve(p));
        });
        tester.listen(p, config.host);
      }
      tryPort(port, maxRetries);
    });
  }

  try {
    actualPort = await findAvailablePort(startPort);
  } catch (err) {
    console.error(`❌ 无法找到可用端口: ${err.message}`);
    process.exit(1);
  }

  module.exports.actualPort = actualPort;

  server.listen(actualPort, config.host, () => {
    const ips = getLocalIPs();
    console.log(`✅ 代理服务已启动:`);
    console.log(`   本机访问: http://localhost:${actualPort}`);
    for (const ip of ips) {
      console.log(`   局域网访问 (${ip.name}): http://${ip.address}:${actualPort}`);
    }
    if (actualPort !== startPort) {
      console.log(`   ⚠️  端口 ${startPort} 被占用，已自动切换到 ${actualPort}`);
    }
    console.log('');
    console.log('📋 可用端点:');
    console.log(`   GET /status                              - 服务状态`);
    console.log(`   GET /liveclientdata/allgamedata           - 所有游戏数据`);
    console.log(`   GET /liveclientdata/activeplayer           - 当前玩家数据`);
    console.log(`   GET /liveclientdata/playerlist             - 所有玩家列表`);
    console.log(`   GET /liveclientdata/eventdata              - 游戏事件`);
    console.log(`   GET /liveclientdata/gamestats              - 游戏统计`);
    console.log(`   WS  /ws                                   - WebSocket 实时推送`);
    console.log('');
  });

  // 6. Start game detection
  detector.start();

  // 7. Start Toxic AI Coach
  try {
    coach.start();
  } catch (e) {
    console.error('Failed to start AI Coach:', e);
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭代理服务...');
    detector.stop();
    coach.stop();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    detector.stop();
    coach.stop();
    server.close();
    process.exit(0);
  });
}

main().catch(console.error);

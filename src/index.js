const http = require('http');
const config = require('./config.js');
const { GameDetector } = require('./detector.js');
const { createProxyServer } = require('./proxy.js');
const { createWebSocketService } = require('./websocket.js');
const coach = require('./coach/index.js');
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
  console.log('║   🎮 LoL Live Client Data Proxy          ║');
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

  // App Info Endpoint
  app.get('/app-info', (req, res) => {
    res.json({
      version: require('../package.json').version,
      isPackaged: !!process.pkg,
      debugEnabled: !process.pkg
    });
  });

  // 4. Attach WebSocket service
  createWebSocketService(server, detector);

  // 5. Start listening
  server.listen(config.port, config.host, () => {
    const ips = getLocalIPs();
    console.log(`✅ 代理服务已启动:`);
    console.log(`   本机访问: http://localhost:${config.port}`);
    for (const ip of ips) {
      console.log(`   局域网访问 (${ip.name}): http://${ip.address}:${config.port}`);
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

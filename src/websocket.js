const { WebSocketServer } = require('ws');
const config = require('./config.js');

/**
 * WebSocket service that pushes real-time game data to connected clients.
 * 
 * @param {import('http').Server} server
 * @param {import('./detector.js').GameDetector} detector
 */
function createWebSocketService(server, detector) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  let pushTimer = null;

  wss.on('connection', (ws) => {
    console.log(`📡 WebSocket 客户端已连接 (当前 ${wss.clients.size} 个)`);

    // Send current status immediately
    ws.send(JSON.stringify({
      type: 'status',
      gameRunning: detector.isGameRunning,
      timestamp: Date.now(),
    }));

    // If game is running, send current data
    if (detector.isGameRunning && detector.lastGameData) {
      ws.send(JSON.stringify({
        type: 'gameData',
        data: detector.lastGameData,
        timestamp: Date.now(),
      }));
    }

    ws.on('close', () => {
      console.log(`📡 WebSocket 客户端已断开 (剩余 ${wss.clients.size} 个)`);
    });
  });

  // Start pushing data when game starts
  detector.on('gameStarted', () => {
    broadcast(wss, { type: 'gameStarted', timestamp: Date.now() });
    startPushing();
  });

  // Stop pushing when game ends
  detector.on('gameEnded', () => {
    broadcast(wss, { type: 'gameEnded', timestamp: Date.now() });
    stopPushing();
  });

  function startPushing() {
    stopPushing();
    pushTimer = setInterval(async () => {
      if (!detector.isGameRunning) return;

      try {
        const response = await fetch(`${config.lolApiUrl}/allgamedata`, {
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          const data = await response.json();
          broadcast(wss, {
            type: 'gameData',
            data,
            timestamp: Date.now(),
          });
        }
      } catch {
        // Ignore fetch errors during push
      }
    }, config.detectInterval); // Re-using detectInterval or a specific push interval if defined
  }

  function stopPushing() {
    if (pushTimer) {
      clearInterval(pushTimer);
      pushTimer = null;
    }
  }

  return wss;
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
function broadcast(wss, data) {
  const message = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}

module.exports = { createWebSocketService };

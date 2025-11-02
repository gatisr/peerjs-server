const { PeerServer } = require("peer");
const WebSocket = require('ws');

// Log levels: ERROR(0) < WARN(1) < INFO(2) < DEBUG(3)
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Get log level from environment or default to INFO
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Enhanced logging with level control
const log = {
  error: (message, meta) => {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      const timestamp = new Date().toISOString();
      console.error(`\x1b[31m[ERROR]\x1b[0m [${timestamp}] ${message}`);
      if (meta && Object.keys(meta).length > 0) {
        console.error(JSON.stringify(meta, null, 2));
      }
    }
  },
  warn: (message, meta) => {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      const timestamp = new Date().toISOString();
      console.warn(`\x1b[33m[WARN]\x1b[0m [${timestamp}] ${message}`);
      if (meta && Object.keys(meta).length > 0) {
        console.warn(JSON.stringify(meta, null, 2));
      }
    }
  },
  info: (message, meta) => {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      const timestamp = new Date().toISOString();
      console.log(`\x1b[36m[INFO]\x1b[0m [${timestamp}] ${message}`);
      if (meta && Object.keys(meta).length > 0) {
        console.log(JSON.stringify(meta, null, 2));
      }
    }
  },
  debug: (message, meta) => {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      const timestamp = new Date().toISOString();
      console.debug(`\x1b[35m[DEBUG]\x1b[0m [${timestamp}] ${message}`);
      if (meta && Object.keys(meta).length > 0) {
        console.debug(JSON.stringify(meta, null, 2));
      }
    }
  }
};

// Parse environment variables
const allowedOrigins = process.env.CORS_ORIGINS || '*';
const useCredentials = process.env.USE_CREDENTIALS === 'true';
const verifyWsOrigin = process.env.VERIFY_WS_ORIGIN !== 'false';
const enableRateLimit = process.env.ENABLE_RATE_LIMIT === 'true';
const maxConnectionsPerIP = parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 50;
const connectionTimeoutMs = parseInt(process.env.CONNECTION_TIMEOUT_MS) || 300000; // 5 min
const wsStats = {
  totalConnections: 0,
  activeConnections: 0,
  totalMessages: 0,
  totalBytesReceived: 0,
  totalBytesSent: 0,
  errors: 0,
  byIP: {}
};


const corsStats = {
  http: { allowed: 0, blocked: 0 },
  websocket: {
    allowed: 0,
    blocked: 0,
    noOrigin: 0,
    byOrigin: {} // Add this initialization
  }
};

function isOriginAllowed(origin) {
  if (!origin) return false;

  if (allowedOrigins === '*') return true;

  const originsArray = allowedOrigins.split(',').map(o => o.trim());
  return originsArray.includes(origin);
}


// Validate CORS configuration
if (allowedOrigins === '*' && useCredentials) {
  log.error('INVALID CONFIGURATION: CORS wildcard "*" cannot be used with credentials enabled!');
  log.warn('Server will start, but CORS will not work correctly. Set specific origins or disable credentials.');
}

const options = {
  port: parseInt(process.env.PORT) || 9000,
  path: process.env.PEERJS_PATH || '/peerjs',
  key: process.env.KEY || 'peerjs',
  expire_timeout: parseInt(process.env.EXPIRE_TIMEOUT) || 5000,
  alive_timeout: parseInt(process.env.ALIVE_TIMEOUT) || 60000,
  allow_discovery: process.env.ALLOW_DISCOVERY === 'true',
  concurrent_limit: parseInt(process.env.CONCURRENT_LIMIT) || 5000,
  proxied: process.env.PROXIED === 'true',
  cors: {
    origin: (origin, callback) => {
      log.debug('HTTP CORS check', { origin: origin || 'NONE' });
      // Handle requests without origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        if (allowedOrigins === '*') {
          corsStats.http.allowed++;
          callback(null, true);
        } else {
          corsStats.http.blocked++;
          log.warn('HTTP CORS: Blocked - no origin');
          callback(new Error('No origin header'));
        }
        return;
      }

      if (isOriginAllowed(origin)) {
        corsStats.http.allowed++;
        log.info(`HTTP CORS: ✅ Allowed ${origin}`);
        callback(null, true);
      } else {
        corsStats.http.blocked++;
        log.warn(`HTTP CORS: ❌ Blocked ${origin}`);
        callback(new Error('Origin not allowed'));
      }
    },
    credentials: useCredentials,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
  },
  // Custom WebSocket Server with Origin Verification
  // PeerJS calls this function internally to create the WebSocket server
  createWebSocketServer: (serverOptions) => {
    log.info('🔌 Creating custom WebSocket server', {
      path: serverOptions.path,
      originVerification: verifyWsOrigin,
      allowedOrigins: allowedOrigins,
      rateLimit: enableRateLimit,
      maxConnectionsPerIP: maxConnectionsPerIP,
      connectionTimeout: `${connectionTimeoutMs}ms`
    });

    // Track active connections per IP in real-time
    const activeConnectionsByIP = new Map();

    const wss = new WebSocket.Server({
      ...serverOptions,

      // ===== CONNECTION VERIFICATION =====
      verifyClient: (info, callback) => {
        try {
          const origin = info.origin || info.req?.headers?.origin;
          const ip = info.req?.socket?.remoteAddress || 'unknown';
          const userAgent = info.req?.headers?.['user-agent'] || 'unknown';

          log.debug('WebSocket connection attempt', {
            origin: origin || 'NONE',
            ip: ip,
            userAgent: userAgent,
            url: info.req?.url || 'unknown'
          });

          // Track by IP (skip if IP is unknown)
          if (ip !== 'unknown') {
            if (!wsStats.byIP[ip]) {
              wsStats.byIP[ip] = { attempts: 0, connections: 0, blocked: 0, rateLimited: 0 };
            }
            wsStats.byIP[ip].attempts++;

            // ===== RATE LIMITING =====
            if (enableRateLimit) {
              const currentConnections = activeConnectionsByIP.get(ip) || 0;

              if (currentConnections >= maxConnectionsPerIP) {
                wsStats.byIP[ip].blocked++;
                wsStats.byIP[ip].rateLimited++;

                log.warn('WebSocket: ⛔ Rate limit exceeded', {
                  ip: ip,
                  currentConnections: currentConnections,
                  maxAllowed: maxConnectionsPerIP,
                  origin: origin || 'NONE'
                });

                callback(false, 429, `Too many connections from IP. Max ${maxConnectionsPerIP} allowed.`);
                return;
              }
            }
          }

          // Origin verification
          if (!verifyWsOrigin) {
            if (ip !== 'unknown') wsStats.byIP[ip].connections++;
            log.debug('WebSocket: Origin verification disabled, allowing');
            callback(true);
            return;
          }

          if (!origin) {
            corsStats.websocket.noOrigin++;
            if (allowedOrigins === '*') {
              corsStats.websocket.allowed++;
              if (ip !== 'unknown') wsStats.byIP[ip].connections++;
              log.debug('WebSocket: No origin, allowing (wildcard mode)');
              callback(true);
            } else {
              corsStats.websocket.blocked++;
              if (ip !== 'unknown') wsStats.byIP[ip].blocked++;
              log.warn('WebSocket: ❌ Blocked - no origin header', { ip });
              callback(false, 403, 'Origin header required');
            }
            return;
          }

          // Track by origin - safely
          const originKey = String(origin).substring(0, 200); // Limit key length
          if (!corsStats.websocket.byOrigin) {
            corsStats.websocket.byOrigin = {};
          }
          if (!corsStats.websocket.byOrigin[originKey]) {
            corsStats.websocket.byOrigin[originKey] = { allowed: 0, blocked: 0 };
          }

          if (isOriginAllowed(origin)) {
            corsStats.websocket.allowed++;
            corsStats.websocket.byOrigin[originKey].allowed++;
            if (ip !== 'unknown') wsStats.byIP[ip].connections++;
            log.info(`WebSocket: ✅ Allowed ${origin}`, { ip });
            callback(true);
          } else {
            corsStats.websocket.blocked++;
            corsStats.websocket.byOrigin[originKey].blocked++;
            if (ip !== 'unknown') wsStats.byIP[ip].blocked++;
            log.warn(`WebSocket: ❌ Blocked ${origin}`, { ip });
            callback(false, 403, 'Origin not allowed');
          }
        } catch (error) {
          log.error('Error in verifyClient', {
            error: error.message,
            stack: error.stack,
            origin: info?.origin,
            ip: info?.req?.socket?.remoteAddress
          });
          callback(false, 500, 'Internal server error');
        }
      }
    });

    // ===== WEBSOCKET SERVER EVENTS =====

    wss.on('listening', () => {
      log.info('✅ WebSocket server is listening', {
        path: serverOptions.path,
        server: serverOptions.server ? 'attached' : 'standalone'
      });
    });

    wss.on('connection', (socket, request) => {
      let connectionTimeoutHandle = null;

      try {
        wsStats.totalConnections++;
        wsStats.activeConnections++;

        const ip = request?.socket?.remoteAddress || 'unknown';
        const origin = request?.headers?.origin || 'unknown';

        // Track active connections per IP
        if (ip !== 'unknown') {
          activeConnectionsByIP.set(ip, (activeConnectionsByIP.get(ip) || 0) + 1);
        }

        // Safely extract peer info from URL
        let peerId = 'unknown';
        try {
          if (request?.url) {
            const queryString = request.url.split('?')[1];
            if (queryString) {
              const urlParams = new URLSearchParams(queryString);
              peerId = urlParams.get('id') || 'unknown';
            }
          }
        } catch (urlError) {
          log.warn('Failed to parse URL parameters', {
            error: urlError.message,
            url: request?.url
          });
        }

        log.info('🔗 WebSocket connection established', {
          ip: ip,
          origin: origin,
          peerId: peerId,
          activeConnections: wsStats.activeConnections,
          totalConnections: wsStats.totalConnections,
          connectionsFromThisIP: activeConnectionsByIP.get(ip) || 0
        });

        // ===== CONNECTION TIMEOUT =====
        if (connectionTimeoutMs > 0) {
          connectionTimeoutHandle = setTimeout(() => {
            log.warn('⏰ Connection timeout reached', {
              peerId: peerId,
              ip: ip,
              timeout: `${connectionTimeoutMs}ms`
            });

            try {
              socket.close(1000, 'Connection timeout');
            } catch (error) {
              log.error('Error closing timed out socket', {
                peerId: peerId,
                error: error.message
              });
            }
          }, connectionTimeoutMs);
        }

        // ===== INDIVIDUAL SOCKET EVENTS =====

        const socketMeta = {
          connectedAt: Date.now(),
          ip: ip,
          origin: origin,
          peerId: peerId,
          messageCount: 0,
          bytesReceived: 0,
          bytesSent: 0
        };

        socket.on('message', (data) => {
          try {
            wsStats.totalMessages++;
            socketMeta.messageCount++;

            let messageSize = 0;
            if (data) {
              messageSize = Buffer.isBuffer(data)
                ? data.length
                : Buffer.byteLength(String(data));
            }

            wsStats.totalBytesReceived += messageSize;
            socketMeta.bytesReceived += messageSize;

            log.debug('📨 WebSocket message received', {
              peerId: peerId,
              size: `${messageSize} bytes`,
              totalMessages: socketMeta.messageCount
            });

            // Reset timeout on activity (keep-alive behavior)
            if (connectionTimeoutHandle && connectionTimeoutMs > 0) {
              clearTimeout(connectionTimeoutHandle);
              connectionTimeoutHandle = setTimeout(() => {
                log.warn('⏰ Connection timeout (inactivity)', {
                  peerId: peerId,
                  ip: ip
                });
                socket.close(1000, 'Inactivity timeout');
              }, connectionTimeoutMs);
            }
          } catch (error) {
            log.error('Error processing message', {
              peerId: peerId,
              error: error.message
            });
          }
        });

        socket.on('close', (code, reason) => {
          try {
            // Clear timeout
            if (connectionTimeoutHandle) {
              clearTimeout(connectionTimeoutHandle);
              connectionTimeoutHandle = null;
            }

            wsStats.activeConnections = Math.max(0, wsStats.activeConnections - 1);

            // Decrease IP connection count
            if (ip !== 'unknown') {
              const currentCount = activeConnectionsByIP.get(ip) || 0;
              if (currentCount <= 1) {
                activeConnectionsByIP.delete(ip);
              } else {
                activeConnectionsByIP.set(ip, currentCount - 1);
              }
            }

            const duration = Date.now() - socketMeta.connectedAt;
            const durationSeconds = (duration / 1000).toFixed(2);

            // Safely convert reason to string
            let reasonStr = 'No reason provided';
            if (reason) {
              reasonStr = Buffer.isBuffer(reason)
                ? reason.toString('utf8')
                : String(reason);
            }

            log.info('🔌 WebSocket connection closed', {
              peerId: peerId,
              ip: ip,
              code: code || 'unknown',
              reason: reasonStr,
              duration: `${durationSeconds}s`,
              messagesExchanged: socketMeta.messageCount,
              bytesReceived: `${(socketMeta.bytesReceived / 1024).toFixed(2)} KB`,
              bytesSent: `${(socketMeta.bytesSent / 1024).toFixed(2)} KB`,
              activeConnections: wsStats.activeConnections,
              remainingFromThisIP: activeConnectionsByIP.get(ip) || 0
            });
          } catch (error) {
            log.error('Error in close handler', {
              peerId: peerId,
              error: error.message
            });
          }
        });

        socket.on('error', (error) => {
          try {
            wsStats.errors++;

            log.error('❌ WebSocket socket error', {
              peerId: peerId,
              ip: ip,
              error: error?.message || 'Unknown error',
              code: error?.code || 'NO_CODE',
              errno: error?.errno
            });
          } catch (logError) {
            console.error('Failed to log socket error:', logError);
          }
        });

        socket.on('ping', () => {
          log.debug('🏓 Ping received', { peerId: peerId });

          // Reset timeout on ping
          if (connectionTimeoutHandle && connectionTimeoutMs > 0) {
            clearTimeout(connectionTimeoutHandle);
            connectionTimeoutHandle = setTimeout(() => {
              log.warn('⏰ Connection timeout (no pong)', { peerId: peerId });
              socket.close(1000, 'Ping timeout');
            }, connectionTimeoutMs);
          }
        });

        socket.on('pong', () => {
          log.debug('🏓 Pong received', { peerId: peerId });
        });

        // Track outgoing messages with error handling
        const originalSend = socket.send.bind(socket);
        socket.send = function (data, ...args) {
          try {
            let size = 0;
            if (data) {
              size = Buffer.isBuffer(data)
                ? data.length
                : Buffer.byteLength(String(data));
            }

            wsStats.totalBytesSent += size;
            socketMeta.bytesSent += size;

            log.debug('📤 WebSocket message sent', {
              peerId: peerId,
              size: `${size} bytes`
            });

            return originalSend(data, ...args);
          } catch (error) {
            log.error('Error sending message', {
              peerId: peerId,
              error: error.message
            });
            throw error;
          }
        };
      } catch (error) {
        log.error('Error in connection handler', {
          error: error.message,
          stack: error.stack
        });

        // Cleanup on error
        if (connectionTimeoutHandle) {
          clearTimeout(connectionTimeoutHandle);
        }

        wsStats.activeConnections = Math.max(0, wsStats.activeConnections - 1);

        const ip = request?.socket?.remoteAddress;
        if (ip && ip !== 'unknown') {
          const currentCount = activeConnectionsByIP.get(ip) || 0;
          if (currentCount <= 1) {
            activeConnectionsByIP.delete(ip);
          } else {
            activeConnectionsByIP.set(ip, currentCount - 1);
          }
        }
      }
    });

    wss.on('error', (error) => {
      log.error('💥 WebSocket server error', {
        error: error?.message || 'Unknown error',
        code: error?.code,
        errno: error?.errno,
        stack: error?.stack
      });
    });

    wss.on('close', () => {
      log.warn('🛑 WebSocket server closed');

      // Clear all active connections tracking
      activeConnectionsByIP.clear();
    });

    // ===== PERIODIC HEALTH CHECK =====
    const healthCheckInterval = setInterval(() => {
      try {
        if (!wss || !wss.clients) {
          log.warn('WebSocket server or clients not available for health check');
          return;
        }

        const clients = Array.from(wss.clients);
        const healthyClients = clients.filter(ws => ws.readyState === WebSocket.OPEN).length;
        const connectingClients = clients.filter(ws => ws.readyState === WebSocket.CONNECTING).length;
        const closingClients = clients.filter(ws => ws.readyState === WebSocket.CLOSING).length;
        const closedClients = clients.filter(ws => ws.readyState === WebSocket.CLOSED).length;

        log.debug('🏥 WebSocket health check', {
          totalClients: clients.length,
          healthy: healthyClients,
          connecting: connectingClients,
          closing: closingClients,
          closed: closedClients,
          statsActive: wsStats.activeConnections,
          activeIPsCount: activeConnectionsByIP.size,
          rateLimitEnabled: enableRateLimit
        });

        // Cleanup dead connections
        let cleanedUp = 0;
        clients.forEach((ws) => {
          try {
            if (ws.readyState === WebSocket.CLOSED) {
              ws.terminate();
              cleanedUp++;
            }
          } catch (error) {
            log.warn('Error terminating closed socket', {
              error: error.message
            });
          }
        });

        if (cleanedUp > 0) {
          log.debug(`🧹 Cleaned up ${cleanedUp} closed WebSocket(s)`);
        }

        // Log top IPs if rate limiting is enabled
        if (enableRateLimit && activeConnectionsByIP.size > 0) {
          const topIPs = Array.from(activeConnectionsByIP.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([ip, count]) => ({ ip, activeConnections: count }));

          log.debug('📊 Top IPs by active connections', { topIPs });
        }
      } catch (error) {
        log.error('Error in health check', {
          error: error.message,
          stack: error.stack
        });
      }
    }, 60000);

    // Cleanup interval on server close
    wss.on('close', () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        log.debug('Health check interval cleared');
      }
    });

    return wss;
  }
};



const peerServer = PeerServer(options);

// Track active connections with detailed info
const activeConnections = new Map();

// Message type counter
const messageStats = {
  OPEN: 0,
  OFFER: 0,
  ANSWER: 0,
  CANDIDATE: 0,
  LEAVE: 0,
  EXPIRE: 0,
  HEARTBEAT: 0,
  ERROR: 0
};

// Connection event
peerServer.on('connection', (client) => {
  const clientId = client.getId();
  const connectionTime = Date.now();

  activeConnections.set(clientId, {
    id: clientId,
    connectedAt: connectionTime,
    messageCount: 0
  });

  log.info(`Client connected: ${clientId}`, {
    clientId: clientId,
    totalActiveClients: activeConnections.size,
    maxAllowed: options.concurrent_limit,
    utilizationPercent: ((activeConnections.size / options.concurrent_limit) * 100).toFixed(2),
    connectedAt: new Date(connectionTime).toISOString()
  });
});

// Disconnect event
peerServer.on('disconnect', (client) => {
  const clientId = client.getId();
  const clientData = activeConnections.get(clientId);

  if (clientData) {
    const duration = Date.now() - clientData.connectedAt;
    const durationSeconds = (duration / 1000).toFixed(2);

    log.info(`Client disconnected: ${clientId}`, {
      clientId: clientId,
      sessionDuration: `${durationSeconds}s`,
      totalMessages: clientData.messageCount,
      remainingClients: activeConnections.size - 1,
      disconnectedAt: new Date().toISOString()
    });

    activeConnections.delete(clientId);
  } else {
    log.warn(`Client disconnected but not tracked: ${clientId}`, {
      clientId: clientId,
      note: 'This client was not found in active connections map'
    });
  }
});

// Message event with detailed tracking
peerServer.on('message', (client, message) => {
  const clientId = client.getId();
  const clientData = activeConnections.get(clientId);

  if (clientData) {
    clientData.messageCount++;
  }

  // Track message types
  if (messageStats.hasOwnProperty(message.type)) {
    messageStats[message.type]++;
  }

  log.debug(`Message received`, {
    from: clientId,
    to: message.dst,
    type: message.type,
    hasPayload: !!message.payload,
    payloadSize: message.payload ? message.payload.length : 0
  });
});

// Error event
peerServer.on('error', (error) => {
  log.error('Server error occurred', {
    errorMessage: error.message,
    errorName: error.name,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
});

// Enhanced server stats (every 30 seconds)
setInterval(() => {
  const memUsage = process.memoryUsage();
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = formatUptime(uptimeSeconds);

  log.info('Server statistics', {
    connections: {
      active: activeConnections.size,
      max: options.concurrent_limit,
      utilizationPercent: ((activeConnections.size / options.concurrent_limit) * 100).toFixed(2)
    },
    messages: messageStats,
    uptime: {
      seconds: uptimeSeconds.toFixed(0),
      formatted: uptimeFormatted
    },
    memory: {
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`
    },
    timestamp: new Date().toISOString()
  });
}, 30000);

// Format uptime helper
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// Graceful shutdown
const shutdown = (signal) => {
  log.info(`${signal} received, initiating graceful shutdown`, {
    signal: signal,
    activeConnections: activeConnections.size,
    timestamp: new Date().toISOString()
  });

  // Close all active connections
  let closedCount = 0;
  activeConnections.forEach((clientData, id) => {
    log.debug(`Closing connection for client: ${id}`);
    closedCount++;
  });

  log.info('Shutdown complete', {
    closedConnections: closedCount,
    timestamp: new Date().toISOString()
  });

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Get log level name for display
function getLogLevelName(level) {
  return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'UNKNOWN';
}

// Startup banner
console.log('\n' + '='.repeat(70));
log.info('🚀 PeerJS Server Starting', {
  version: require('./package.json').version || 'unknown',
  nodeVersion: process.version,
  platform: process.platform,
  pid: process.pid,
  logLevel: getLogLevelName(currentLogLevel)
});
console.log('='.repeat(70));

log.info('📋 Server Configuration', {
  network: {
    port: options.port,
    path: options.path,
    proxied: options.proxied
  },
  security: {
    apiKey: options.key,
    allowDiscovery: options.allow_discovery
  },
  cors: {
    origins: allowedOrigins,
    credentials: useCredentials,
    isValid: !(allowedOrigins === '*' && useCredentials),
    httpEndpoints: 'Enabled',
    websocketVerification: verifyWsOrigin ? 'Enabled ✅' : 'Disabled ⚠️'
  },
  limits: {
    concurrentConnections: options.concurrent_limit,
    expireTimeout: `${options.expire_timeout}ms`,
    aliveTimeout: `${options.alive_timeout}ms`
  },
  logging: {
    level: getLogLevelName(currentLogLevel),
    description: currentLogLevel === LOG_LEVELS.ERROR ? 'Only errors' :
      currentLogLevel === LOG_LEVELS.WARN ? 'Warnings and errors' :
        currentLogLevel === LOG_LEVELS.INFO ? 'Info, warnings and errors' :
          'All messages including debug'
  }
});

log.info('🌐 Available Endpoints', {
  health: `http://localhost:${options.port}${options.path}`,
  getId: `GET ${options.path}/${options.key}/id`,
  getPeers: `GET ${options.path}/${options.key}/peers ${!options.allow_discovery ? '(❌ disabled)' : '(✅ enabled)'}`,
  websocket: `ws://localhost:${options.port}${options.path}/peerjs`
});

console.log('='.repeat(70));
log.info('✅ Server is ready and listening for connections');
console.log('='.repeat(70) + '\n');
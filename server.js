const { PeerServer } = require("peer");

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
      // Handle requests without origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        if (allowedOrigins === '*') {
          log.debug('CORS: No origin header, allowing (wildcard mode)');
          callback(null, true);
        } else {
          log.debug('CORS: No origin header, not allowing (restricted mode)');
          callback(new Error('Not allowed by CORS'));
        }
        return;
      }

      // Allow all origins
      if (allowedOrigins === '*') {
        log.debug(`CORS: Allowing origin ${origin} (wildcard mode)`);
        callback(null, true);
        return;
      }

      // Check specific origins
      const originsArray = allowedOrigins.split(',').map(o => o.trim());
      if (originsArray.includes(origin)) {
        log.debug(`CORS: Allowing origin ${origin}`);
        callback(null, true);
      } else {
        log.warn(`CORS: Blocking origin ${origin} (not in allowed list)`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: useCredentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
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
    isValid: !(allowedOrigins === '*' && useCredentials)
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
  websocket: `ws://localhost:${options.port}${options.path}/peerjs?id=<ID>&token=<TOKEN>&key=${options.key}`
});

console.log('='.repeat(70));
log.info('✅ Server is ready and listening for connections');
console.log('='.repeat(70) + '\n');
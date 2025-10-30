const { PeerServer } = require('peer');

const peerServer = PeerServer({
  port: process.env.PORT || 9000,
  path: '/peerjs',
  allow_discovery: true,
  cors: {
    origin: true,
    credentials: true
  }
});

console.log(`PeerJS Server running on port ${peerServer.options.port}`);

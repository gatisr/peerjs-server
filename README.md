# PeerJS Server - Docker Setup

Simple PeerJS server setup with Docker Compose, allowing you to easily run a WebRTC signaling server locally or in the cloud.

## 🚀 Quick Start (Local)

### Prerequisites

- Docker and Docker Compose installed
- Port 9000 free (or change in `.env` file)

### 1. Configure environment

```bash
cp .env.example .env
# Edit the .env file as needed
```

### 2. Start the server

```bash
chmod +x start.sh
./start.sh
```

## ⚙️ Configuration Parameters

| Parameter         | Default | Description                       | Example Value |
|-------------------|---------|-----------------------------------|---------------|
| `PORT`            | 9000    | Docker exposed port               | 9008          |
| `PEERJS_PATH`     | /peerjs | Base path for PeerJS server       | '/myapp'      |
| `ALIVE_TIMEOUT`   | 60000   | Keep-alive timeout (ms)           | 120000        |
| `EXPIRE_TIMEOUT`  | 5000    | Time (ms) until peer ID deletion  | 10000         |
| `CONCURRENT_LIMIT`| 5000    | Max concurrent connections        | 10000         |
| `ALLOW_DISCOVERY` | true    | Allow /peers endpoint             | 'false'       |
| `CORS_ORIGINS`    | *       | CORS allowed origins              | '<https://example.com>, <https://another.com>' |
| `KEY`             | peerjs  | Default API key                   | 'myapp'       |
| `USE_CREDENTIALS` | false   | Use credentials for connections   | 'true'        |
| `PROXIED`         | false   | Enable if behind a proxy          | 'true'        |
| `LOG_LEVEL`       | INFO    | Logging level (DEBUG, INFO, WARN, ERROR) | DEBUG         |

// mention about render.yaml, railway.toml and fly.toml in here

## ☁️ Deployment

You can deploy the PeerJS server to various cloud platforms. Below are example configuration files for some popular services:

- **Railway**: See [railway.toml](railway.toml) for configuration.
- **Fly.io**: See [fly.toml](fly.toml) for configuration.
- **Render**: See [render.yaml](render.yaml) for configuration.

## 📚 Resources

- [PeerJS Documentation](https://peerjs.com/docs/)
- [PeerJS Server GitHub](https://github.com/peers/peerjs-server)
- [Docker Hub Image](https://hub.docker.com/r/peerjs/peerjs-server)

## 📄 License

MIT

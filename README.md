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
| `VERIFY_WS_ORIGIN` | true    | Verify WebSocket origin header    | 'false'       |
| `PROXIED`         | false   | Enable if behind a proxy          | 'true'        |
| `LOG_LEVEL`       | INFO    | Logging level (DEBUG, INFO, WARN, ERROR) | DEBUG         |
| `ENABLE_RATE_LIMIT` | false   | Enable rate limiting              | 'true'        |
| `MAX_CONNECTIONS_PER_IP` | 50       | Max connections per IP (0 = unlimited) | 10            |
| `CONNECTION_TIMEOUT_MS` | 300000   | Connection timeout in ms. Closes websocket if no activity in this time. | 60000         |

## ☁️ Deployment

You can deploy the PeerJS server to various cloud platforms. Below are example configuration files for some popular services:

- **[Railway](https://railway.app/)**: See [railway.toml](railway.toml) for configuration.
- **[Fly.io](https://fly.io/)**: See [fly.toml](fly.toml) for configuration.
- **[Render](https://render.com/)**: See [render.yaml](render.yaml) for configuration.

### Railway Deployment

1. Sign up or log in to [Railway](https://railway.app/).
2. Create a new project and link your GitHub repository.
3. Deploying will start automatically.
4. Set the environment variables from the `.env` file in the Railway project settings. Most importantly, check the:
    - `CORS_ORIGINS` variable to allow your frontend application to connect to localhost during development and production (depending on your domain e.g. `http://localhost:3000,https://yourdomain.com`).
    - `USE_CREDENTIALS` variable to `true` if you want to use credentials for connections.
    - `ENABLE_RATE_LIMIT` variable to `true` to enable rate limiting.
    - `MAX_CONNECTIONS_PER_IP` variable to set the maximum connections per IP.
    - `CONNECTION_TIMEOUT_MS` variable to set the connection timeout in milliseconds.
    - `PROXIED` variable to `true` if you are deploying behind a proxy.
    - `PORT` there are limitations on Railway for custom ports, so it's best to use ports between 0 and 65535

### Fly.io Deployment

1. Sign up or log in to [Fly.io](https://fly.io/).
2. Deploy your GIT repository

### Render Deployment

1. Sign up or log in to [Render](https://render.com/).
2. Add a new Web Service and connect your GitHub repository.
3. Set the environment variables from the `.env` file in the Render service settings. Most importantly, check the:
    - `CORS_ORIGINS` variable to allow your frontend application to connect to localhost during development and production (depending on your domain e.g. `http://localhost:3000,https://yourdomain.com`).
    - `USE_CREDENTIALS` variable to `true` if you want to use credentials for connections.
    - `ENABLE_RATE_LIMIT` variable to `true` to enable rate limiting.
    - `MAX_CONNECTIONS_PER_IP` variable to set the maximum connections per IP.
    - `CONNECTION_TIMEOUT_MS` variable to set the connection timeout in milliseconds.

## 📚 Resources

- [PeerJS Documentation](https://peerjs.com/docs/)
- [PeerJS Server GitHub](https://github.com/peers/peerjs-server)
- [Docker Hub Image](https://hub.docker.com/r/peerjs/peerjs-server)

## 📄 License

MIT

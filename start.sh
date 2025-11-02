#!/bin/bash

# PeerJS Server Quick Start Script

echo "🚀 PeerJS Server - Quick Start"
echo "================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created! You can edit it as needed."
fi

# Load .env variables
export $(grep -v '^#' .env | xargs)
# Replace placeholders in test.html with .env values
sed -e "s|\${PEERJS_HOST}|${PEERJS_HOST:-localhost}|g" \
    -e "s|\${PORT}|${PORT:-9000}|g" \
    -e "s|\${PEERJS_PATH}|${PEERJS_PATH:-/peerjs}|g" \
    -e "s|\${KEY}|${KEY:-peerjs}|g" \
    -e "s|\${ALIVE_TIMEOUT}|${ALIVE_TIMEOUT:-60000}|g" \
    -e "s|\${EXPIRE_TIMEOUT}|${EXPIRE_TIMEOUT:-5000}|g" \
    -e "s|\${CONCURRENT_LIMIT}|${CONCURRENT_LIMIT:-5000}|g" \
    -e "s|\${ALLOW_DISCOVERY}|${ALLOW_DISCOVERY:-true}|g" \
    -e "s|\${CORS_ORIGINS}|${CORS_ORIGINS:-*}|g" \
    -e "s|\${USE_CREDENTIALS}|${USE_CREDENTIALS:-false}|g" \
    -e "s|\${VERIFY_WS_ORIGIN}|${VERIFY_WS_ORIGIN:-true}|g" \
    -e "s|\${PROXIED}|${PROXIED:--false}|g" \
    -e "s|\${LOG_LEVEL}|${LOG_LEVEL:-INFO}|g" \
    test.html > test.generated.html

echo "✅ test.generated.html created with environment values."

echo ""
echo "📥 Downloading the latest PeerJS server image..."
docker-compose pull

echo ""
echo "🔨 Building the image..."
docker-compose build --no-cache

echo ""
echo "🔄 Starting the server..."
docker-compose up -d

sleep 3

if docker ps | grep -q peerjs-server; then
    echo ""
    echo "✅ Server started successfully!"
    echo ""
    echo "📊 Information:"
    echo "   - URL: http://${PEERJS_HOST:-localhost}:${PORT:-9000}${PEERJS_PATH:-/peerjs}"
    echo "   - Status: docker ps"
    echo "   - Logs: docker-compose logs -f"
    echo ""
    echo "🧪 Test the server:"
    echo "   curl http://${PEERJS_HOST:-localhost}:${PORT:-9000}${PEERJS_PATH:-/peerjs}"
    echo "   http://${PEERJS_HOST:-localhost}:${PORT:-9000}${PEERJS_PATH:-/peerjs}/${KEY:-peerjs}/id"
    echo "   http://${PEERJS_HOST:-localhost}:${PORT:-9000}${PEERJS_PATH:-/peerjs}/${KEY:-peerjs}/peers"
    echo ""
    echo "Generated test html (open in browser to test connections):"
    echo "   ${PWD}/test.generated.html"
    echo ""
    echo "🛑 Stop: docker-compose down"
    
    echo ""
    echo "🔍 Checking the server..."
    sleep 2
    if curl -s http://${PEERJS_HOST:-localhost}:${PORT:-9000}${PEERJS_PATH:-/peerjs} > /dev/null; then
        echo "✅ Server is responding! Everything works!"
    else
        echo "⚠️  Server is still starting, please wait a few seconds..."
    fi
    
else
    echo ""
    echo "❌ Error! The server could not be started."
    echo "Check logs: docker-compose logs"
    exit 1
fi
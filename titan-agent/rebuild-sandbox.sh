#!/bin/bash

echo "🔨 Rebuilding Titan Agent Sandbox..."
echo ""

cd docker

echo "1. Building Docker image..."
docker build -t titan-agent-sandbox:latest -f Dockerfile.sandbox .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Sandbox image rebuilt successfully!"
    echo ""
    echo "🗑️  Cleaning up old containers..."
    docker ps -a | grep titan-agent-sandbox | awk '{print $1}' | xargs docker rm -f 2>/dev/null || true
    echo ""
    echo "✅ Ready! The next task will use the new sandbox image."
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi

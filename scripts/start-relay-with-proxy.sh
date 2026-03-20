#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[relay-stack] stopping existing proxy/relay on ports 8547/8787"
lsof -t -i:8547 | xargs -r kill -9 || true
lsof -t -i:8787 | xargs -r kill -9 || true

echo "[relay-stack] starting rpc-proxy"
npm run rpc-proxy >/tmp/phantom-rpc-proxy.log 2>&1 &
PROXY_PID=$!

cleanup() {
  kill -9 "$PROXY_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

sleep 3

echo "[relay-stack] starting relay"
npm run relay

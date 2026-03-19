#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

function chainid() {
  local url="$1"
  curl -sS -m 2 -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$url" \
    | sed -n 's/.*"result":"\([^"]*\)".*/\1/p'
}

if [[ ! -f .env ]]; then
  echo "Missing .env in $ROOT_DIR"
  exit 1
fi

set -a
source ./.env
set +a

ALTO_PORT="${ALTO_PORT:-4337}"
PROXY_PORT="${RPC_PROXY_PORT:-8547}"
ALTO_URL="http://127.0.0.1:${ALTO_PORT}"
PROXY_URL="http://127.0.0.1:${PROXY_PORT}"

if [[ -n "$(chainid "$ALTO_URL" || true)" ]]; then
  echo "Bundler already running at $ALTO_URL"
  echo "health: eth_chainId=$(chainid "$ALTO_URL")"
  exit 0
fi

PROXY_PID=""
if [[ -z "$(chainid "$PROXY_URL" || true)" ]]; then
  echo "Starting local RPC proxy on :$PROXY_PORT..."
  node ./scripts/rpc-proxy.mjs >/tmp/phantom-rpc-proxy.log 2>&1 &
  PROXY_PID=$!
else
  echo "RPC proxy already running at $PROXY_URL"
fi

cleanup() {
  if [[ -n "$PROXY_PID" ]] && kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting Alto bundler on :$ALTO_PORT..."
bash ./scripts/run-alto.sh >/tmp/phantom-alto.log 2>&1 &
ALTO_PID=$!

for _ in {1..40}; do
  CID="$(chainid "$ALTO_URL" || true)"
  if [[ -n "$CID" ]]; then
    echo "Bundler ready: $ALTO_URL"
    echo "health: eth_chainId=$CID"
    wait "$ALTO_PID"
    exit $?
  fi
  sleep 0.5
done

echo "Bundler did not become ready in time."
echo "--- rpc proxy log ---"
tail -n 80 /tmp/phantom-rpc-proxy.log || true
echo "--- alto log ---"
tail -n 120 /tmp/phantom-alto.log || true
kill "$ALTO_PID" >/dev/null 2>&1 || true
exit 1

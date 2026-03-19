#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env in $ROOT_DIR"
  exit 1
fi

set -a
source ./.env
set +a

RPC_URL="${ALTO_RPC_URL:-${INEVM_RPC_URL:-https://testnet.rpc.inevm.com/http}}"
ENTRYPOINT_ADDR="${ENTRYPOINT:-0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789}"
PORT="${ALTO_PORT:-4337}"
NETWORK_NAME="${ALTO_NETWORK_NAME:-injective-testnet}"
RAW_KEY="${RELAY_SIGNER_EVM_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"

if [[ -z "$RAW_KEY" ]]; then
  echo "Missing RELAY_SIGNER_EVM_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env"
  exit 1
fi

if [[ "$RAW_KEY" == 0x* ]]; then
  EXECUTOR_KEY="$RAW_KEY"
else
  EXECUTOR_KEY="0x$RAW_KEY"
fi

echo "Starting Alto on port $PORT for network $NETWORK_NAME via RPC $RPC_URL..."
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
exec alto \
  --rpcUrl "$RPC_URL" \
  --executorPrivateKeys "$EXECUTOR_KEY" \
  --utility-private-key "$EXECUTOR_KEY" \
  --entrypoints "$ENTRYPOINT_ADDR" \
  --port "$PORT" \
  --deploy-simulations-contract false \
  --networkName "$NETWORK_NAME"

# Phantom DEX - Injective EVM Testnet

A decentralized exchange (DEX) built on Injective with ERC-4337 account abstraction, session key permissions, and gasless transactions through a paymaster.

**Live on Injective EVM Testnet (Chain 1439)**

---

## 🚀 Quick Start (After Cloning)

**Do this immediately after cloning the repo:**

### Step 1: Install Dependencies (5 minutes)
```bash
cd phantom-dex

# Install root dependencies
npm install

# Install relay dependencies
cd relay && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install Alto bundler globally (Optional)
npm install -g @account-abstraction/bundler
```

### Step 2: Create & Configure Environment Files (2 minutes)

**Create `.env` in root:**
```bash
touch .env
chmod 600 .env
```

Copy this into `.env` (for testnet with pre-deployed contracts):
```env
INJECTIVE_RPC_URL=https://k8s.testnet.json-rpc.injective.network/
INJECTIVE_WS_URL=wss://k8s.testnet.ws.injective.network/
RPC_PROXY_URL=http://127.0.0.1:8547
PRIVATE_KEY=
VAULT_CONTRACT=0xeC40c0792ade222b85dc231fD820346Bcd379617
SESSION_KEY_CONTRACT=0xB81B7E518F5370c80128407008245722D40AD2A5
PAYMASTER_CONTRACT=0x182c418e94215820D3B1F63B00e8420c39795D68
SMART_ACCOUNT_FACTORY=0xc4e6596a6f2eE02127298a8D90d854b7D270877a
MOCK_USDT=0x0E6dCDa85951220C35838c2Fb162f0251513678C
ENTRY_POINT=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
BUNDLER_URL=http://127.0.0.1:4337
RELAY_PORT=8787
RELAY_PRIVATE_KEY=
VAULT_ADDRESS=0xeC40c0792ade222b85dc231fD820346Bcd379617
LOG_LEVEL=info
```

**Create `frontend/.env`:**
```bash
touch frontend/.env
chmod 600 frontend/.env
```

Copy this into `frontend/.env`:

```

> **See [Environment Setup](#environment-setup-env-configuration) for detailed explanation of each variable.**

### Step 3: Start the Services (3 terminals)

**Terminal 1 - Alto Bundler:**
```bash
cd phantom-dex
export NODE_OPTIONS=--dns-result-order=ipv4first
npm run bundler:one
```

**Terminal 2 - Relay Service:**
```bash
cd phantom-dex
export NODE_OPTIONS=--dns-result-order=ipv4first
npm run relay
```

**Terminal 3 - Frontend Dev Server:**
```bash
cd phantom-dex/frontend
npm run dev
```

Then open http://localhost:5173 in your browser. ✅

### Step 4: Setup MetaMask (1 minute)

1. Install MetaMask: https://metamask.io
2. Add Injective Testnet network:
   - Name: `Injective Testnet`
   - RPC: `https://k8s.testnet.json-rpc.injective.network/`
   - Chain ID: `1439`
   - Symbol: `INJ`
3. Switch to Injective Testnet in MetaMask
4. Click "Connect Wallet" in frontend

### Step 5: Get Test INJ (5 minutes)

1. Get your deployer address:
```bash
node -e "const {ethers} = require('ethers'); const w = new ethers.Wallet(process.env.PRIVATE_KEY || '0xf5bb7ae33effb31855a427fdad8ab7b379c50f2b27c2c2714b84e4b841c6fd29'); console.log(w.address);"
```

2. Go to **Injective Testnet Faucet**: https://testnet.faucet.injective.network
3. Paste your address and request test INJ
4. Wait 1-2 minutes for funds to arrive

### What's Ready to Go?

✅ **Smart contracts are already deployed** to Injective Testnet (see [Contract Addresses](#contract-addresses-live-testnet))
✅ **No redeploy needed** to test the system
✅ **Just fund your account** and start using the DEX

### What's Next?

- **Deposit funds**: Go to http://localhost:5173, click Setup, deposit USDT
- **Create session key**: Set trading limits and expiry
- **Fund paymaster**: Enable gasless trading (optional)
- **See Troubleshooting**: If something breaks, check [here](#troubleshooting)
- **Full Setup Guide**: See [Installation](#installation) and [Environment Setup](#environment-setup-env-configuration) for detailed info

---

## Table of Contents

1. [Quick Start (After Cloning)](#-quick-start-after-cloning)
2. [Project Overview](#project-overview)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
5. [Environment Setup (.env Configuration)](#environment-setup-env-configuration)
6. [Running the Services](#running-the-services)
7. [Smart Contract Deployment](#smart-contract-deployment)
8. [Frontend Setup](#frontend-setup)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)
11. [Contract Addresses (Live Testnet)](#contract-addresses-live-testnet)

---

## Project Overview

**Phantom DEX** is a fully decentralized trading platform that combines:

- **ERC-4337 Account Abstraction**: Users don't need EOAs; smart contracts manage accounts
- **Session Keys**: Time-limited, permissioned keys for automated trading
- **Gas Sponsorship**: Paymaster covers gas fees for whitelisted users
- **Native Asset Support**: Trade and deposit both ERC-20 tokens and native INJ
- **Relay Architecture**: Backend service matches trades and settles on-chain

### Key Components

1. **Smart Contracts** (Solidity)
   - `Vault.sol`: Core escrow; holds assets, emits trade intents
   - `SmartAccount.sol`: ERC-4337 account; validates owner/session key signatures
   - `SmartAccountFactory.sol`: Creates accounts for new users
   - `SessionKey.sol`: Manages session key policies (expiry, max trade size, allowed pairs)
   - `Paymaster.sol`: ERC-4337 paymaster for gas sponsorship
   - `MockUSDT.sol`: Test ERC-20 token (6 decimals)

2. **Backend (Relay)**
   - Listens to `TradeRequested` events from Vault
   - Matches trades with existing orders
   - Settles matched trades on-chain via `settleTradeRecord()`
   - Exposes REST API: `/orderbook`, `/trades`

3. **Frontend (React + Vite)**
   - Setup page: deposit funds, create session keys, fund paymaster
   - Trading page: place orders, view orderbook, execute trades
   - Account page: manage smart account, view balances

4. **Infrastructure**
   - Alto ERC-4337 Bundler (localhost:4337): Bundles and sends UserOps to EntryPoint
   - RPC Proxy (localhost:8547): Local curl-based JSON-RPC forwarder (workaround for Node.js DNS issues)
   - Relay Backend (localhost:8787): Trade matching and settlement
   - Frontend Dev Server (localhost:5173): Vite development server

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│                   localhost:5173                         │
│  Setup | Trading | Account Management                   │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         v               v               v
    ┌────────────┐  ┌────────────┐  ┌──────────────┐
    │   Relay    │  │  RPC Proxy │  │ Alto Bundler │
    │ 127.0.0.1  │  │ 127.0.0.1  │  │ 127.0.0.1    │
    │  :8787     │  │  :8547     │  │  :4337       │
    └────────────┘  └────────────┘  └──────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         v                               v
    ┌─────────────────────┐      ┌──────────────────┐
    │ Injective Testnet   │      │  EntryPoint      │
    │   Chain 1439        │      │  0x5FF137D4...   │
    │  RPC/WS:             │      │                  │
    │  k8s.testnet...     │      └──────────────────┘
    │                     │
    │  Vault              │
    │  SessionKey         │
    │  Paymaster          │
    │  SmartAccount(s)    │
    │  MockUSDT           │
    └─────────────────────┘
```

---

## Prerequisites

### System Requirements

- **Node.js**: v18 or higher
- **npm**: v9 or higher
- **Git**: v2.0 or higher

### Knowledge Requirements

- Basic understanding of Solidity smart contracts
- Familiarity with ERC-4337 and account abstraction
- Understanding of MetaMask browser extension usage
- Basic command-line/terminal skills

### Required Software

```bash
# Check versions
node --version    # Should be v18+
npm --version     # Should be v9+
```

### Accounts & Keys

You'll need:

1. **MetaMask Wallet**: Install from https://metamask.io
   - Add Injective Testnet (Chain 1439) network
   - Have some test INJ for gas fees

2. **Private Key** for contract deployment (included in .env, but rotate after demo)

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/phantom-dex.git
cd phantom-dex
```

### Step 2: Install Root Dependencies

```bash
npm install
```

This installs dependencies for:
- Hardhat (smart contract framework)
- TypeScript compilation
- Testing libraries

### Step 3: Install Relay Dependencies

```bash
cd relay
npm install
cd ..
```

### Step 4: Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### Step 5: Install Alto Bundler (Global)

```bash
# Alto is the ERC-4337 bundler used for account abstraction
npm install -g @account-abstraction/bundler
```

### Directory Structure After Installation

```
phantom-dex/
├── contracts/              # Solidity contracts
├── scripts/                # Deployment and utility scripts
├── test/                   # Hardhat tests
├── relay/                  # Backend relay service
├── frontend/               # React frontend
├── .env                    # Backend configuration (CREATE THIS)
├── frontend/.env           # Frontend configuration (CREATE THIS)
├── hardhat.config.ts       # Hardhat network config
├── tsconfig.json           # TypeScript config
└── README.md               # This file
```

---

## Environment Setup (.env Configuration)

### Understanding .env Files

Environment files (`.env`) store sensitive information like private keys and API endpoints. They are:
- **NOT** checked into version control (see `.gitignore`)
- **ONLY** used locally for development
- **MUST** have restricted permissions (chmod 600)

### Root Backend .env File (`/phantom-dex/.env`)

Create `.env` in the root `phantom-dex` directory:

```bash
# Create the file
touch .env

# Restrict permissions (important for security)
chmod 600 .env
```

**Contents:**

```env
# ============================================================
# INJECTIVE EVM TESTNET CONFIGURATION (Chain 1439)
# ============================================================

# Primary RPC endpoint for Injective EVM testnet
INEVM_RPC_URL=https://k8s.testnet.json-rpc.injective.network
INEVM_CHAIN_ID=1439

# WebSocket endpoint for real-time event listening
WS_RPC_URL=wss://k8s.testnet.ws.injective.network/

# Local RPC proxy (optional - used if Node.js DNS resolution fails)
RPC_PROXY_URL=http://127.0.0.1:8547

# ============================================================
# INJECTIVE COSMOS LAYER CONFIGURATION
# ============================================================

# Injective testnet network identifier
INJECTIVE_NETWORK=testnet

# Injective gRPC endpoint (for spot market orders)
INJECTIVE_GRPC_ENDPOINT=https://testnet.sentry.chain.grpc-web.injective.network

# ============================================================
# ERC-4337 BUNDLER CONFIGURATION
# ============================================================

# Pimlico bundler API key (for production; use 'local' for self-hosted Alto)
PIMLICO_API_KEY=local

# Self-hosted Alto ERC-4337 bundler URL
PIMLICO_BUNDLER_URL=http://localhost:4337

# ============================================================
# PRIVATE KEYS (⚠️ NEVER COMMIT - USE .gitignore ⚠️)
# ============================================================

# Relay private key for Injective wallet (broadcasts orders)
# Used by: relay/injective.ts for MsgCreateSpotMarketOrder signing
RELAY_PRIVATE_KEY=[REDACTED - Store securely]

# Deployer private key for EVM contract deployment
# Used by: hardhat.config.ts and scripts/deploy.ts
DEPLOYER_PRIVATE_KEY=[REDACTED - Store securely]

# Relay signer EVM private key (calls settleTradeAndPayout on Vault)
# Used by: relay/index.ts for settlement transactions
RELAY_SIGNER_EVM_PRIVATE_KEY=[REDACTED - Store securely]

# ============================================================
# DEPLOYED CONTRACT ADDRESSES (Injective EVM Testnet)
# ============================================================

# Smart Account Factory - creates new smart accounts for users
SMART_ACCOUNT_FACTORY=0xc4e6596a6f2eE02127298a8D90d854b7D270877a

# Session Key Contract - manages time-limited trading keys
SESSION_KEY_CONTRACT=0xB81B7E518F5370c80128407008245722D40AD2A5

# Vault Contract - holds user deposits and orchestrates trades
VAULT_CONTRACT=0xA8DCa70304cAc4B70bF02277c283Db09aBFdC586

# Paymaster Contract - sponsors gas for whitelisted transactions
PAYMASTER_CONTRACT=0x182c418e94215820D3B1F63B00e8420c39795D68

# EntryPoint Contract (ERC-4337 standard)
ENTRYPOINT=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

# ============================================================
# RELAY SERVICE CONFIGURATION
# ============================================================

# Port for relay HTTP API server
PORT=8787

# ============================================================
# EXAMPLE ENVIRONMENT VARIABLES
# ============================================================

# These are placeholder values - replace with your actual private keys:
# • Never share your RELAY_PRIVATE_KEY (Injective account)
# • Never share your DEPLOYER_PRIVATE_KEY (EVM account)
# • Never share your RELAY_SIGNER_EVM_PRIVATE_KEY (EVM settlement account)
# • Always use .gitignore to prevent accidental commits
```

### Relay Service .env File (`/phantom-dex/relay/.env`)

The relay shares the root `.env` file. No separate relay/.env needed.

### Frontend .env File (`/phantom-dex/frontend/.env`)

Create `.env` in the `frontend` directory:

```bash
# Create the file
touch frontend/.env
chmod 600 frontend/.env
```

**Contents:**

```env
# ============================================================
# FRONTEND VITE CONFIGURATION
# ============================================================

# Contract Addresses - MUST match deployed addresses in backend .env
VITE_ENTRYPOINT=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
VITE_VAULT_CONTRACT=0xA8DCa70304cAc4B70bF02277c283Db09aBFdC586
VITE_SESSION_KEY_CONTRACT=0xB81B7E518F5370c80128407008245722D40AD2A5
VITE_SMART_ACCOUNT_FACTORY=0xc4e6596a6f2eE02127298a8D90d854b7D270877a
VITE_PAYMASTER_CONTRACT=0x182c418e94215820D3B1F63B00e8420c39795D68

# ============================================================
# RPC & CHAIN CONFIGURATION
# ============================================================

# Injective Testnet RPC URL
VITE_RPC_URL=https://k8s.testnet.json-rpc.injective.network

# Chain ID for Injective EVM Testnet
VITE_CHAIN_ID=1439

# ============================================================
# RELAY API CONFIGURATION
# ============================================================

# Backend relay service URL (for trade submission and status polling)
VITE_RELAY_URL=http://localhost:8787

# ============================================================
# TOKEN CONFIGURATION
# ============================================================

# Test USDT token on Injective EVM testnet (optional)
# Leave empty if not using ERC-20 deposits
VITE_USDT_TOKEN=

# ============================================================
# NOTES FOR DEVELOPERS
# ============================================================

# 1. VITE_ prefix: All variables are injected at build time by Vite
#    Access in React: import.meta.env.VITE_RPC_URL
#
# 2. Keep addresses in sync: Update both .env and frontend/.env when redeploying
#
# 3. Local development: Create frontend/.env.local to override values
#    (never commit .env.local to git)
#
# 4. No private keys in frontend .env: These values are public (injected in bundle)
```

### Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `INEVM_RPC_URL` | EVM testnet RPC | `https://k8s.testnet.json-rpc.injective.network` |
| `WS_RPC_URL` | WebSocket for events | `wss://k8s.testnet.ws.injective.network` |
| `INJECTIVE_GRPC_ENDPOINT` | Cosmos order broadcasting | `https://testnet.sentry.chain.grpc-web.injective.network` |
| `RELAY_PRIVATE_KEY` | Injective keypair for orders | *[Private - do not share]* |
| `DEPLOYER_PRIVATE_KEY` | EVM account for contract deploy | *[Private - do not share]* |
| `RELAY_SIGNER_EVM_PRIVATE_KEY` | EVM account for settlements | *[Private - do not share]* |
| `VAULT_CONTRACT` | Escrow contract on EVM | `0xA8DCa7...86A` |
| `ENTRYPOINT` | ERC-4337 entry point | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| `PIMLICO_BUNDLER_URL` | UserOp bundler | `http://localhost:4337` |
| `PORT` | Relay API port | `8787` |

### Security Checklist

✅ **DO:**
- Use `.gitignore` to prevent committing `.env` files
- Rotate private keys after testnet demos
- Use different keys for deployer, relay, and signer
- Set file permissions: `chmod 600 .env`
- Store keys in a secrets manager for production

❌ **DON'T:**
- Commit `.env` files to version control
- Share private keys via email, Slack, or chat
- Use the same key for multiple purposes
- Reuse keys across different projects
- Store keys in plaintext in code comments

---

## Running the Services

The services must run in this order:

1. **RPC Proxy** (optional, only if Node DNS resolution fails)
2. **Alto Bundler** (ERC-4337 bundler)
3. **Relay Service** (trade matching)
4. **Frontend** (React dev server)

### In Separate Terminals

#### Terminal 1: RPC Proxy (Optional)

```bash
cd /home/linux/INJECTIVE_Hackethone_DEX/phantom-dex

# Start the local RPC proxy (curl-based JSON-RPC forwarder)
npm run rpc-proxy
```

Expected output:
```
RPC proxy listening on 127.0.0.1:8547
Forwarding to: https://k8s.testnet.json-rpc.injective.network/
```

> **When to use**: If you see `ETIMEDOUT` or `ENETUNREACH` errors when deploying/running, start this. Otherwise, connect directly to the primary RPC.

#### Terminal 2: Alto Bundler

```bash
cd /home/linux/INJECTIVE_Hackethone_DEX/phantom-dex

# Start Alto bundler with IPv4-first DNS
export NODE_OPTIONS=--dns-result-order=ipv4first
npm run bundler:one
```

Expected output:
```
Alto bundler listening on 127.0.0.1:4337
EntryPoint: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
Network: Injective (1439)
```

> This bundles and submits UserOperations to the EntryPoint for account abstraction.

#### Terminal 3: Relay Service

```bash
cd /home/linux/INJECTIVE_Hackethone_DEX/phantom-dex

# Start the relay service with IPv4-first DNS
export NODE_OPTIONS=--dns-result-order=ipv4first
npm run relay
```

Expected output:
```
Relay service listening on http://127.0.0.1:8787
Connected to Vault at: 0xeC40c0792ade222b85dc231fD820346Bcd379617
Listening to TradeRequested events...
API endpoints:
  - GET  /orderbook
  - GET  /trades
  - POST /settle (internal)
```

> The relay watches for `TradeRequested` events and executes `settleTradeRecord()` when trades are matched.

#### Terminal 4: Frontend Dev Server

```bash
cd /home/linux/INJECTIVE_Hackethone_DEX/phantom-dex/frontend

# Start the React dev server
npm run dev
```

Expected output:
```
  VITE v4.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

### Using npm Scripts

Shortcut commands are available in `package.json`:

```bash
# Terminal 1: RPC Proxy
npm run rpc-proxy

# Terminal 2: Alto Bundler
npm run bundler:one

# Terminal 3: Relay
npm run relay

# Terminal 4: Frontend (from frontend directory)
cd frontend && npm run dev
```

### All-in-One Startup (Bash Script)

For convenience, use the provided startup script:

```bash
bash scripts/start-bundler-stack.sh
```

This starts both Alto and RPC proxy in the background. Still run relay and frontend in separate terminals.

---

## Smart Contract Deployment

### Prerequisites

- Have test INJ in your deployer account (for gas fees)
- All dependencies installed (`npm install`)
- Network configured in `hardhat.config.ts` (already done)

### Deployment Steps

#### Step 1: Check Deployer Account

```bash
node -e "
const {ethers} = require('ethers');
const w = new ethers.Wallet(process.env.PRIVATE_KEY || '0xf5bb7ae33effb31855a427fdad8ab7b379c50f2b27c2c2714b84e4b841c6fd29');
console.log('Deployer address:', w.address);
console.log('Save this address and fund it with test INJ.');
"
```

Example output:
```
Deployer address: 0xC3845b84Ec513c8A318383e7885743F248A07481
Save this address and fund it with test INJ.
```

#### Step 2: Fund Deployer Account

1. Go to Injective Testnet Faucet: https://testnet.faucet.injective.network (or similar)
2. Enter your deployer address
3. Receive test INJ (~50+ INJ recommended)

#### Step 3: Deploy All Contracts

```bash
# From phantom-dex root
npx hardhat run scripts/deploy.ts --network injective_testnet
```

Example output:
```
Deploying MockUSDT...
MockUSDT deployed to: 0x0E6dCDa85951220C35838c2Fb162f0251513678C

Deploying SessionKey...
SessionKey deployed to: 0xB81B7E518F5370c80128407008245722D40AD2A5

Deploying Paymaster...
Paymaster deployed to: 0x182c418e94215820D3B1F63B00e8420c39795D68

Deploying SmartAccountFactory...
SmartAccountFactory deployed to: 0xc4e6596a6f2eE02127298a8D90d854b7D270877a

Deploying Vault...
Vault deployed to: 0xeC40c0792ade222b85dc231fD820346Bcd379617

✅ All contracts deployed successfully!
```

**Update .env files with the new addresses:**

```bash
# Edit .env
export VAULT_CONTRACT=0xeC40c0792ade222b85dc231fD820346Bcd379617
export SESSION_KEY_CONTRACT=0xB81B7E518F5370c80128407008245722D40AD2A5
export PAYMASTER_CONTRACT=0x182c418e94215820D3B1F63B00e8420c39795D68
export SMART_ACCOUNT_FACTORY=0xc4e6596a6f2eE02127298a8D90d854b7D270877a
export MOCK_USDT=0x0E6dCDa85951220C35838c2Fb162f0251513678C

# Also update frontend/.env with the same addresses
```

#### Step 4: Deploy Only One Contract (If Needed)

If you modify a single contract and want to redeploy only it:

**MockUSDT**:
```bash
npx hardhat run scripts/deploy-mockusdt.ts --network injective_testnet
```

**Vault**:
```bash
npx hardhat run scripts/deploy-vault.ts --network injective_testnet
```

### Verifying Deployment

Check bytecode on-chain:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getCode",
    "params":["0xeC40c0792ade222b85dc231fD820346Bcd379617","latest"],
    "id":1
  }' \
  https://k8s.testnet.json-rpc.injective.network/
```

If bytecode is returned (not `0x`), the contract is deployed successfully.

---

## Frontend Setup

### React + Vite Architecture

The frontend is built with:
- **React**: UI framework
- **Vite**: Fast build tool
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **ethers.js**: Blockchain interactions

### Key Files

```
frontend/src/
├── App.tsx                 # Main app component, routing
├── pages/
│   ├── Setup.tsx          # Account creation, deposit, paymaster funding
│   ├── Trading.tsx        # Order placement and execution
│   └── Account.tsx        # User account info
├── components/
│   ├── Navbar.tsx         # Navigation
│   ├── Wallet.tsx         # MetaMask connection
│   └── TransactionStatus.tsx
├── hooks/
│   ├── useAccount.ts      # Smart account state
│   ├── useVault.ts        # Vault contract interactions
│   └── useRelay.ts        # Relay API calls
├── lib/
│   ├── contracts.ts       # ABI definitions & addresses
│   ├── constants.ts       # Global constants
│   └── utils.ts           # Utility functions
└── main.tsx               # React entry point
```

### Setup Steps

#### Step 1: Install MetaMask

1. Install MetaMask extension: https://metamask.io
2. Create or import a wallet
3. Add Injective Testnet network:
   - Network Name: `Injective Testnet`
   - RPC URL: `https://k8s.testnet.json-rpc.injective.network/`
   - Chain ID: `1439` or `0x59f` (hex)
   - Currency: `INJ`

#### Step 2: Start Frontend Dev Server

```bash
cd phantom-dex/frontend
npm run dev
```

Open http://localhost:5173 in your browser.

#### Step 3: Connect MetaMask

1. Click "Connect Wallet" in top-right
2. Approve connection in MetaMask popup
3. Verify you're on Injective Testnet (Chain 1439)

#### Step 4: Fund Your Account

1. Go to Setup page
2. You'll see "No smart account" (first time)
3. Click "Create Account" to deploy a SmartAccount
4. Fund it with test INJ or MockUSDT

#### Step 5: Test Deposit Flow

From Setup page:

1. **Deposit ERC-20**: Click "Deposit USDT"
   - Approve MockUSDT spending (MetaMask popup)
   - Enter amount and confirm
   - Your vault balance updates

2. **Deposit Native INJ**: Send INJ directly to your SmartAccount address
   - Vault receives via `receive()` function
   - Balance updates automatically

#### Step 6: Create Session Key

1. From Setup page, click "Create Session Key"
2. Configure:
   - **Duration**: How long the key is valid (seconds)
   - **Max Trade Size**: Max amount per trade
   - **Allowed Pairs**: Which token pairs can be traded
3. Confirm via MetaMask
4. Key is stored in SessionKey contract

#### Step 7: Fund Paymaster (Optional, for gasless trades)

From Setup page, click "Fund Paymaster":
1. **Add Stake**: Deposit INJ to stake in EntryPoint
2. **Deposit Gas**: Top up gas pool for transactions

Once funded, your trades will be gasless.

---

## Testing

### Hardhat Tests

Run the existing test suite:

```bash
# From phantom-dex root
npm test
```

Expected output:
```
  Vault.test.ts
    ✓ Should deploy and initialize (XX ms)
    ✓ Should deposit ERC-20 tokens (XXX ms)
    ✓ Should emit TradeRequested event (XXX ms)

  SessionKey.test.ts
    ✓ Should create and validate session keys (XXX ms)

  SmartAccount.test.ts
    ✓ Should validate UserOps with signatures (XXX ms)

  3 passing (1.2s)
```

### Manual Integration Testing

1. **Test Deposit Flow**
   - Use frontend to deposit MockUSDT
   - Check Vault balance via etherscan or `eth_call`

2. **Test Session Key**
   - Create session key from frontend
   - Verify expiry and constraints

3. **Test Trade Flow** (requires relay running)
   - Place order from frontend
   - Relay should pick it up and settle
   - Check orderbook endpoint: `GET http://127.0.0.1:8787/orderbook`

4. **Test Paymaster**
   - Fund paymaster from frontend
   - Submit a UserOp without paying gas
   - Paymaster should sponsor it

### Debugging Tips

**Enable Debug Logging**:

```bash
# Backend
DEBUG=* npm run relay

# Frontend (in browser console)
localStorage.setItem('debug', '*');
```

**Check Relay Logs**:

```bash
curl http://127.0.0.1:8787/trades
```

Expected:
```json
{
  "trades": [...],
  "orderbook": [...]
}
```

**RPC Test**:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  https://k8s.testnet.json-rpc.injective.network/
```

Expected: `result: "0x59f"` (Chain 1439 in hex)

---

## Troubleshooting

### Common Issues

#### 1. **ETIMEDOUT / ENETUNREACH Errors**

**Problem**: Node.js can't reach RPC endpoints
**Solution**:
```bash
# Force IPv4 DNS resolution
export NODE_OPTIONS=--dns-result-order=ipv4first

# Then run services
npm run relay
npm run bundler:one
```

#### 2. **Import Errors in Solidity** (`"@openzeppelin/..." not found`)

**Problem**: Solidity language server can't find external contracts
**Solution**: Already fixed in this repo (uses local helper contracts). If you re-encounter:
1. Restart VS Code
2. Check `.vscode/settings.json` has proper `solidity.compileUsingRemoteVersion`
3. Use local imports: `import "./lib/OwnableLite.sol"`

#### 3. **MetaMask Says "Wrong Network"**

**Problem**: Frontend is on wrong chain
**Solution**:
1. Open MetaMask
2. Switch to "Injective Testnet"
3. Verify Chain ID shows `1439`
4. Reload frontend page

#### 4. **Deployment Fails: "Insufficient Fee"**

**Problem**: Injective requires explicit EIP-1559 fees
**Solution**: Already handled in `scripts/deploy.ts`. If error persists:
1. Check deployer has enough INJ
2. Check `.env` has correct RPC URL
3. Run: `npx hardhat run scripts/deploy.ts --network injective_testnet`

#### 5. **Frontend Won't Connect to Relay**

**Problem**: `VITE_RELAY_API` points to wrong URL
**Solution**:
1. Ensure relay is running: `npm run relay`
2. Check it's on port 8787: `lsof -i :8787`
3. Verify `frontend/.env` has `VITE_RELAY_API=http://127.0.0.1:8787`
4. Reload frontend

#### 6. **"Cannot find module" errors**

**Problem**: Dependencies not installed
**Solution**:
```bash
# Root
npm install

# Relay
cd relay && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

#### 7. **Port Already in Use** (e.g., 5173, 8787, 4337)

**Problem**: Another process is using the port
**Solution**:
```bash
# Find process using port 8787
lsof -i :8787

# Kill it
kill -9 <PID>

# Or use fuser on Linux
fuser -k 8787/tcp
```

---

## Contract Addresses (Live Testnet)

All contracts are deployed to **Injective EVM Testnet (Chain 1439)**:

| Contract | Address | Purpose |
|----------|---------|---------|
| **Vault** | `0xeC40c0792ade222b85dc231fD820346Bcd379617` | Escrow; holds assets; emits trade intents |
| **SessionKey** | `0xB81B7E518F5370c80128407008245722D40AD2A5` | Session key policies (expiry, limits, pairs) |
| **Paymaster** | `0x182c418e94215820D3B1F63B00e8420c39795D68` | ERC-4337 paymaster for gas sponsorship |
| **SmartAccountFactory** | `0xc4e6596a6f2eE02127298a8D90d854b7D270877a` | Creates SmartAccount instances |
| **MockUSDT** | `0x0E6dCDa85951220C35838c2Fb162f0251513678C` | Test ERC-20 token (6 decimals) |
| **EntryPoint** | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | Standard ERC-4337 entry point |

---

## Additional Resources

- **Injective Docs**: https://docs.injective.network
- **ERC-4337 Spec**: https://eips.ethereum.org/EIPS/eip-4337
- **Alto Bundler**: https://github.com/pimlicolabs/alto
- **Hardhat Docs**: https://hardhat.org
- **ethers.js**: https://docs.ethers.org

---

## Security Notes

⚠️ **IMPORTANT for Production**:

1. **Never commit `.env` files to Git** (already in `.gitignore`)
2. **Rotate private keys after testnet demos**
3. **Don't share PRIVATE_KEY or RELAY_PRIVATE_KEY**
4. **Use hardware wallet for mainnet deployments**
5. **Run security audit before mainnet launch**

---

## Support & Contributing

For issues, feature requests, or questions:
1. Check this README
2. Review Troubleshooting section
3. Open a GitHub issue with:
   - Error message (full stack trace)
   - Terminal output (redact sensitive values)
   - Reproduction steps
   - Environment (OS, Node version, etc.)

---

**Last Updated**: March 19, 2026
**Network**: Injective EVM Testnet (Chain 1439)
**Status**: ✅ Fully Deployed & Tested

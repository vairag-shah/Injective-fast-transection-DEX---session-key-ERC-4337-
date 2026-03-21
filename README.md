#  InstaInjective - Instant Tred on Injective EVM Testnet

A decentralized exchange (DEX) built on Injective's automatically scalable EVM infrastructure with **ERC-4337 Account Abstraction**, **Session Key Permissions**, and **Gasless Transactions**.

---

##  Quick Start (Windows / PowerShell)

If you are a developer looking to set up and run the DEX locally on a Windows machine, follow these precise PowerShell commands.

### Step 1: Clone & Install Dependencies

Open your **PowerShell** as Administrator, then navigate to your desired folder and run:

```powershell
# 1. Clone the repo
git clone https://github.com/your-org/phantom-dex.git
cd phantom-dex

# 2. Install Root Dependencies
npm install

# 3. Install Relay Dependencies
cd relay
npm install
cd ..

# 4. Install Frontend (Next.js) Dependencies
cd frontend
npm install
cd ..
```

### Step 2: Configure Environment Variables

**1. Root Environment File (`.env`)**

In the **root directory** (`phantom-dex`), create a `.env` file and configure your keys:

```env
# /phantom-dex/.env
INJECTIVE_RPC_URL=https://k8s.testnet.json-rpc.injective.network/
INJECTIVE_WS_URL=wss://k8s.testnet.ws.injective.network/
RPC_PROXY_URL=http://127.0.0.1:8547

# [ACTION REQUIRED]: Add your Deployer Private Key here (Without 0x)
PRIVATE_KEY=

# Live Deployed Testnet Contracts
VAULT_CONTRACT=0xeC40c0792ade222b85dc231fD820346Bcd379617
SESSION_KEY_CONTRACT=0xB81B7E518F5370c80128407008245722D40AD2A5
PAYMASTER_CONTRACT=0x182c418e94215820D3B1F63B00e8420c39795D68
SMART_ACCOUNT_FACTORY=0xc4e6596a6f2eE02127298a8D90d854b7D270877a
MOCK_USDT=0x0E6dCDa85951220C35838c2Fb162f0251513678C
ENTRY_POINT=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

# Relay Configuration
BUNDLER_URL=http://127.0.0.1:4337
RELAY_PORT=8787

# [ACTION REQUIRED]: Add your Relay Private Key here (Without 0x)
RELAY_PRIVATE_KEY=
VAULT_ADDRESS=0xeC40c0792ade222b85dc231fD820346Bcd379617
LOG_LEVEL=info
```

**2. Frontend Environment File (`frontend/.env`)**

In the **frontend directory** (`phantom-dex/frontend`), create another `.env` file:

```env
# /phantom-dex/frontend/.env
NEXT_PUBLIC_ENTRYPOINT=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
NEXT_PUBLIC_VAULT_CONTRACT=0xeC40c0792ade222b85dc231fD820346Bcd379617
NEXT_PUBLIC_SESSION_KEY_CONTRACT=0xB81B7E518F5370c80128407008245722D40AD2A5
NEXT_PUBLIC_SMART_ACCOUNT_FACTORY=0xc4e6596a6f2eE02127298a8D90d854b7D270877a
NEXT_PUBLIC_PAYMASTER_CONTRACT=0x182c418e94215820D3B1F63B00e8420c39795D68

NEXT_PUBLIC_RPC_URL=https://k8s.testnet.json-rpc.injective.network
NEXT_PUBLIC_CHAIN_ID=1439
NEXT_PUBLIC_RELAY_URL=http://localhost:8787
```

---

### Step 3: Run the Services (Windows PowerShell)

You will need **TWO** separate PowerShell windows to run the frontend and the relay server simultaneously.

**Terminal 1: Start the Relay Node & Server**
*This command starts the local proxy routing and the relay backend server, explicitly configured for Windows.*
```powershell
cd phantom-dex

# Cleans up node processes if necessary and starts the relay
npm run relay:with-proxy:win
```

**Terminal 2: Start the Next.js Frontend**
*This command clears cache to prevent Next.js build overlap and runs the dev environment.*
```powershell
cd phantom-dex
cd frontend

# Remove the hidden Next.js cache directory to avoid conflicts, then start the server
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue 
npm run dev
```

The frontend should now be running locally at: `http://localhost:3000`

---

## 🎮 Developer Workflow & Usage

### 1. MetaMask Configuration
Make sure your MetaMask extension is installed and configured for **Injective EVM Testnet**:
- **Network Name**: Injective Testnet
- **RPC URL**: `https://k8s.testnet.json-rpc.injective.network/`
- **Chain ID**: `1439`
- **Currency Symbol**: `INJ`
- **Explorer Domain**: `https://testnet.explorer.injective.network/`

### 2. Fund Your Account
You will need testnet `INJ` tokens to deploy contracts or interact with the application.
1. Copy your MetaMask wallet address.
2. Go to the [Injective Testnet Faucet](https://testnet.faucet.injective.network/).
3. Paste your address and request INJ.

### 3. Usage Path
1. **Setup**: Connect your wallet on the frontend. Create an ERC-4337 Smart Account.
2. **Session Key Creation**: Generate a session key locally to auto-sign orders with spending limits.
3. **Trade Execution**: Perform "1-click" trades inside the Phantom Terminal interface instantly. 

---

## 🛠 Project Architecture

1. **Frontend (Next.js / TailwindCSS / Framer Motion)**
   - Found in `/frontend`. Handles wallet connections, local key management, responsive real-time UI, and order routing.

2. **Backend Relay Service (Node.js)**
   - Found in `/relay`. Actively polls Injective RPC for `TradeRequested` events, matches them to open order books, and sponsors EVM transaction fees.

3. **Smart Contracts (Solidity)**
   - Custom `Vault.sol`, `SessionKey.sol`, and `Paymaster.sol` implementing ERC-4337 compatibility. Already deployed to the testnet environment.

## ⚠️ Troubleshooting (Windows Specific)

- **`ETIMEDOUT` / RPC connection failures:** Make sure Terminal 1 is running `npm run relay:with-proxy:win`. Windows Node.js often has IPv6 resolving issues, and the built-in proxy bypasses this limitation.
- **`the name X is defined multiple times` in React:** Ensure you always run the `Remove-Item` powershell command before `npm run dev` to fully flush `.next/` cache.
- **Port already in use:** To kill runaway Node ports on Windows, run this in PowerShell: `Stop-Process -Name "node" -Force`.

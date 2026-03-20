import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { getUserOperationReceipt, sendUserOperation } from "./bundler.js";
import { fetchOrderbookByPair, fetchRecentTradesByPair, routeInjectiveSpotOrder } from "./injective.js";
import { getVaultWriteContract, startVaultListener } from "./listener.js";

dotenv.config({ path: "../.env" });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8787);
const INEVM_RPC_URL =
    process.env.RPC_PROXY_URL ||
    process.env.RELAY_RPC_URL ||
    process.env.INEVM_RPC_URL ||
    "https://k8s.testnet.json-rpc.injective.network/";
const WS_RPC_URL = process.env.WS_RPC_URL || "";
const VAULT = process.env.VAULT_CONTRACT || "";
const RELAY_SIGNER_EVM_PRIVATE_KEY = process.env.RELAY_SIGNER_EVM_PRIVATE_KEY || "";
const LISTENER_RETRY_MS = Number(process.env.LISTENER_RETRY_MS || 10000);
let listenerAttached = false;
let listenerBooting = false;

app.post("/api/submit-userop", async (req: any, res: any) => {
    try {
        const userOp = req.body;
        const userOpHash = await sendUserOperation(userOp);
        res.json({ userOpHash });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "submit failed" });
    }
});

app.get("/api/order-status/:userOpHash", async (req: any, res: any) => {
    try {
        const receipt = await getUserOperationReceipt(req.params.userOpHash);
        if (!receipt) {
            return res.json({ status: "pending", txHash: null });
        }
        return res.json({ status: "confirmed", txHash: receipt.receipt?.transactionHash || null });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || "status failed" });
    }
});

app.get("/api/orderbook/:pair", async (req: any, res: any) => {
    try {
        const pair = decodeURIComponent(req.params.pair);
        const data = await fetchOrderbookByPair(pair);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "orderbook failed" });
    }
});

app.get("/api/trades/:pair", async (req: any, res: any) => {
    try {
        const pair = decodeURIComponent(req.params.pair);
        const trades = await fetchRecentTradesByPair(pair);
        res.json({ trades });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "trades failed" });
    }
});

// ✅ FIXED: WS_RPC_URL no longer required — listener uses HTTP polling now
async function bootListener() {
    if (!VAULT || !RELAY_SIGNER_EVM_PRIVATE_KEY || !INEVM_RPC_URL) {
        console.warn("Listener disabled: missing VAULT_CONTRACT / RELAY_SIGNER_EVM_PRIVATE_KEY / INEVM_RPC_URL");
        return;
    }

    const signer = new ethers.Wallet(RELAY_SIGNER_EVM_PRIVATE_KEY);
    const vaultWriter = getVaultWriteContract(INEVM_RPC_URL, VAULT, signer);

    // ✅ pass INEVM_RPC_URL as first arg — listener ignores WS and uses HTTP
    await startVaultListener(INEVM_RPC_URL, VAULT, async ({ user, pair, qty, side }) => {
        const knownPairs = ["INJ/USDT", "ETH/USDT", "BTC/USDT"];
        const pairText =
            knownPairs.find((p) => ethers.keccak256(ethers.toUtf8Bytes(p)) === pair) || "INJ/USDT";

        let settlementTag = "pending";
        try {
            const routed = await routeInjectiveSpotOrder({
                pair: pairText,
                qty: qty.toString(),
                side
            });
            settlementTag = routed.txHash || "injective-pending";
        } catch (error: any) {
            const reason = (error?.message || "route-failed").slice(0, 80);
            settlementTag = `route-failed:${reason}`;
            console.warn(`Injective route failed, continuing with payout fallback: ${reason}`);
        }

        const settleTx = await vaultWriter.settleTradeAndPayout(user, pair, qty, side, settlementTag);
        console.log(`Settlement tx sent: ${settleTx.hash}`);
    });

    listenerAttached = true;
    console.log("Listener attached successfully");
}

async function ensureListenerAttached() {
    if (listenerAttached || listenerBooting) {
        return;
    }

    listenerBooting = true;
    try {
        await bootListener();
    } catch (error: any) {
        console.warn(`Listener startup failed (non-fatal): ${error?.message || error}`);
        console.warn(`Retrying listener in ${LISTENER_RETRY_MS / 1000}s...`);
    } finally {
        listenerBooting = false;
    }
}

app.listen(PORT, async () => {
    console.log(`relay listening on :${PORT}`);

    await ensureListenerAttached();
    setInterval(() => {
        void ensureListenerAttached();
    }, LISTENER_RETRY_MS);
});

// ✅ Catch ALL unhandled promise rejections — prevent relay from crashing
process.on("unhandledRejection", (reason: any) => {
    console.warn(`Unhandled rejection caught (non-fatal): ${reason?.message || reason}`);
});

process.on("uncaughtException", (err: any) => {
    console.warn(`Uncaught exception (non-fatal): ${err?.message || err}`);
});
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const relayRpcUrl =
    process.env.RELAY_RPC_URL ||
    process.env.RPC_PROXY_URL ||
    process.env.INEVM_RPC_URL ||
    "http://127.0.0.1:8547";

// Direct relay mode — no bundler needed
// HTTP provider with staticNetwork to avoid IPv6 detection calls
const provider = new ethers.JsonRpcProvider(
    relayRpcUrl,
    {
        chainId: parseInt(process.env.INEVM_CHAIN_ID || "1439"),
        name: "injective-testnet"
    },
    { staticNetwork: true }
);

const relaySigner = new ethers.Wallet(
    process.env.RELAY_SIGNER_EVM_PRIVATE_KEY!,
    provider
);

const vaultAbi = [
    "function executeTrade(address user, bytes32 pair, uint256 qty, uint8 side) external",
];

export async function sendUserOperation(userOp: any): Promise<string> {
    console.log("UserOp received:", JSON.stringify(userOp, null, 2));
    console.log("Relay RPC:", relayRpcUrl);

    const vaultAddress = process.env.VAULT_CONTRACT;
    if (!vaultAddress) throw new Error("VAULT_CONTRACT not set in .env");

    // Extract fields — handle both shapes frontend might send
    const user = userOp.sender || userOp.user || relaySigner.address;
    const pair = userOp.pair || userOp.tradePair || "INJ/USDT";
    const qty = userOp.qty || userOp.amount || "1";
    const side = userOp.side ?? 0;

    console.log(`Trade: ${side === 0 ? "BUY" : "SELL"} ${qty} ${pair} for ${user}`);

    const pairBytes32 = ethers.keccak256(ethers.toUtf8Bytes(pair));
    const vault = new ethers.Contract(vaultAddress, vaultAbi, relaySigner);

    const feeData = await provider.getFeeData();
    const minFee = ethers.parseUnits("1", "gwei");
    const overrides = {
        maxFeePerGas:
            feeData.maxFeePerGas && feeData.maxFeePerGas > minFee
                ? feeData.maxFeePerGas
                : minFee,
        maxPriorityFeePerGas:
            feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > minFee
                ? feeData.maxPriorityFeePerGas
                : minFee,
        gasLimit: 300000,
    };

    const tx = await vault.executeTrade(
        user,
        pairBytes32,
        ethers.parseUnits(String(qty), 18),
        side,
        overrides
    );

    console.log("Tx sent:", tx.hash);
    
    // ✅ Return hash immediately, don't wait for confirmation
    // Frontend will poll for confirmation separately
    setImmediate(() => {
        tx.wait().then((receipt) => {
            console.log("Confirmed:", receipt?.hash);
        }).catch((err) => {
            console.error("Tx failed:", err);
        });
    });

    return tx.hash;
}

export async function getUserOperationReceipt(hash: string) {
    try {
        const receipt = await provider.getTransactionReceipt(hash);
        if (!receipt) return null;
        return {
            receipt: {
                transactionHash: receipt.hash,
                status: receipt.status
            }
        };
    } catch {
        return null;
    }
}
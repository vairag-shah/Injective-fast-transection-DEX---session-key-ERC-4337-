import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const rpcCandidates = Array.from(
    new Set(
        [
            process.env.RELAY_RPC_URL,
            process.env.INEVM_RPC_URL,
            process.env.RPC_PROXY_URL,
            "https://k8s.testnet.json-rpc.injective.network/"
        ].filter((x): x is string => Boolean(x && x.trim()))
    )
);

// Direct relay mode — no bundler needed
// HTTP provider with staticNetwork to avoid IPv6 detection calls
function createProvider(url: string) {
    return new ethers.JsonRpcProvider(
        url,
        {
            chainId: parseInt(process.env.INEVM_CHAIN_ID || "1439"),
            name: "injective-testnet"
        },
        { staticNetwork: true }
    );
}

const relaySigners = rpcCandidates.map((url) => {
    const provider = createProvider(url);
    return {
        url,
        provider,
        signer: new ethers.Wallet(process.env.RELAY_SIGNER_EVM_PRIVATE_KEY!, provider)
    };
});

const vaultAbi = [
    "function executeTrade(address user, bytes32 pair, uint256 qty, uint8 side) external",
];

export async function sendUserOperation(userOp: any): Promise<string> {
    console.log("UserOp received:", JSON.stringify(userOp, null, 2));

    const vaultAddress = process.env.VAULT_CONTRACT;
    if (!vaultAddress) throw new Error("VAULT_CONTRACT not set in .env");

    // Extract fields — handle both shapes frontend might send
    const user = userOp.user || userOp.sender || relaySigners[0]?.signer.address;
    const pair = userOp.pair || userOp.tradePair || "INJ/USDT";
    const qty = userOp.qty || userOp.amount || "1";
    const side = userOp.side ?? 0;

    console.log(`Trade: ${side === 0 ? "BUY" : "SELL"} ${qty} ${pair} for ${user}`);

    const pairBytes32 = ethers.keccak256(ethers.toUtf8Bytes(pair));
    let lastError: unknown = null;

    for (const endpoint of relaySigners) {
        console.log("Relay RPC:", endpoint.url);
        try {
            const vault = new ethers.Contract(vaultAddress, vaultAbi, endpoint.signer);
            const feeData = await endpoint.provider.getFeeData();
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

            setImmediate(() => {
                tx.wait().then((receipt: ethers.TransactionReceipt | null) => {
                    console.log("Confirmed:", receipt?.hash);
                }).catch((err: unknown) => {
                    console.error("Tx failed:", err);
                });
            });

            return tx.hash;
        } catch (err: unknown) {
            lastError = err;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`RPC endpoint failed (${endpoint.url}): ${msg}`);
        }
    }

    throw new Error(
        `submit failed across all RPC endpoints: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
}

export async function getUserOperationReceipt(hash: string) {
    for (const endpoint of relaySigners) {
        try {
            const receipt = await endpoint.provider.getTransactionReceipt(hash);
            if (!receipt) continue;
            return {
                receipt: {
                    transactionHash: receipt.hash,
                    status: receipt.status
                }
            };
        } catch {
            // try next endpoint
        }
    }

    return null;
}
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const vaultAbi = [
    "event TradeRequested(address user, bytes32 pair, uint256 qty, uint8 side, uint256 timestamp)",
    "function settleTradeRecord(address user, bytes32 pair, uint256 qty, uint8 side, string txHash)"
];

export type TradeRequestedPayload = {
    user: string;
    pair: string;
    qty: bigint;
    side: number;
};

// ✅ Create provider with static network — skips auto network detection
// which was triggering IPv6 connection attempts on startup
function createHttpProvider(rpcUrl: string): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(
        rpcUrl,
        {
            chainId: 1439,
            name: "injective-testnet"
        },
        {
            staticNetwork: true,        // ← skips eth_chainId call on boot
            polling: true,              // ← use polling not WebSocket
            pollingInterval: 4000,      // ← poll every 4 seconds
        }
    );
}

export function startVaultListener(
    _wsRpcUrl: string,
    vaultAddress: string,
    onTradeRequested: (payload: TradeRequestedPayload) => Promise<void>
) {
    const rpcUrl = process.env.INEVM_RPC_URL!;
    console.log(`Event listener using HTTP polling → ${rpcUrl}`);

    const provider = createHttpProvider(rpcUrl);

    const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);

    vault.on(
        "TradeRequested",
        async (
            user: string,
            pair: string,
            qty: bigint,
            side: bigint
        ) => {
            console.log(`TradeRequested → ${user} side:${Number(side) === 0 ? "BUY" : "SELL"}`);
            try {
                await onTradeRequested({
                    user,
                    pair,
                    qty,
                    side: Number(side)
                });
            } catch (err: any) {
                console.error(`Trade routing failed: ${err.message}`);
            }
        }
    );

    console.log(`Listening for events on vault: ${vaultAddress}`);

    return { provider, vault };
}

export function getVaultWriteContract(
    rpcUrl: string,
    vaultAddress: string,
    signer: ethers.Wallet
) {
    const provider = createHttpProvider(rpcUrl);
    const connectedSigner = signer.connect(provider);
    return new ethers.Contract(vaultAddress, vaultAbi, connectedSigner);
}

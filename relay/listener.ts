import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const vaultAbi = [
    "event TradeRequested(address user, bytes32 pair, uint256 qty, uint8 side, uint256 timestamp)",
    "function settleTradeAndPayout(address user, bytes32 pair, uint256 qty, uint8 side, string txHash)"
];

export type TradeRequestedPayload = {
    user: string;
    pair: string;
    qty: bigint;
    side: number;
};

function createHttpProvider(rpcUrl: string): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(
        rpcUrl,
        {
            chainId: 1439,
            name: "injective-testnet"
        },
        {
            staticNetwork: true,
            polling: true,
            pollingInterval: 4000,
        }
    );
}

async function selectHealthyProvider(): Promise<{ provider: ethers.JsonRpcProvider; rpcUrl: string }> {
    const rpcCandidates = Array.from(
        new Set(
            [
                process.env.RPC_PROXY_URL,
                process.env.RELAY_RPC_URL,
                process.env.INEVM_RPC_URL,
                "https://k8s.testnet.json-rpc.injective.network/"
            ].filter((x): x is string => Boolean(x && x.trim()))
        )
    );

    let lastError: unknown = null;
    for (const rpcUrl of rpcCandidates) {
        try {
            const provider = createHttpProvider(rpcUrl);
            await provider.getBlockNumber();
            return { provider, rpcUrl };
        } catch (err: unknown) {
            lastError = err;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`Listener RPC probe failed (${rpcUrl}): ${msg}`);
        }
    }

    const endpoints = rpcCandidates.join(", ");
    throw new Error(
        `No healthy listener RPC endpoint. Tried: [${endpoints}]. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}. Start local proxy with: npm run rpc-proxy`
    );
}

export async function startVaultListener(
    _wsRpcUrl: string,
    vaultAddress: string,
    onTradeRequested: (payload: TradeRequestedPayload) => Promise<void>
) {
    const { provider, rpcUrl } = await selectHealthyProvider();
    console.log(`Event listener using HTTP polling → ${rpcUrl}`);

    const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
    const seenEvents = new Set<string>();
    vault.on(
        "TradeRequested",
        async (
            user: string,
            pair: string,
            qty: bigint,
            side: bigint,
            event: any
        ) => {
            const eventId = event?.log?.transactionHash && typeof event?.logIndex === "number"
                ? `${event.log.transactionHash}:${event.logIndex}`
                : event?.transactionHash && typeof event?.index === "number"
                    ? `${event.transactionHash}:${event.index}`
                    : `${user}:${pair}:${qty.toString()}:${Number(side)}:${event?.blockNumber || "na"}`;
            if (seenEvents.has(eventId)) {
                return;
            }
            seenEvents.add(eventId);
            setTimeout(() => seenEvents.delete(eventId), 10 * 60 * 1000);

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

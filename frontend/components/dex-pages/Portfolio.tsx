"use client";

import { ethers } from "ethers";
import { SMART_ACCOUNT_FACTORY, VAULT_ADDRESS, factoryAbi, smartAccountAbi, vaultAbi } from "@/lib/contracts";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { pollOrderStatus } from "@/lib/injective";

type HistoryRow = {
    pair: string;
    side: "BUY" | "SELL";
    qty: number;
    price: number;
    ts: number;
    status: "confirmed" | "pending";
    txHash?: string | null;
    userOpHash?: string;
};

export default function Portfolio() {
    const router = useRouter();
    const { session, remainingText, clearSession } = useSessionKey();
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [sessionAddress, setSessionAddress] = useState("");
    const [vaultInjBalance, setVaultInjBalance] = useState("-");
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [walletAddress, setWalletAddress] = useState("");

    useEffect(() => {
        const rows = JSON.parse(sessionStorage.getItem("phantom_trade_history") || "[]");
        setHistory(rows);

        const eth = (window as any).ethereum;
        if (eth) {
            const p = new ethers.BrowserProvider(eth);
            p.getSigner().then((s: ethers.Signer) => s.getAddress()).then((addr: string) => {
                setWalletAddress(addr);
                refreshBalances(p, addr);
            }).catch(() => { });
        }
    }, []);

    const refreshBalances = useCallback(
        async (nextProvider?: ethers.BrowserProvider, nextAddress?: string) => {
            const eth = (window as any).ethereum;
            if (!eth) return;
            const p = nextProvider || new ethers.BrowserProvider(eth);
            const address = nextAddress || walletAddress;
            if (!address) return;

            setBalanceLoading(true);
            try {
                const vaultBal = await new ethers.Contract(VAULT_ADDRESS, vaultAbi, p).getBalance(address, ethers.ZeroAddress);
                setVaultInjBalance(Number(ethers.formatEther(vaultBal)).toFixed(4));
            } catch (err) {
                console.warn("Failed to refresh balances", err);
                setVaultInjBalance("-");
            } finally {
                setBalanceLoading(false);
            }
        },
        [walletAddress]
    );

    useEffect(() => {
        if (!walletAddress) return;
        const id = setInterval(() => {
            refreshBalances().catch(() => { });
        }, 8000);
        return () => clearInterval(id);
    }, [walletAddress, refreshBalances]);

    // Background polling for pending transactions
    useEffect(() => {
        const pendingTxHashes = history
            .filter(tx => (tx.status === "pending" || !tx.txHash) && tx.userOpHash)
            .map(tx => tx.userOpHash);

        if (pendingTxHashes.length === 0) return;

        const interval = setInterval(async () => {
            let changed = false;
            const newHistory = [...history];

            await Promise.all(newHistory.map(async (tx, idx) => {
                if ((tx.status === "pending" || !tx.txHash) && tx.userOpHash) {
                    try {
                        const res = await pollOrderStatus(tx.userOpHash);
                        if (res.status === "confirmed" && res.txHash) {
                            newHistory[idx] = { ...tx, status: "confirmed", txHash: res.txHash };
                            changed = true;
                        }
                    } catch (e) {
                        console.warn("Poll failed for", tx.userOpHash, e);
                    }
                }
            }));

            if (changed) {
                setHistory(newHistory);
                sessionStorage.setItem("phantom_trade_history", JSON.stringify(newHistory.slice(0, 100)));
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [history]);

    const pnl = useMemo(() => history.reduce((a, x) => a + (x.side === "BUY" ? -x.qty * x.price * 0.01 : x.qty * x.price * 0.01), 0), [history]);

    async function revoke() {
        const eth = (window as any).ethereum;
        if (!eth || !session) return;

        try {
            const provider = new ethers.BrowserProvider(eth);
            const signer = await provider.getSigner();
            const owner = await signer.getAddress();

            const factory = new ethers.Contract(SMART_ACCOUNT_FACTORY, factoryAbi, signer);
            const account = await factory.accountOf(owner);
            if (account === ethers.ZeroAddress) {
                alert("No smart account found");
                return;
            }

            const smart = new ethers.Contract(account, [
                "function revokeSessionKey(address key) external"
            ], signer);

            const tx = await smart.revokeSessionKey(session.address);
            await tx.wait();
            clearSession();
            alert("Session revoked successfully");
        } catch (err: any) {
            console.error("Revoke failed:", err);
            alert(`Revoke failed: ${err.message}`);
        }
    }

    return (
        <div className="mx-auto max-w-6xl space-y-8 pb-20">
            {/* Main Header */}
            <div>
                <h1 className="text-4xl font-bold tracking-tight text-foreground">
                    Your <span className="text-accent">Portfolio</span>
                </h1>
                <p className="mt-2 text-muted-foreground">Manage your session, track performance, and view trade history.</p>
            </div>

            {/* Top Summaries */}
            <div className="grid gap-6 md:grid-cols-3">
                <div className="glass-card p-6 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Vault Balance (INJ)</span>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`text-4xl font-bold font-mono tracking-tighter ${balanceLoading ? "text-accent animate-pulse" : "text-foreground"}`}>
                            {vaultInjBalance}
                        </span>
                        <span className="text-xs font-bold text-accent uppercase font-mono">INJ</span>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-accent bg-accent/10 self-start px-2 py-0.5 rounded-full font-bold">
                        <span>LIVE</span>
                    </div>
                </div>

                <div className="glass-card p-6 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Estimated P&L</span>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className={`text-4xl font-bold font-mono tracking-tighter ${pnl >= 0 ? "text-accent" : "text-danger"}`}>
                            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </span>
                    </div>
                    <div className="mt-4 text-[10px] font-bold text-muted-foreground uppercase">From local session history</div>
                </div>

                <div className="glass-card p-6 flex flex-col justify-between border-dashed">
                    <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Session</span>
                        <div className="h-2 w-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--accent-blue)]" />
                    </div>
                    <div className="mt-2 space-y-1">
                        <div className="font-mono text-xs text-foreground truncate">{sessionAddress || session?.address || "ACTIVE"}</div>
                        <div className="text-xs font-bold text-accent uppercase">{remainingText} LEFT</div>
                    </div>
                    <button
                        onClick={revoke}
                        className="mt-6 w-full py-2 bg-danger/10 text-danger border border-danger/20 rounded-xl text-[10px] font-bold hover:bg-danger/20 transition-all uppercase tracking-widest"
                    >
                        Force Revoke
                    </button>
                </div>
            </div>

            {/* Trade History */}
            <div className="glass-card p-8">
                <div className="mb-8 flex items-center justify-between">
                    <h3 className="text-xl font-bold">Trade <span className="text-accent">Registry</span></h3>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{history.length} Transactions</div>
                </div>

                <div className="space-y-4">
                    {history.map((tx, idx) => (
                        <div
                            key={`${tx.ts}-${idx}`}
                            className="group relative flex items-center justify-between rounded-2xl bg-black/20 p-5 hover:bg-white/5 transition-all border border-white/5"
                        >
                            <div className="flex items-center gap-6">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tx.side === "BUY" ? "bg-accent/20 text-accent" : "bg-danger/20 text-danger"}`}>
                                    <span className="text-2xl font-bold">{tx.side === "BUY" ? "↓" : "↑"}</span>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold">{tx.pair}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tx.side === "BUY" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"}`}>
                                            {tx.side}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50">
                                        {new Date(tx.ts).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-12">
                                <div className="text-right space-y-1">
                                    <div className="font-mono font-bold">{tx.qty.toFixed(4)} INJ</div>
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50">
                                        Amount
                                    </div>
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="font-mono font-bold">${tx.price.toFixed(2)}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50">
                                        Execution Price
                                    </div>
                                </div>
                                <div className="text-right space-y-1">
                                    {tx.txHash ? (
                                        <>
                                            <a
                                                href={`https://testnet.blockscout.injective.network/tx/${tx.txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono text-accent text-[10px] font-bold hover:underline break-all"
                                                title={tx.txHash}
                                            >
                                                {tx.txHash.substring(0, 8)}...{tx.txHash.substring(tx.txHash.length - 6)}
                                            </a>
                                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50">
                                                Tx
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-accent text-[10px] font-bold">Pending</div>
                                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50">
                                                Tx
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="text-right space-y-1">
                                    {tx.txHash ? (
                                        <a
                                            href={`https://explorer.injective.network/transaction/${tx.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-accent font-bold text-[10px] uppercase tracking-widest bg-accent/10 px-3 py-1 rounded-lg hover:bg-accent/20 transition-colors inline-block"
                                        >
                                            FREE GAS
                                        </a>
                                    ) : (
                                        <div className="text-accent font-bold text-[10px] uppercase tracking-widest bg-accent/10 px-3 py-1 rounded-lg">
                                            FREE GAS
                                        </div>
                                    )}
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-0 group-hover:opacity-50 transition-opacity">
                                        SPONSORED BY INJ
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {history.length === 0 && (
                        <div className="py-24 flex flex-col items-center justify-center text-muted-foreground bg-black/10 rounded-3xl border border-dashed border-white/10">
                            <div className="text-5xl mb-6 opacity-20">🗂</div>
                            <p className="text-sm font-bold uppercase tracking-widest">No trading history found</p>
                            <button
                                onClick={() => router.push("/trade")}
                                className="mt-6 text-accent text-xs font-bold uppercase hover:underline"
                            >
                                Start Trading →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-center opacity-30 text-[10px] font-bold uppercase tracking-[0.2em]">
                Securely managed by Injective Smart Vaults
            </div>
        </div>
    );
}

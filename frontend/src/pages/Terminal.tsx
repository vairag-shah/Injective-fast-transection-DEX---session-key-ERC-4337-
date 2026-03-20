import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useSessionKey } from "../hooks/useSessionKey";
import { usePriceFeed } from "../hooks/usePriceFeed";
import { useUserOp } from "../hooks/useUserOp";
import { pollOrderStatus } from "../lib/injective";
import { VAULT_ADDRESS, vaultAbi } from "../lib/contracts";

type TradeFeedItem = {
    side: "BUY" | "SELL";
    qty: number;
    price: number;
    ts: number;
    status: "confirmed" | "pending";
    txHash?: string | null;
};

const PAIRS = ["INJ/USDT", "ETH/USDT", "BTC/USDT"];
const TX_EXPLORER_BASE =
    import.meta.env.VITE_TX_EXPLORER_BASE || "https://testnet.blockscout.injective.network/tx";

export default function Terminal() {
    const { session, remainingText } = useSessionKey();
    const [pair, setPair] = useState("INJ/USDT");
    const [buyQty, setBuyQty] = useState("10");
    const [sellQty, setSellQty] = useState("5");
    const [feed, setFeed] = useState<TradeFeedItem[]>([]);
    const [tradesToday, setTradesToday] = useState(0);
    const [activeSide, setActiveSide] = useState<"BUY" | "SELL" | null>(null);
    const [vaultBalance, setVaultBalance] = useState(0);

    const { prices, midPrice, change24h } = usePriceFeed(pair);
    const { pending, submitTrade } = useUserOp();

    const sparkline = useMemo(() => {
        if (!prices.length) return "";
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        return prices
            .map((p, i) => {
                const x = (i / Math.max(prices.length - 1, 1)) * 100;
                const y = 30 - ((p - min) / Math.max(max - min, 1)) * 30;
                return `${x},${y}`;
            })
            .join(" ");
    }, [prices]);

    async function refreshVaultBalance() {
        const eth = (window as any).ethereum;
        if (!eth || !VAULT_ADDRESS) return;

        try {
            const provider = new ethers.BrowserProvider(eth);
            const signer = await provider.getSigner();
            const owner = await signer.getAddress();
            const vault = new ethers.Contract(VAULT_ADDRESS, vaultAbi, provider);
            const bal: bigint = await vault.getBalance(owner, ethers.ZeroAddress);
            setVaultBalance(Number(ethers.formatEther(bal)));
        } catch {
            // ignore temporary RPC/wallet issues in UI
        }
    }

    useEffect(() => {
        void refreshVaultBalance();
        const id = setInterval(() => {
            void refreshVaultBalance();
        }, 6000);
        return () => clearInterval(id);
    }, []);

    async function confirmInBackground(hash: string, ts: number, tradePair: string) {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
                const polled = await pollOrderStatus(hash);
                if (polled.status !== "confirmed") continue;

                const finalHash = polled.txHash || hash;
                setFeed((prev) =>
                    prev.map((item) =>
                        item.ts === ts
                            ? { ...item, status: "confirmed", txHash: finalHash }
                            : item
                    )
                );

                const history = JSON.parse(sessionStorage.getItem("phantom_trade_history") || "[]");
                const updated = history.map((row: any) =>
                    row.ts === ts
                        ? { ...row, status: "confirmed", txHash: finalHash, pair: row.pair || tradePair }
                        : row
                );
                sessionStorage.setItem("phantom_trade_history", JSON.stringify(updated.slice(0, 100)));
                return;
            } catch {
                // retry silently
            }
        }
    }

    async function runTrade(side: 0 | 1, qtyText: string) {
        const eth = (window as any).ethereum;
        if (!eth || !session) {
            alert("Complete setup first");
            return;
        }

        const qty = Number(qtyText || "0");
        if (!Number.isFinite(qty) || qty <= 0) {
            alert("Enter a valid amount");
            return;
        }
        if (qty > vaultBalance) {
            alert(`Insufficient vault balance. Available: ${vaultBalance.toFixed(4)} INJ`);
            return;
        }

        // ✅ Optimistic update: show as pending immediately
        const optimisticItem: TradeFeedItem = {
            side: side === 0 ? "BUY" : "SELL",
            qty,
            price: midPrice,
            ts: Date.now(),
            status: "pending"
        };

        setTradesToday((x) => x + 1);
        setFeed((prev) => [optimisticItem, ...prev].slice(0, 8));
        setActiveSide(side === 0 ? "BUY" : "SELL");

        if (side === 0) setBuyQty("");
        else setSellQty("");

        try {
            const provider = new ethers.BrowserProvider(eth);
            const result = await submitTrade({
                eoaProvider: provider,
                pair,
                qty,
                side,
                sessionPrivateKey: session.privateKey
            });

            const immediateHash = result.txHash || result.userOpHash;
            const immediateStatus = result.status;

            // ✅ Update optimistic item with confirmed status
            setFeed((prev) =>
                prev.map((item) =>
                    item.ts === optimisticItem.ts
                        ? {
                            ...item,
                            status: immediateStatus,
                            txHash: immediateHash
                        }
                        : item
                )
            );

            const history = JSON.parse(sessionStorage.getItem("phantom_trade_history") || "[]");
            history.unshift({
                ...optimisticItem,
                pair,
                status: immediateStatus,
                txHash: immediateHash,
                gas: 0
            });
            sessionStorage.setItem("phantom_trade_history", JSON.stringify(history.slice(0, 100)));

            if (immediateStatus !== "confirmed") {
                void confirmInBackground(result.userOpHash, optimisticItem.ts, pair);
            }

            void refreshVaultBalance();
        } catch (err) {
            console.error("Trade failed:", err);
            // ✅ Mark as failed instead of pending
            setFeed((prev) =>
                prev.filter((item) => item.ts !== optimisticItem.ts)
            );
            alert(`Trade failed: ${err}`);
        } finally {
            setActiveSide(null);
        }
    }

    return (
        <div className="space-y-4 animate-rise">
            <section className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-lg font-bold">
                        <span className="h-2.5 w-2.5 animate-pulseDot rounded-full bg-accent" />
                        Phantom DEX · inEVM
                    </div>
                    <div className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-sm text-amber-200">
                        SESSION KEY · {remainingText} remaining
                    </div>
                </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Live price" value={midPrice.toFixed(4)} valueClass="text-accent" />
                <StatCard label="24h change" value={`${change24h.toFixed(4)}%`} valueClass={change24h >= 0 ? "text-accent" : "text-danger"} />
                <StatCard label="Gas paid" value="$0.00" valueClass="text-accent" />
                <StatCard label="Vault INJ" value={vaultBalance.toFixed(4)} valueClass="text-slate-100" />
            </section>

            <section className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Price chart</h3>
                    <select value={pair} onChange={(e) => setPair(e.target.value)} className="rounded-lg border border-white/20 bg-black/30 px-2 py-1">
                        {PAIRS.map((p) => (
                            <option key={p} value={p}>
                                {p}
                            </option>
                        ))}
                    </select>
                </div>
                <svg viewBox="0 0 100 32" className="h-24 w-full rounded-xl bg-black/30 p-2">
                    <polyline fill="none" stroke="#24d98c" strokeWidth="1.5" points={sparkline} />
                </svg>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <TradePanel
                    side="BUY"
                    amount={buyQty}
                    onAmount={setBuyQty}
                    estimate={(Number(buyQty || 0) * midPrice).toFixed(2)}
                    buttonLabel="1-CLICK BUY"
                    colorClass="text-accent"
                    onSubmit={() => runTrade(0, buyQty)}
                    pending={pending && activeSide === "BUY"}
                    disabled={!session || pending}
                />
                <TradePanel
                    side="SELL"
                    amount={sellQty}
                    onAmount={setSellQty}
                    estimate={(Number(sellQty || 0) * midPrice).toFixed(2)}
                    buttonLabel="1-CLICK SELL"
                    colorClass="text-danger"
                    onSubmit={() => runTrade(1, sellQty)}
                    pending={pending && activeSide === "SELL"}
                    disabled={!session || pending}
                />
            </section>

            <section className="panel p-4">
                <h3 className="mb-3 font-semibold">Trade feed</h3>
                <div className="space-y-2">
                    {feed.map((row, idx) => (
                        <div key={`${row.ts}-${idx}`} className="grid grid-cols-6 items-center gap-2 rounded-lg bg-black/25 px-3 py-2 text-sm">
                            <span className={row.side === "BUY" ? "text-accent" : "text-danger"}>{row.side}</span>
                            <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">gasless</span>
                            <span>{row.qty.toFixed(4)}</span>
                            <span className="font-mono">{row.price.toFixed(4)}</span>
                            <span>{new Date(row.ts).toLocaleTimeString()}</span>
                            <span className={row.status === "confirmed" ? "text-accent" : "text-amber-300"}>
                                ● {row.status}
                            </span>
                            <span className="col-span-6 text-xs text-slate-300 sm:col-span-2">
                                {row.txHash ? (
                                    <a
                                        href={`${TX_EXPLORER_BASE}/${row.txHash}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono text-accent underline"
                                    >
                                        tx: {row.txHash.slice(0, 10)}...{row.txHash.slice(-8)}
                                    </a>
                                ) : (
                                    <span className="text-slate-500">tx: waiting...</span>
                                )}
                            </span>
                        </div>
                    ))}
                    {!feed.length && <p className="text-sm text-slate-400">No trades yet.</p>}
                </div>
            </section>
        </div>
    );
}

function StatCard(props: { label: string; value: string; valueClass?: string }) {
    return (
        <div className="panel p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">{props.label}</p>
            <p className={`mt-2 font-mono text-2xl ${props.valueClass || ""}`}>{props.value}</p>
        </div>
    );
}

function TradePanel(props: {
    side: "BUY" | "SELL";
    amount: string;
    onAmount: (next: string) => void;
    estimate: string;
    buttonLabel: string;
    colorClass: string;
    onSubmit: () => void;
    pending: boolean;
    disabled?: boolean;
}) {
    return (
        <div className="panel p-4">
            <h3 className={`mb-3 text-lg font-semibold ${props.colorClass}`}>{props.side}</h3>
            <label className="text-sm text-slate-300">Amount ({props.side === "BUY" ? "INJ" : "INJ"})</label>
            <input
                value={props.amount}
                onChange={(e) => props.onAmount(e.target.value)}
                disabled={props.disabled || props.pending}
                className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono disabled:opacity-50"
            />
            <p className="mt-2 text-sm text-slate-300">USDT estimate: <span className="font-mono">{Number(props.estimate).toFixed(2)}</span></p>
            <button
                onClick={props.onSubmit}
                disabled={props.disabled || props.pending}
                className="mt-4 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-semibold disabled:opacity-50 transition-opacity"
            >
                {props.pending ? (
                    <>
                        <span className="inline-block animate-spin mr-2">⟳</span>
                        Processing...
                    </>
                ) : (
                    <>
                        {props.buttonLabel}
                        <span className="ml-2 rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">no popup</span>
                    </>
                )}
            </button>
        </div>
    );
}

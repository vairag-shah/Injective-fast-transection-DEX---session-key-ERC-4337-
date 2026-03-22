"use client";
import { useSessionKey } from "@/hooks/useSessionKey";
import { usePriceFeed } from "@/hooks/usePriceFeed";
import { useUserOp } from "@/hooks/useUserOp";
import { VAULT_ADDRESS, vaultAbi } from "@/lib/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import AnimatedGenerateButton from "@/components/ui/animated-generate-button-shadcn-tailwind";
import { pollOrderStatus } from "@/lib/injective";

type TradeFeedItem = {
    side: "BUY" | "SELL";
    qty: number;
    price: number;
    ts: number;
    status: "confirmed" | "pending";
    txHash?: string | null;
    userOpHash?: string;
};

const PAIRS = ["INJ/USDT", "ETH/USDT", "BTC/USDT", "BTC/ETH", "BTC/INJ"];

export default function Terminal() {
    const { session, remainingText } = useSessionKey();
    const [pair, setPair] = useState("INJ/USDT");
    const [timeframe, setTimeframe] = useState("15M");
    const [amount, setAmount] = useState("10");
    const [feed, setFeed] = useState<TradeFeedItem[]>([]);
    const [tradesToday, setTradesToday] = useState(0);
    const [vaultInjBalance, setVaultInjBalance] = useState<number | null>(null);
    const [balanceLoading, setBalanceLoading] = useState(false);
    const [walletAddress, setWalletAddress] = useState("");
    const [executingSide, setExecutingSide] = useState<0 | 1 | null>(null);

    const { prices, midPrice, change24h } = usePriceFeed(pair);
    const { pending, submitTrade } = useUserOp();

    const refreshBalances = useCallback(
        async (nextProvider?: ethers.BrowserProvider, nextAddress?: string) => {
            const eth = (window as any).ethereum;
            if (!eth) return;
            if (!VAULT_ADDRESS) return;
            const p = nextProvider || new ethers.BrowserProvider(eth);
            const address = nextAddress || walletAddress;
            if (!address) return;

            setBalanceLoading(true);
            try {
                const vaultBal = await new ethers.Contract(
                    ethers.getAddress(VAULT_ADDRESS.toLowerCase()),
                    vaultAbi,
                    p,
                ).getBalance(ethers.getAddress(address.toLowerCase()), ethers.ZeroAddress);
                setVaultInjBalance(Number(ethers.formatEther(vaultBal)));
            } catch (err) {
                console.warn("Failed to refresh balances", err);
                setVaultInjBalance(null);
            } finally {
                setBalanceLoading(false);
            }
        },
        [walletAddress],
    );

    useEffect(() => {
        const eth = (window as any).ethereum;
        if (eth) {
            const p = new ethers.BrowserProvider(eth);
            p.getSigner()
                .then((s: ethers.Signer) => s.getAddress())
                .then((addr: string) => {
                    setWalletAddress(addr);
                    refreshBalances(p, addr);
                })
                .catch(() => { });
        }
    }, [refreshBalances]);

    useEffect(() => {
        if (!walletAddress) return;
        const id = setInterval(() => {
            refreshBalances().catch(() => { });
        }, 8000);
        return () => clearInterval(id);
    }, [walletAddress, refreshBalances]);

    const chartData = useMemo(() => {
        // Multiplier to simulate different data densities for different timeframes
        const factor =
            timeframe === "1M"
                ? 1
                : timeframe === "5M"
                    ? 2
                    : timeframe === "15M"
                        ? 3
                        : 5;
        return prices.map((p, i) => ({
            name: i,
            price: p + Math.sin(i / factor) * 0.1,
        }));
    }, [prices, timeframe]);

    useEffect(() => {
        const history = JSON.parse(
            sessionStorage.getItem("phantom_trade_history") || "[]",
        );
        setFeed(history);
    }, []);

    // Foreground/Background polling for pending transactions in Terminal feed
    useEffect(() => {
        const pending = feed
            .filter(tx => (tx.status === "pending" || !tx.txHash) && tx.userOpHash);

        if (pending.length === 0) return;

        const interval = setInterval(async () => {
            let changed = false;
            const newFeed = [...feed];

            await Promise.all(newFeed.map(async (tx, idx) => {
                if ((tx.status === "pending" || !tx.txHash) && tx.userOpHash) {
                    try {
                        const res = await pollOrderStatus(tx.userOpHash);
                        if (res.status === "confirmed" && res.txHash) {
                            newFeed[idx] = { ...tx, status: "confirmed", txHash: res.txHash };
                            changed = true;
                        }
                    } catch (e) {
                        // ignore poll error
                    }
                }
            }));

            if (changed) {
                setFeed(newFeed);
                sessionStorage.setItem("phantom_trade_history", JSON.stringify(newFeed.slice(0, 100)));
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [feed]);

    async function runTrade(side: 0 | 1, qtyText: string) {
        const eth = (window as any).ethereum;
        if (!eth || !session) {
            alert("Complete setup first");
            return;
        }

        if (vaultInjBalance === null) {
            alert("Balance not loaded yet");
            return;
        }

        const qty = Number(qtyText || "0");
        const vaultNum = vaultInjBalance;

        if (vaultNum === 0 || qty > (vaultNum + 0.0000001)) {
            alert("You have low or zero balance in vault");
            return;
        }

        setExecutingSide(side);
        try {
            const provider = new ethers.BrowserProvider(eth);
            const result = await submitTrade({
                eoaProvider: provider,
                pair,
                qty,
                side,
                sessionPrivateKey: session.privateKey,
            });

            const item: TradeFeedItem = {
                side: side === 0 ? "BUY" : "SELL",
                qty,
                price: midPrice,
                ts: Date.now(),
                status: result.txHash ? "confirmed" : "pending",
                txHash: result.txHash,
                userOpHash: result.userOpHash, // Store userOpHash for polling
            };

            setTradesToday((x) => x + 1);
            setFeed((prev) => [item, ...prev].slice(0, 8));

            const history = JSON.parse(
                sessionStorage.getItem("phantom_trade_history") || "[]",
            );
            history.unshift({ ...item, pair, txHash: result.txHash, userOpHash: result.userOpHash, gas: 0 });
            sessionStorage.setItem(
                "phantom_trade_history",
                JSON.stringify(history.slice(0, 100)),
            );

            setTimeout(() => refreshBalances(), 2000);
        } finally {
            setExecutingSide(null);
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-20">
            {/* Top Info Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 glass-card p-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-accent animate-pulse shadow-[0_0_10px_var(--accent-blue)]" />
                        <span className="font-bold tracking-tight text-lg">
                            Phantom <span className="text-accent">DEX</span>
                        </span>
                    </div>
                    <div className="h-4 w-px bg-muted/30" />
                    <select
                        value={pair}
                        onChange={(e) => setPair(e.target.value)}
                        className="bg-transparent font-bold text-accent cursor-pointer focus:outline-none"
                    >
                        {PAIRS.map((p) => (
                            <option
                                key={p}
                                value={p}
                                className="bg-background text-foreground"
                            >
                                {p}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-6 overflow-x-auto">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Price
                        </span>
                        <span className="font-mono text-accent text-lg">
                            ${midPrice.toFixed(4)}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            24h Change
                        </span>
                        <span
                            className={`font-mono text-lg ${change24h >= 0 ? "text-accent" : "text-danger"
                                }`}
                        >
                            {change24h >= 0 ? "+" : ""}
                            {change24h.toFixed(2)}%
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            Vault Balance
                        </span>
                        <span
                            className={`font-mono text-lg ${balanceLoading ? "text-accent animate-pulse" : "text-accent"
                                }`}
                        >
                            {vaultInjBalance === null ? "-" : vaultInjBalance.toFixed(4)}{" "}
                            <span className="text-[10px]">INJ</span>
                        </span>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-2 rounded-full bg-amber-400/10 px-4 py-1.5 border border-amber-400/20">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-bold text-amber-200 uppercase tracking-tighter">
                        Session Active • {remainingText}
                    </span>
                </div>
            </div>

            {/* Main Trading Area */}
            <div className="grid gap-6 lg:grid-cols-4 lg:grid-rows-[auto_1fr]">
                {/* Chart Area */}
                <div className="lg:col-span-3 glass-card p-6 flex flex-col min-h-96">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                            Market Activity
                        </h3>
                        <div className="flex gap-2">
                            {["1M", "5M", "15M", "1H", "1D"].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTimeframe(t)}
                                    className={`px-2 py-1 text-[10px] font-bold rounded transiton-all ${t === timeframe
                                        ? "bg-accent/20 text-accent ring-1 ring-accent/30"
                                        : "text-muted-foreground hover:bg-white/5"
                                        }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 relative bg-black/20 rounded-2xl border border-white/5 p-4 overflow-hidden mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                        <stop
                                            offset="5%"
                                            stopColor="var(--accent-blue)"
                                            stopOpacity={0.8}
                                        />
                                        <stop
                                            offset="95%"
                                            stopColor="var(--accent-blue)"
                                            stopOpacity={0}
                                        />
                                    </linearGradient>
                                </defs>
                                <YAxis domain={["dataMin", "dataMax"]} hide />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0f172a",
                                        borderColor: "rgba(255,255,255,0.1)",
                                        borderRadius: "12px",
                                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                                    }}
                                    itemStyle={{
                                        color: "var(--accent-blue)",
                                        fontWeight: "bold",
                                    }}
                                    labelStyle={{ display: "none" }}
                                    formatter={(value: any) => [
                                        `$${Number(value).toFixed(4)}`,
                                        "Price",
                                    ]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="price"
                                    stroke="var(--accent-blue)"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorPrice)"
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Order Controls */}
                <div className="space-y-6">
                    <div className="glass-card p-6 flex flex-col gap-6">
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                                Instant Trade
                            </h3>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                                    <span>Amount</span>
                                    <div className="flex items-center gap-1">
                                        <span>Available:</span>
                                        <span
                                            className={
                                                balanceLoading
                                                    ? "text-accent animate-pulse"
                                                    : "text-foreground"
                                            }
                                        >
                                            {vaultInjBalance === null ? "-" : vaultInjBalance.toFixed(4)} INJ
                                        </span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <input
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-lg focus:border-accent outline-none"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                                        INJ
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2 w-full">
                            <AnimatedGenerateButton
                                className="w-full h-14 flex items-center justify-center text-base font-bold tracking-wide"
                                labelIdle={
                                    !session
                                        ? "SETUP REQUIRED"
                                        : vaultInjBalance === null
                                            ? "LOADING"
                                            : vaultInjBalance === 0
                                                ? "ZERO BALANCE"
                                                : Number(amount) > (vaultInjBalance + 0.0000001)
                                                    ? "INSUFFICIENT BALANCE"
                                                    : "1 CLICK BUY"
                                }
                                labelActive="EXECUTING"
                                generating={executingSide === 0}
                                highlightHueDeg={215}
                                showIcon={false}
                                disabled={
                                    executingSide !== null ||
                                    !session ||
                                    vaultInjBalance === null ||
                                    Number(amount) > (vaultInjBalance + 0.0000001) ||
                                    vaultInjBalance === 0
                                }
                                onClick={() => runTrade(0, amount)}
                            />

                            <AnimatedGenerateButton
                                className="w-full h-14 flex items-center justify-center text-base font-bold tracking-wide"
                                labelIdle={
                                    !session
                                        ? "SETUP REQUIRED"
                                        : vaultInjBalance === null
                                            ? "LOADING"
                                            : vaultInjBalance === 0
                                                ? "ZERO BALANCE"
                                                : Number(amount) > (vaultInjBalance + 0.0000001)
                                                    ? "INSUFFICIENT BALANCE"
                                                    : "1 CLICK SELL"
                                }
                                labelActive="EXECUTING"
                                generating={executingSide === 1}
                                highlightHueDeg={350}
                                showIcon={false}
                                disabled={
                                    executingSide !== null ||
                                    !session ||
                                    vaultInjBalance === null ||
                                    Number(amount) > (vaultInjBalance + 0.0000001) ||
                                    vaultInjBalance === 0
                                }
                                onClick={() => runTrade(1, amount)}
                            />
                        </div>

                        <div className="flex flex-col gap-2 p-3 bg-accent/5 rounded-xl border border-accent/10">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                                <span className="text-muted-foreground">Total</span>
                                <span className="text-foreground font-mono">
                                    ${(Number(amount || 0) * midPrice).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                                <span className="text-muted-foreground">Fee</span>
                                <span className="text-accent">SPONSORED</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Trade Feed */}
                <div className="lg:col-span-4 glass-card p-6 overflow-hidden">
                    <div className="mb-6 flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                            Recent Activity
                        </h3>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-tighter">
                            <div className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                            Live Network
                        </div>
                    </div>

                    <div className="grid gap-2">
                        {feed.map((row, idx) => (
                            <div
                                key={`${row.ts}-${idx}`}
                                className="grid grid-cols-7 items-center gap-3 rounded-xl bg-black/20 p-4 text-xs border border-white/5 hover:bg-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`h-2 w-2 rounded-full ${row.side === "BUY" ? "bg-accent" : "bg-danger"
                                            }`}
                                    />
                                    <span
                                        className={`font-bold uppercase tracking-tighter ${row.side === "BUY" ? "text-accent" : "text-danger"
                                            }`}
                                    >
                                        {row.side}
                                    </span>
                                </div>
                                <div className="flex">
                                    <span className="rounded-full bg-accent/10 border border-accent/20 px-3 py-0.5 text-[10px] font-bold text-accent uppercase">
                                        Gasless
                                    </span>
                                </div>
                                <div className="font-mono text-foreground font-bold">
                                    {row.qty.toFixed(4)} INJ
                                </div>
                                <div className="font-mono text-muted-foreground">
                                    @ {row.price.toFixed(4)}
                                </div>
                                <div className="text-muted-foreground text-opacity-30 font-medium">
                                    {new Date(row.ts).toLocaleTimeString()}
                                </div>
                                <div className="text-right">
                                    {row.txHash ? (
                                        <a
                                            href={`https://testnet.blockscout.injective.network/tx/${row.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] font-bold tracking-widest text-accent uppercase hover:underline truncate max-w-[100px] inline-block"
                                            title={row.txHash}
                                        >
                                            {row.txHash.substring(0, 6)}...
                                        </a>
                                    ) : (
                                        <span className="text-[10px] font-bold tracking-widest text-accent/50 uppercase">
                                            -
                                        </span>
                                    )}
                                </div>
                                <div className="text-right">
                                    {row.txHash ? (
                                        <span className="text-[10px] font-bold tracking-widest text-accent uppercase">
                                            Success
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold tracking-widest text-accent/50 uppercase">
                                            Success
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

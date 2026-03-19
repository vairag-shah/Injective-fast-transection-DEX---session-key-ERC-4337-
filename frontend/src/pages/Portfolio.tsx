import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { SMART_ACCOUNT_FACTORY, factoryAbi, smartAccountAbi } from "../lib/contracts";
import { useSessionKey } from "../hooks/useSessionKey";

type HistoryRow = {
    pair: string;
    side: "BUY" | "SELL";
    qty: number;
    price: number;
    ts: number;
    status: "confirmed" | "pending";
    txHash?: string | null;
};

export default function Portfolio() {
    const { session, remainingText, clearSession } = useSessionKey();
    const [history, setHistory] = useState<HistoryRow[]>([]);

    useEffect(() => {
        const rows = JSON.parse(sessionStorage.getItem("phantom_trade_history") || "[]");
        setHistory(rows);
    }, []);

    const totalBalance = useMemo(() => history.reduce((a, x) => a + x.qty * x.price, 0), [history]);
    const pnl = useMemo(() => history.reduce((a, x) => a + (x.side === "BUY" ? -x.qty * x.price * 0.01 : x.qty * x.price * 0.01), 0), [history]);

    async function revokeSessionKey() {
        const eth = (window as any).ethereum;
        if (!eth || !session) return;

        const provider = new ethers.BrowserProvider(eth);
        const signer = await provider.getSigner();
        const owner = await signer.getAddress();

        const factory = new ethers.Contract(SMART_ACCOUNT_FACTORY, factoryAbi, signer);
        const account = await factory.accountOf(owner);
        if (account === ethers.ZeroAddress) {
            alert("No smart account");
            return;
        }

        const smart = new ethers.Contract(account, smartAccountAbi, signer);
        const tx = await smart.revokeSessionKey(session.address);
        await tx.wait();
        clearSession();
    }

    return (
        <div className="space-y-4 animate-rise">
            <section className="grid gap-4 md:grid-cols-2">
                <div className="panel p-5">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Total balance</p>
                    <p className="mt-2 font-mono text-3xl">${totalBalance.toFixed(2)}</p>
                </div>
                <div className="panel p-5">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Unrealized P&L</p>
                    <p className={`mt-2 font-mono text-3xl ${pnl >= 0 ? "text-accent" : "text-danger"}`}>${pnl.toFixed(2)}</p>
                </div>
            </section>

            <section className="panel p-5">
                <h3 className="font-semibold">Active Session Key</h3>
                <p className="mt-2 text-sm">Address: <span className="font-mono">{session?.address || "-"}</span></p>
                <p className="text-sm">Expiry in: <span className="font-mono">{remainingText}</span></p>
                <p className="text-sm">Limit: <span className="font-mono">{(session?.maxTradeSize || 0).toFixed(2)} USDT</span></p>
                <p className="text-sm">Pairs: <span className="font-mono">{(session?.allowedPairs || []).join(", ") || "-"}</span></p>
                <button onClick={revokeSessionKey} className="mt-3 rounded-lg border border-danger/40 bg-danger/20 px-4 py-2 text-danger">
                    Revoke Session Key
                </button>
            </section>

            <section className="panel p-5">
                <h3 className="mb-3 font-semibold">Trade history</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-slate-400">
                            <tr>
                                <th className="py-2">Pair</th>
                                <th>Side</th>
                                <th>Qty</th>
                                <th>Price</th>
                                <th>Time</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((row, idx) => (
                                <tr key={`${row.ts}-${idx}`} className="border-t border-white/10">
                                    <td className="py-2">{row.pair}</td>
                                    <td className={row.side === "BUY" ? "text-accent" : "text-danger"}>{row.side}</td>
                                    <td>{row.qty.toFixed(4)}</td>
                                    <td className="font-mono">{row.price.toFixed(4)}</td>
                                    <td>{new Date(row.ts).toLocaleString()}</td>
                                    <td>{row.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

const RELAY_BASE = import.meta.env.VITE_RELAY_URL || "http://localhost:8787";

export async function fetchOrderbook(pair: string) {
    const res = await fetch(`${RELAY_BASE}/api/orderbook/${encodeURIComponent(pair)}`);
    if (!res.ok) throw new Error("Failed orderbook");
    return res.json();
}

export async function fetchTrades(pair: string) {
    const res = await fetch(`${RELAY_BASE}/api/trades/${encodeURIComponent(pair)}`);
    if (!res.ok) throw new Error("Failed trades");
    return res.json();
}

export async function submitUserOp(userOp: unknown) {
    const res = await fetch(`${RELAY_BASE}/api/submit-userop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(userOp)
    });
    if (!res.ok) throw new Error("submit failed");
    return res.json() as Promise<{ userOpHash: string }>;
}

export async function pollOrderStatus(userOpHash: string) {
    const res = await fetch(`${RELAY_BASE}/api/order-status/${userOpHash}`);
    if (!res.ok) throw new Error("poll failed");
    return res.json() as Promise<{ status: string; txHash: string | null }>;
}

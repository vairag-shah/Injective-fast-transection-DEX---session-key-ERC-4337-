import { useEffect, useMemo, useState } from "react";
import { fetchOrderbook } from "../lib/injective";

export function usePriceFeed(pair: string) {
    const [prices, setPrices] = useState<number[]>([]);
    const [midPrice, setMidPrice] = useState(0);

    useEffect(() => {
        let mounted = true;

        async function tick() {
            try {
                const data = await fetchOrderbook(pair);
                if (!mounted) return;

                const next = Number(data.midPrice || 0);
                setMidPrice(next);
                setPrices((prev) => [...prev.slice(-29), next]);
            } catch {
                if (!mounted) return;
            }
        }

        tick();
        const i = setInterval(tick, 5000);
        return () => {
            mounted = false;
            clearInterval(i);
        };
    }, [pair]);

    const change24h = useMemo(() => {
        if (prices.length < 2) return 0;
        const first = prices[0] || 1;
        const last = prices[prices.length - 1] || 1;
        return ((last - first) / first) * 100;
    }, [prices]);

    return { prices, midPrice, change24h };
}

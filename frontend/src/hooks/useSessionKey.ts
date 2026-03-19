import { useEffect, useMemo, useState } from "react";

const SESSION_STORAGE_KEY = "phantom_session_key";

type SessionState = {
    privateKey: string;
    address: string;
    expiry: number;
    maxTradeSize: number;
    allowedPairs: string[];
};

export function useSessionKey() {
    const [session, setSession] = useState<SessionState | null>(null);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
            setSession(JSON.parse(raw));
        }
    }, []);

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const remainingMs = useMemo(() => {
        if (!session) return 0;
        return Math.max(0, session.expiry - now);
    }, [session, now]);

    const remainingText = useMemo(() => {
        const total = Math.floor(remainingMs / 1000);
        const h = String(Math.floor(total / 3600)).padStart(2, "0");
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
        const s = String(total % 60).padStart(2, "0");
        return `${h}:${m}:${s}`;
    }, [remainingMs]);

    function saveSession(next: SessionState) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
        setSession(next);
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
    }

    return {
        session,
        remainingMs,
        remainingText,
        saveSession,
        clearSession
    };
}

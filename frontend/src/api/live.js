import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import api from "./axios";

// Live operational updates. A Socket.IO message is only a hint that something changed: the screen
// reloads its data from the API, which stays the source of truth. After a reconnect the client
// asks GET /events?since=<last event time> for anything it missed. Where live updates are not
// available (serverless hosting, a blocked WebSocket, the server switched them off) the screen
// keeps polling, so nothing depends on the socket.

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";
const ORIGIN = API.replace(/\/api\/v1\/?$/, "");
const LIVE = import.meta.env.VITE_REALTIME !== "off";

/**
 * Calls `onChange(events)` (debounced) when events of the given types arrive.
 * Returns "live" while the socket is connected, otherwise "polling".
 */
export const useLiveEvents = (onChange, { enabled = true, types = null, pollMs = 10000, livePollMs = 60000 } = {}) => {
    const [mode, setMode] = useState("polling");
    const cb = useRef(onChange); cb.current = onChange;
    const typeKey = types ? types.join(",") : "";

    useEffect(() => {
        if (!enabled) return undefined;
        let socket = null; let timer = null; let poll = null; let lastAt = Date.now(); let stopped = false;
        const seen = new Set(); let batch = [];
        const wanted = (e) => !typeKey || typeKey.split(",").includes(e.type);
        const flush = () => { timer = null; const b = batch; batch = []; if (!stopped) cb.current(b); };
        const push = (e) => {
            if (!e?._id || seen.has(e._id)) return;
            seen.add(e._id); if (seen.size > 2000) seen.clear();
            lastAt = Math.max(lastAt, Date.parse(e.at) || 0);
            if (!wanted(e)) return;
            batch.push(e); if (!timer) timer = setTimeout(flush, 400);
        };
        const startPolling = (ms) => { clearInterval(poll); poll = setInterval(() => !stopped && cb.current([]), ms); };
        startPolling(pollMs);

        if (LIVE) {
            socket = io(ORIGIN, {
                path: "/socket.io", withCredentials: true, transports: ["websocket"],
                auth: (send) => send({ token: localStorage.getItem("token") || undefined }),
                reconnectionDelay: 2000, reconnectionDelayMax: 30000
            });
            socket.on("connect", async () => {
                setMode("live"); startPolling(livePollMs);
                try {
                    const { data } = await api.get("/events", { params: { since: lastAt, ...(typeKey ? { types: typeKey } : {}) } });
                    (data.data.items ?? []).forEach(push);
                } catch { /* the next poll covers it */ }
            });
            socket.on("disconnect", () => { setMode("polling"); startPolling(pollMs); });
            socket.on("connect_error", () => { setMode("polling"); });
            socket.on("event", (e) => { push(e); socket.emit("ack", e._id); });
        }
        return () => { stopped = true; clearTimeout(timer); clearInterval(poll); socket?.close(); };
    }, [enabled, typeKey, pollMs, livePollMs]);
    return mode;
};

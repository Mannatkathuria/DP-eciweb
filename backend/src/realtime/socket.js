import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { redis } from "../config/redis.js";
import { getUserById } from "../repositories/user.repository.js";
import { effectiveAssignments, hasPermission } from "../services/authority.service.js";
import { CHANNEL, visibleTo } from "../services/events.service.js";

// Live operational updates over Socket.IO, for a long-running Node host. (Vercel serverless
// functions cannot hold WebSocket connections; there the screens keep polling, which is why
// every live screen also works without this.)
//
// - The handshake carries the same session token as the API; a suspended or unknown account is
//   refused. The socket's assignments are loaded on connect and refreshed every minute, so a
//   revoked assignment stops the feed within a minute.
// - Events come from the Redis channel that the API publishes to after each committed change, so
//   any number of API instances and socket servers can run. Each event goes only to sockets whose
//   assignments cover its jurisdiction ("jurisdiction-scoped broadcast").
// - Clients acknowledge each event id; the client also deduplicates by id and catches up from
//   GET /api/v1/events?since=<last event time> after a reconnect.

const LIVE_PERMISSIONS = ["control:view", "polling:conduct", "polling:identify-voter", "polling:mark-register", "incident:manage", "roll:view-part", "application:decide"];
const REFRESH_MS = 60000;

const tokenFrom = (socket) => {
    const auth = socket.handshake.auth?.token;
    if (auth) return auth;
    const cookie = socket.handshake.headers?.cookie ?? "";
    return cookie.split(/;\s*/).find((c) => c.startsWith("accessToken="))?.slice("accessToken=".length) ?? null;
};

export const attachRealtime = async (httpServer, { origins }) => {
    const io = new Server(httpServer, { path: "/socket.io", cors: { origin: origins, credentials: true } });

    io.use(async (socket, next) => {
        try {
            const decoded = jwt.verify(tokenFrom(socket) ?? "", process.env.ACCESS_TOKEN_SECRET);
            const user = await getUserById(decoded._id);
            if (!user || user.suspended) return next(new Error("unauthorised"));
            if (!LIVE_PERMISSIONS.some((p) => hasPermission(user, p))) return next(new Error("forbidden"));
            socket.data.user = user;
            socket.data.assignments = await effectiveAssignments(user);
            socket.data.acked = 0;
            next();
        } catch { next(new Error("unauthorised")); }
    });

    io.on("connection", (socket) => {
        const refresh = setInterval(async () => {
            const user = await getUserById(socket.data.user._id).catch(() => null);
            if (!user || user.suspended) return socket.disconnect(true);
            socket.data.assignments = await effectiveAssignments(user);
        }, REFRESH_MS);
        socket.on("ack", (id) => { if (typeof id === "string") socket.data.acked += 1; });
        socket.on("disconnect", () => clearInterval(refresh));
        socket.emit("hello", { at: new Date().toISOString(), assignments: socket.data.assignments.length });
    });

    const sub = redis().duplicate();
    sub.on("error", (e) => console.error("Realtime subscriber error:", e.message));
    await sub.connect();
    await sub.subscribe(CHANNEL, (message) => {
        let event;
        try { event = JSON.parse(message); } catch { return; }
        for (const socket of io.of("/").sockets.values()) {
            if (visibleTo(socket.data.assignments ?? [], event)) socket.emit("event", event);
        }
    });
    console.log("Realtime updates enabled (Socket.IO).");
    return { io, close: async () => { await sub.quit().catch(() => {}); io.close(); } };
};

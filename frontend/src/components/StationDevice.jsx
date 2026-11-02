import { useEffect, useState } from "react";
import api from "../api/axios";
import { apiMessage } from "../config/elections";
import OfflineDesk from "./OfflineDesk";

// Registers this browser as one of the polling station's devices and sends a verified heartbeat
// every 30 seconds while the poll-day screen is open. The control room shows a station as online
// only from these heartbeats. The device secret is kept on this device (it is shown nowhere and
// the server keeps only its hash).

const storeKey = (stationId) => `eciweb-device:${stationId}`;
const read = (stationId) => { try { return JSON.parse(localStorage.getItem(storeKey(stationId)) || "null"); } catch { return null; } };
const LABEL = { online: "Online", synchronising: "Syncing", sync_failed: "Sync failed", stale: "No recent heartbeat", offline: "Offline", unknown: "Not yet reported", revoked: "Revoked" };

/** Heartbeat status from other parts of the app (the offline outbox reports its size here). */
export const deviceHeaders = (stationId) => { const d = read(stationId); return d ? { "X-Device-Id": d.id, "X-Device-Token": d.secret } : {}; };
let outbox = { pendingOutbox: 0, lastSyncAt: null, lastSyncError: null, packageVersion: null };
export const reportOutbox = (state) => { outbox = { ...outbox, ...state }; };

export default function StationDevice({ station, role }) {
    const [device, setDevice] = useState(() => read(station._id));
    const [status, setStatus] = useState(null);
    const [error, setError] = useState("");
    const [label, setLabel] = useState("");

    useEffect(() => {
        if (!device) return undefined;
        let stop = false;
        const beat = async () => {
            try {
                const { data } = await api.post("/devices/heartbeat", { ...outbox, appVersion: "web" }, { headers: { "X-Device-Id": device.id, "X-Device-Token": device.secret } });
                if (!stop) { setStatus(data.data.connectivity); setError(""); }
            } catch (err) {
                if (stop) return;
                if ([401, 403].includes(err.response?.status) && /revoked|not registered/.test(apiMessage(err, ""))) {
                    localStorage.removeItem(storeKey(station._id)); setDevice(null);
                }
                setStatus(err.response ? null : "offline");
                setError(err.response ? apiMessage(err, "Heartbeat refused.") : "No connection. Records are kept on this device until the connection returns.");
            }
        };
        beat();
        const t = setInterval(beat, 30000);
        return () => { stop = true; clearInterval(t); };
    }, [device, station._id]);

    const register = async (e) => {
        e.preventDefault(); setError("");
        try {
            const { data } = await api.post("/devices/register", { label: label || undefined, stationId: station._id });
            const d = { id: data.data.device._id, secret: data.data.deviceSecret, label: data.data.device.label };
            localStorage.setItem(storeKey(station._id), JSON.stringify(d)); setDevice(d);
        } catch (err) { setError(apiMessage(err, "Could not register this device.")); }
    };

    return (
        <div className="panel">
            <h2 style={{ marginTop: 0 }}>This device</h2>
            {device
                ? <p>{device.label}: <strong>{LABEL[status] ?? "Checking…"}</strong>. It reports to the control room every 30 seconds while this page is open.</p>
                : <form className="portal-form" onSubmit={register}>
                    <p>Register this tablet or laptop so the control room can see that the station is connected.</p>
                    <div className="field"><label htmlFor="dev-label">Name for this device</label>
                        <input id="dev-label" value={label} maxLength={80} placeholder="e.g. Tablet 1 (first polling officer)" onChange={(e) => setLabel(e.target.value)} /></div>
                    <button className="btn btn-primary">Register this device</button>
                </form>}
            {error && <div className="alert alert-warn" role="status">{error}</div>}
            {device && <OfflineDesk station={station} device={device} role={role} />}
        </div>
    );
}

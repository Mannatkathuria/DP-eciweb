import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import { STAGE_LABEL, apiMessage } from "../config/elections";
import { useLiveEvents } from "../api/live";

// Control room: every polling station in the signed-in official's jurisdiction, with alerts first,
// incidents to handle, sector officers' visits and each station's device connectivity. Updates
// arrive live over Socket.IO where the server offers it; otherwise the page refreshes every 10 s.

const ROLES = ["sector_officer", "ro", "aro", "deo", "deputy_deo", "ceo", "eci", "cec", "election_commissioner", "general_observer"];
const POLL = { not_started: ["Not started", "badge-warn"], mock_poll_done: ["Mock poll held", "badge-warn"], open: ["Open", "badge-ok"], closed: ["Closed", ""] };
const SEVERITY = { low: "", medium: "badge-progress", high: "badge-warn", critical: "badge-bad" };
const INCIDENT_STATUS = { reported: "Reported", acknowledged: "Being handled", resolved: "Resolved" };
const ESCALATION = ["sector officer", "Returning Officer", "District Election Officer", "Chief Electoral Officer"];
// A station is only "online" when one of its registered devices sent a verified heartbeat.
const LINK = { online: ["Online", "badge-ok"], synchronising: ["Syncing", "badge-progress"], sync_failed: ["Sync failed", "badge-bad"], stale: ["No heartbeat", "badge-warn"], offline: ["Offline", "badge-bad"], unknown: ["No device", ""] };
const EVENT_LABEL = {
    POLL_STATUS_CHANGED: "Poll status changed", QUEUE_UPDATED: "Queue reported", TURNOUT_UPDATED: "Turnout updated", INCIDENT_CREATED: "Incident reported",
    INCIDENT_UPDATED: "Incident updated", INCIDENT_ESCALATED: "Incident escalated", EXCEPTION_CREATED: "Exception raised", EXCEPTION_RESOLVED: "Exception decided",
    STATION_ONLINE: "Device online", STATION_OFFLINE: "Device offline", SYNC_COMPLETED: "Offline records synced", SYNC_FAILED: "Sync failed",
    POLLING_STATION_UPDATED: "Polling station updated", ELECTORAL_ROLL_UPDATED: "Electoral roll published", COUNTING_UPDATE_IMPORTED: "Counting update imported", OFFICIAL_RESULT_UPDATED: "Official result updated"
};

/** Searchable history of operational events (MongoDB archive, or the Redis log). */
function EventHistory({ electionId }) {
    const [type, setType] = useState("");
    const [r, setR] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const load = async (before) => {
        setBusy(true); setError("");
        try {
            const params = Object.fromEntries(Object.entries({ types: type, electionId, before, limit: 25 }).filter(([, v]) => v));
            const data = (await api.get("/events/history", { params })).data.data;
            setR((old) => before && old ? { ...data, items: [...old.items, ...data.items] } : data);
        } catch (e) { setError(apiMessage(e, "The history could not be loaded.")); }
        finally { setBusy(false); }
    };
    return (
        <div className="panel">
            <h2>Event history</h2>
            <div className="row-actions" style={{ gap: 8 }}>
                <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="">All events</option>
                    {Object.entries(EVENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => load()}>{r ? "Refresh" : "Show history"}</button>
            </div>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {r && (
                <>
                    <p className="muted"><small>{r.items.length} event{r.items.length === 1 ? "" : "s"} · from {r.source === "mongodb" ? "the MongoDB archive" : "the Redis event log"}</small></p>
                    <ul className="rows">{r.items.map((e) => (
                        <li key={e._id}><small>{new Date(e.at).toLocaleString()}</small> · <strong>{EVENT_LABEL[e.type] ?? e.type}</strong>{e.jurisdiction?.pollingStation ? ` · ${e.jurisdiction.pollingStation}` : e.jurisdiction?.constituency ? ` · ${e.jurisdiction.constituency}` : ""}{e.actor ? ` · ${e.actor.role}` : ""}</li>
                    ))}</ul>
                    {r.next && <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => load(r.next)}>Show older</button>}
                </>
            )}
        </div>
    );
}

export default function ControlRoom() {
    const { logged, userData } = useContext(AuthContext);
    const [data, setData] = useState(null);
    const [electionId, setElectionId] = useState("");
    const [filter, setFilter] = useState("all");
    const [place, setPlace] = useState({ state: "", district: "", constituency: "" });
    const [dialog, setDialog] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const allowed = logged && ROLES.includes(userData?.role);

    const load = useCallback(async () => {
        try {
            const { data: res } = await api.get("/control-room", { params: electionId ? { electionId } : {} });
            setData(res.data); setError("");
        } catch (err) { setError(apiMessage(err, "Could not load the control room.")); }
    }, [electionId]);
    useEffect(() => { if (allowed) load(); }, [allowed, load]);
    // Reloads when an event arrives (live), or every 10 seconds when live updates are unavailable.
    const [recent, setRecent] = useState([]);
    const live = useLiveEvents((events) => {
        if (events.length) setRecent((r) => [...events.reverse(), ...r].slice(0, 8));
        load();
    }, { enabled: allowed });

    if (!logged) return <Navigate to="/signin" replace />;
    if (!allowed) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { await fn(); setNotice(ok); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const all = data?.stations ?? [];
    const options = (key, within) => [...new Set(all.filter(within).map((r) => r[key]))].sort();
    const inPlace = (r) => (!place.state || r.state === place.state) && (!place.district || r.district === place.district) && (!place.constituency || r.constituency === place.constituency);
    const FILTERS = { alerts: (r) => r.alerts.length > 0, offline: (r) => ["offline", "stale", "sync_failed", "unknown"].includes(r.connectivity?.status), pending: (r) => r.connectivity?.pendingOutbox > 0 };
    const rows = all.filter(inPlace).filter((r) => filter === "all" || (FILTERS[filter] ? FILTERS[filter](r) : r.poll === filter));
    const sum = data?.summary;

    return (
        <>
            <PageHead title="Control room" crumbs={[{ label: "Control room" }]}
                lede={data ? `${data.election.name}, poll on ${data.election.pollDate} (${STAGE_LABEL[data.election.stage]}). Updated ${new Date(data.generatedAt).toLocaleTimeString()}, ${live === "live" ? "live updates on" : "refreshes every 10 seconds"}.` : "Loading."} />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}
                    {data && (
                        <>
                            <div className="panel" style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "end" }}>
                                <div className="field" style={{ margin: 0 }}><label htmlFor="cr-el">Election</label>
                                    <select id="cr-el" value={electionId || data.election._id} onChange={(e) => setElectionId(e.target.value)}>
                                        {data.elections.map((e) => <option key={e._id} value={e._id}>{e.name} ({e.pollDate})</option>)}
                                    </select></div>
                                <div><small className="muted">Stations</small><br /><strong className="figure">{sum.stations}</strong></div>
                                <div><small className="muted">Open / closed / not open</small><br /><strong className="figure">{sum.open} / {sum.closed} / {sum.notStarted}</strong></div>
                                <div><small className="muted">Turnout</small><br /><strong className="figure">{sum.percent}%</strong> <small>({sum.voted} of {sum.electors})</small></div>
                                <div><small className="muted">Alerts</small><br /><strong className="figure">{sum.alerts}</strong></div>
                                <div><small className="muted">Open incidents</small><br /><strong className="figure">{sum.openIncidents}</strong></div>
                                {sum.connectivity && <div><small className="muted">Devices online / offline / unknown</small><br /><strong className="figure">{sum.connectivity.online + sum.connectivity.synchronising} / {sum.connectivity.offline + sum.connectivity.stale} / {sum.connectivity.unknown}</strong>{sum.connectivity.sync_failed > 0 && <> <span className="badge badge-bad">{sum.connectivity.sync_failed} sync failed</span></>}</div>}
                            </div>
                            {recent.length > 0 && (
                                <div className="panel" aria-live="polite">
                                    <h2 style={{ marginTop: 0 }}>Latest updates</h2>
                                    <ul className="rows">{recent.map((e) => <li key={e._id}><small>{new Date(e.at).toLocaleTimeString()}</small> {EVENT_LABEL[e.type] ?? e.type}{e.jurisdiction?.pollingStation ? `, ${e.jurisdiction.pollingStation}` : e.jurisdiction?.constituency ? `, ${e.jurisdiction.constituency}` : ""}</li>)}</ul>
                                </div>
                            )}
                            {!data.onPollDay && <div className="alert alert-warn">This election is not polling today, so the stations show no activity yet.</div>}

                            <div className="panel">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
                                    <h2 style={{ margin: 0 }}>Polling stations</h2>
                                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    {options("state", () => true).length > 1 && <div className="field" style={{ margin: 0 }}><label htmlFor="cr-state">State/UT</label>
                                        <select id="cr-state" value={place.state} onChange={(e) => setPlace({ state: e.target.value, district: "", constituency: "" })}><option value="">All</option>{options("state", () => true).map((v) => <option key={v}>{v}</option>)}</select></div>}
                                    {options("district", (r) => !place.state || r.state === place.state).length > 1 && <div className="field" style={{ margin: 0 }}><label htmlFor="cr-district">District</label>
                                        <select id="cr-district" value={place.district} onChange={(e) => setPlace({ ...place, district: e.target.value, constituency: "" })}><option value="">All</option>{options("district", (r) => !place.state || r.state === place.state).map((v) => <option key={v}>{v}</option>)}</select></div>}
                                    {options("constituency", (r) => (!place.state || r.state === place.state) && (!place.district || r.district === place.district)).length > 1 && <div className="field" style={{ margin: 0 }}><label htmlFor="cr-ac">Constituency</label>
                                        <select id="cr-ac" value={place.constituency} onChange={(e) => setPlace({ ...place, constituency: e.target.value })}><option value="">All</option>{options("constituency", (r) => (!place.state || r.state === place.state) && (!place.district || r.district === place.district)).map((v) => <option key={v}>{v}</option>)}</select></div>}
                                    <div className="field" style={{ margin: 0 }}><label htmlFor="cr-filter">Show</label>
                                        <select id="cr-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
                                            <option value="all">All stations</option><option value="alerts">With alerts</option>
                                            <option value="open">Poll open</option><option value="not_started">Not started</option><option value="closed">Closed</option>
                                            <option value="offline">Device offline or missing</option><option value="pending">Records waiting to sync</option>
                                        </select></div>
                                    </div>
                                </div>
                                <div className="table-wrap" style={{ marginTop: 12 }}><table>
                                    <thead><tr><th>Station</th><th>Poll</th><th>Turnout</th><th>Queue</th><th>Device</th><th>Cases / incidents</th><th>Alerts</th>{data.can.visit && <th></th>}</tr></thead>
                                    <tbody>{rows.map((r) => (
                                        <tr key={r.stationId}>
                                            <td><strong>{r.name}</strong><br /><small>Part {r.partNumber}, {r.constituency}</small>{r.lastVisit && <><br /><small className="muted">Visited {new Date(r.lastVisit.at).toLocaleTimeString()}: {r.lastVisit.note}</small></>}</td>
                                            <td><span className={`badge ${POLL[r.poll][1]}`}>{POLL[r.poll][0]}</span></td>
                                            <td className="figure">{r.turnout.percent}%<br /><small>{r.turnout.voted} / {r.turnout.electors}</small></td>
                                            <td>{r.queue ? <>{r.queue.waiting}<br /><small>{new Date(r.queue.at).toLocaleTimeString()}</small>
                                                {r.queueEstimate?.status === "estimated" && <><br /><small>~{r.queueEstimate.minutes} min</small></>}
                                                {r.queueEstimate?.status === "stale" && <><br /><span className="badge badge-warn">Stale</span></>}</> : "–"}</td>
                                            <td>{r.connectivity ? <><span className={`badge ${LINK[r.connectivity.status][1]}`}>{LINK[r.connectivity.status][0]}</span>{r.connectivity.lastHeartbeatAt && <><br /><small>{new Date(r.connectivity.lastHeartbeatAt).toLocaleTimeString()}</small></>}{r.connectivity.pendingOutbox > 0 && <><br /><small>{r.connectivity.pendingOutbox} waiting to sync</small></>}{r.connectivity.packageVersions?.length > 0 && <><br /><small className="muted">Package {r.connectivity.packageVersions.join(", ")}</small></>}</> : "–"}</td>
                                            <td>{r.openCases} / {r.openIncidents}</td>
                                            <td>{r.alerts.map((a) => <span key={a.code} className="badge badge-bad" style={{ display: "inline-block", margin: "0 4px 4px 0" }}>{a.text}</span>)}</td>
                                            {data.can.visit && <td><button className="btn btn-quiet btn-small" disabled={busy} onClick={() => setDialog({
                                                title: `Visit to ${r.name}`, label: "What did you find?", required: true, confirmLabel: "Record visit", confirmClass: "btn-approve",
                                                run: (note) => act(() => api.post(`/control-room/stations/${r.stationId}/visits`, { electionId: data.election._id, note }), "Visit recorded.")
                                            })}>Record visit</button></td>}
                                        </tr>
                                    ))}
                                    {rows.length === 0 && <tr><td colSpan={8}>No stations to show.</td></tr>}</tbody>
                                </table></div>
                            </div>

                            <div className="panel">
                                <h2>Incidents ({data.incidents.length})</h2>
                                {data.incidents.length === 0 && <p>No incidents reported.</p>}
                                <ul className="rows">{data.incidents.map((i) => (
                                    <li key={i._id} style={{ padding: "12px 0" }}>
                                        <span className={`badge ${SEVERITY[i.severity]}`}>{i.severity}</span> <strong>{data.incidentTypes[i.type]}</strong> at {i.stationName} (part {i.partNumber}, {i.constituency}) · <em>{INCIDENT_STATUS[i.status]}</em>{i.escalationLevel > 0 && <> · <span className="badge badge-warn">Escalated to {ESCALATION[i.escalationLevel]}</span></>}
                                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{i.timeline.map((t, n) => <li key={n}><small>{new Date(t.at).toLocaleTimeString()} {t.action} by {t.by}{t.note ? `: ${t.note}` : ""}</small></li>)}</ul>
                                        {data.can.manage && i.status !== "resolved" && (
                                            <div style={{ marginTop: 6 }}>
                                                {i.status === "reported" && <button className="btn-approve" style={{ marginRight: 8 }} disabled={busy} onClick={() => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "acknowledge" }), "Incident acknowledged.")}>Acknowledge</button>}
                                                <button className="btn btn-quiet btn-small" style={{ marginRight: 8 }} disabled={busy} onClick={() => setDialog({ title: "Add an update", label: "Update", required: true, confirmLabel: "Add update", confirmClass: "btn-approve",
                                                    run: (note) => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "update", note }), "Update added.") })}>Add update</button>
                                                {(i.escalationLevel ?? 0) < 3 && <button className="btn btn-quiet btn-small" style={{ marginRight: 8 }} disabled={busy} onClick={() => setDialog({ title: `Escalate to the ${ESCALATION[(i.escalationLevel ?? 0) + 1]}`, label: "Why does this need a higher level?", required: true, confirmLabel: "Escalate", confirmClass: "btn-reject",
                                                    run: (note) => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "escalate", note }), "Incident escalated.") })}>Escalate</button>}
                                                <button className="btn-approve" disabled={busy} onClick={() => setDialog({ title: "Resolve the incident", label: "How was it resolved?", required: true, confirmLabel: "Resolve", confirmClass: "btn-approve",
                                                    run: (note) => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "resolve", note }), "Incident resolved.") })}>Resolve</button>
                                            </div>
                                        )}
                                    </li>
                                ))}</ul>
                            </div>
                            <EventHistory electionId={electionId} />
                        </>
                    )}
                </div>
            </section>
            {dialog && <ReasonDialog title={dialog.title} label={dialog.label} required={dialog.required} confirmLabel={dialog.confirmLabel} confirmClass={dialog.confirmClass} busy={busy} error={error}
                onCancel={() => setDialog(null)} onConfirm={(v) => dialog.run(v).then((ok) => ok && setDialog(null))} />}
        </>
    );
}

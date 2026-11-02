import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import { STAGE_LABEL, apiMessage } from "../config/elections";

// Control room: every polling station in the signed-in official's jurisdiction, refreshed every
// 10 seconds, with alerts first, incidents to handle and sector officers' visits.

const ROLES = ["sector_officer", "ro", "aro", "deo", "deputy_deo", "ceo", "eci", "cec", "election_commissioner", "general_observer"];
const POLL = { not_started: ["Not started", "badge-warn"], mock_poll_done: ["Mock poll held", "badge-warn"], open: ["Open", "badge-ok"], closed: ["Closed", ""] };
const SEVERITY = { low: "", medium: "badge-progress", high: "badge-warn", critical: "badge-bad" };
const INCIDENT_STATUS = { reported: "Reported", acknowledged: "Being handled", resolved: "Resolved" };

export default function ControlRoom() {
    const { logged, userData } = useContext(AuthContext);
    const [data, setData] = useState(null);
    const [electionId, setElectionId] = useState("");
    const [filter, setFilter] = useState("all");
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
    useEffect(() => {
        if (!allowed) return undefined;
        load();
        const t = setInterval(load, 10000);
        return () => clearInterval(t);
    }, [allowed, load]);

    if (!logged) return <Navigate to="/signin" replace />;
    if (!allowed) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { await fn(); setNotice(ok); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const rows = (data?.stations ?? []).filter((r) => filter === "all" || (filter === "alerts" ? r.alerts.length > 0 : r.poll === filter));
    const sum = data?.summary;

    return (
        <>
            <PageHead title="Control room" crumbs={[{ label: "Control room" }]}
                lede={data ? `${data.election.name}, poll on ${data.election.pollDate} (${STAGE_LABEL[data.election.stage]}). Updated ${new Date(data.generatedAt).toLocaleTimeString()}, refreshes every 10 seconds.` : "Loading."} />
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
                            </div>
                            {!data.onPollDay && <div className="alert alert-warn">This election is not polling today, so the stations show no activity yet.</div>}

                            <div className="panel">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
                                    <h2 style={{ margin: 0 }}>Polling stations</h2>
                                    <div className="field" style={{ margin: 0 }}><label htmlFor="cr-filter">Show</label>
                                        <select id="cr-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
                                            <option value="all">All stations</option><option value="alerts">With alerts</option>
                                            <option value="open">Poll open</option><option value="not_started">Not started</option><option value="closed">Closed</option>
                                        </select></div>
                                </div>
                                <div className="table-wrap" style={{ marginTop: 12 }}><table>
                                    <thead><tr><th>Station</th><th>Poll</th><th>Turnout</th><th>Queue</th><th>Cases / incidents</th><th>Alerts</th>{data.can.visit && <th></th>}</tr></thead>
                                    <tbody>{rows.map((r) => (
                                        <tr key={r.stationId}>
                                            <td><strong>{r.name}</strong><br /><small>Part {r.partNumber}, {r.constituency}</small>{r.lastVisit && <><br /><small className="muted">Visited {new Date(r.lastVisit.at).toLocaleTimeString()}: {r.lastVisit.note}</small></>}</td>
                                            <td><span className={`badge ${POLL[r.poll][1]}`}>{POLL[r.poll][0]}</span></td>
                                            <td className="figure">{r.turnout.percent}%<br /><small>{r.turnout.voted} / {r.turnout.electors}</small></td>
                                            <td>{r.queue ? <>{r.queue.waiting}<br /><small>{new Date(r.queue.at).toLocaleTimeString()}</small></> : "–"}</td>
                                            <td>{r.openCases} / {r.openIncidents}</td>
                                            <td>{r.alerts.map((a) => <span key={a.code} className="badge badge-bad" style={{ display: "inline-block", margin: "0 4px 4px 0" }}>{a.text}</span>)}</td>
                                            {data.can.visit && <td><button className="btn btn-quiet btn-small" disabled={busy} onClick={() => setDialog({
                                                title: `Visit to ${r.name}`, label: "What did you find?", required: true, confirmLabel: "Record visit", confirmClass: "btn-approve",
                                                run: (note) => act(() => api.post(`/control-room/stations/${r.stationId}/visits`, { electionId: data.election._id, note }), "Visit recorded.")
                                            })}>Record visit</button></td>}
                                        </tr>
                                    ))}
                                    {rows.length === 0 && <tr><td colSpan={7}>No stations to show.</td></tr>}</tbody>
                                </table></div>
                            </div>

                            <div className="panel">
                                <h2>Incidents ({data.incidents.length})</h2>
                                {data.incidents.length === 0 && <p>No incidents reported.</p>}
                                <ul className="rows">{data.incidents.map((i) => (
                                    <li key={i._id} style={{ padding: "12px 0" }}>
                                        <span className={`badge ${SEVERITY[i.severity]}`}>{i.severity}</span> <strong>{data.incidentTypes[i.type]}</strong> at {i.stationName} (part {i.partNumber}, {i.constituency}) · <em>{INCIDENT_STATUS[i.status]}</em>
                                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{i.timeline.map((t, n) => <li key={n}><small>{new Date(t.at).toLocaleTimeString()} {t.action} by {t.by}{t.note ? `: ${t.note}` : ""}</small></li>)}</ul>
                                        {data.can.manage && i.status !== "resolved" && (
                                            <div style={{ marginTop: 6 }}>
                                                {i.status === "reported" && <button className="btn-approve" style={{ marginRight: 8 }} disabled={busy} onClick={() => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "acknowledge" }), "Incident acknowledged.")}>Acknowledge</button>}
                                                <button className="btn btn-quiet btn-small" style={{ marginRight: 8 }} disabled={busy} onClick={() => setDialog({ title: "Add an update", label: "Update", required: true, confirmLabel: "Add update", confirmClass: "btn-approve",
                                                    run: (note) => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "update", note }), "Update added.") })}>Add update</button>
                                                <button className="btn-approve" disabled={busy} onClick={() => setDialog({ title: "Resolve the incident", label: "How was it resolved?", required: true, confirmLabel: "Resolve", confirmClass: "btn-approve",
                                                    run: (note) => act(() => api.post(`/control-room/incidents/${i._id}`, { action: "resolve", note }), "Incident resolved.") })}>Resolve</button>
                                            </div>
                                        )}
                                    </li>
                                ))}</ul>
                            </div>
                        </>
                    )}
                </div>
            </section>
            {dialog && <ReasonDialog title={dialog.title} label={dialog.label} required={dialog.required} confirmLabel={dialog.confirmLabel} confirmClass={dialog.confirmClass} busy={busy} error={error}
                onCancel={() => setDialog(null)} onConfirm={(v) => dialog.run(v).then((ok) => ok && setDialog(null))} />}
        </>
    );
}

import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import useGeography from "../hooks/useGeography";
import { SCHEDULE_STEPS, STAGE_LABEL, TYPE_LABEL, apiMessage } from "../config/elections";

// ECI administrator: announce elections and revise their schedule (with a reason), and approve or
// reject polling stations and relocations proposed by District Election Officers.

const emptySchedule = Object.fromEntries(SCHEDULE_STEPS.map(([k]) => [k, ""]));

function ScheduleFields({ value, onChange, prefix }) {
    return (
        <div className="form-row" style={{ flexWrap: "wrap" }}>
            {SCHEDULE_STEPS.map(([k, label]) => (
                <div className="field" key={k}>
                    <label htmlFor={`${prefix}-${k}`}>{label}</label>
                    <input id={`${prefix}-${k}`} type="date" value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} required />
                </div>
            ))}
        </div>
    );
}

export default function EciElections() {
    const { logged, userData } = useContext(AuthContext);
    const { states } = useGeography();
    const [elections, setElections] = useState([]);
    const [pending, setPending] = useState([]);
    const [form, setForm] = useState({ name: "", type: "general_assembly", states: [], schedule: emptySchedule });
    const [revising, setRevising] = useState(null); // { id, schedule, reason }
    const [rejecting, setRejecting] = useState(null);
    const [refs, setRefs] = useState({});
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [e, s] = await Promise.all([api.get("/elections"), api.get("/polling-stations", { params: { pending: 1 } })]);
            setElections(e.data.data.items); setPending(s.data.data.items);
        } catch (err) { setError(apiMessage(err, "Could not load elections.")); }
    }, []);
    const isEci = logged && userData?.role === "eci";
    useEffect(() => { if (isEci) load(); }, [isEci, load]);

    if (!logged) return <Navigate to="/signin/eci" replace />;
    if (!isEci) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const res = await fn(); setNotice(ok(res)); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const create = (e) => {
        e.preventDefault();
        act(() => api.post("/elections", form), ({ data }) => `${data.data.name} announced.`).then((ok) => ok && setForm({ name: "", type: "general_assembly", states: [], schedule: emptySchedule }));
    };
    const revise = (e) => {
        e.preventDefault();
        act(() => api.post(`/elections/${revising.id}/schedule`, { schedule: revising.schedule, reason: revising.reason }), () => "Schedule revised. The previous schedule is kept in the history.")
            .then((ok) => ok && setRevising(null));
    };

    return (
        <>
            <PageHead title="Elections and polling stations" crumbs={[{ label: "ECI", to: "/eci/dashboard" }, { label: "Elections" }]}
                lede="Announce elections with their full schedule, and approve polling stations proposed by District Election Officers. Every change is recorded in the audit log." />
            <section className="section">
                <div className="container stack">
                    <p><Link to="/eci/dashboard">← Back to the ECI dashboard</Link></p>
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}

                    <div className="panel">
                        <h2>Polling stations awaiting approval ({pending.filter((s) => s.pendingChange.stage === "SENT_TO_ECI").length})</h2>
                        <p className="muted">Proposed by DEOs under section 25 of the Representation of the People Act, 1951, after consulting the parties, and forwarded by the CEO. Your prior approval needs the Commission's order reference; the DEO then publishes the station, and only then is it public. A relocation also moves every elector of that part. Clarifications are asked from <Link to="/desk?tab=stationsEci">your desk</Link>.</p>
                        {pending.length === 0 ? <p>Nothing is waiting.</p> : (
                            <div className="table-wrap"><table>
                                <thead><tr><th>Station</th><th>Change</th><th>Proposed by</th><th>Stage</th><th>Decision</th></tr></thead>
                                <tbody>{pending.map((s) => (
                                    <tr key={s._id}>
                                        <td><strong>{s.pendingChange.proposed.name}</strong><br /><small>{s.pendingChange.proposed.address}</small><br /><small className="muted">Part {s.partNumber}, {s.constituency}, {s.district}</small></td>
                                        <td>{s.pendingChange.type === "create" ? "New station" : <>Relocation from <em>{s.name}</em></>}{s.pendingChange.reason && <><br /><small>Reason: {s.pendingChange.reason}</small></>}</td>
                                        <td>{s.pendingChange.by}<br /><small>{new Date(s.pendingChange.at).toLocaleString()}</small></td>
                                        <td><small>{s.pendingChange.stageText ?? s.pendingChange.stage}</small>{s.pendingChange.eciApproval && <><br /><small>Order {s.pendingChange.eciApproval.reference}</small></>}</td>
                                        <td style={{ whiteSpace: "nowrap" }}>
                                            {s.pendingChange.stage === "SENT_TO_ECI" ? <>
                                                <input aria-label="Commission order reference" placeholder="Order reference" value={refs[s._id] ?? ""} onChange={(e) => setRefs({ ...refs, [s._id]: e.target.value })} style={{ width: 150, marginRight: 6 }} />
                                                <button className="btn-approve" disabled={busy || !(refs[s._id] ?? "").trim()} onClick={() => act(() => api.post(`/polling-stations/${s._id}/approve`, { eciReference: refs[s._id] }), ({ data }) => data.message)}>Approve</button>{" "}
                                                <button className="btn-reject" disabled={busy} onClick={() => setRejecting(s)}>Reject</button>
                                            </> : <small className="muted">Not with the Commission yet</small>}
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table></div>
                        )}
                    </div>

                    <div className="panel">
                        <h2>Elections</h2>
                        {elections.length === 0 && <p>No elections yet.</p>}
                        {elections.map((e) => (
                            <div key={e._id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
                                <h3 style={{ margin: 0 }}>{e.name} <span className="badge badge-progress">{STAGE_LABEL[e.stage]}</span></h3>
                                <p className="muted" style={{ margin: "4px 0" }}>{TYPE_LABEL[e.type]} · {e.states.join(", ")}</p>
                                <p style={{ margin: "4px 0" }}><small>{SCHEDULE_STEPS.map(([k, label]) => `${label}: ${e.schedule[k]}`).join(" · ")}</small></p>
                                {e.scheduleHistory?.length > 0 && <p className="muted" style={{ margin: "4px 0" }}><small>Revised {e.scheduleHistory.length} time(s); last reason: {e.scheduleHistory.at(-1).reason}</small></p>}
                                {revising?.id === e._id ? (
                                    <form className="portal-form" onSubmit={revise}>
                                        <ScheduleFields prefix={`rev-${e._id}`} value={revising.schedule} onChange={(schedule) => setRevising({ ...revising, schedule })} />
                                        <div className="field"><label htmlFor={`rev-reason-${e._id}`}>Reason for the revision *</label>
                                            <input id={`rev-reason-${e._id}`} value={revising.reason} onChange={(ev) => setRevising({ ...revising, reason: ev.target.value })} required maxLength={500} /></div>
                                        <button className="btn btn-primary" type="submit" disabled={busy}>Save revised schedule</button>{" "}
                                        <button className="btn btn-quiet" type="button" onClick={() => setRevising(null)}>Cancel</button>
                                    </form>
                                ) : <button className="btn btn-quiet btn-small" onClick={() => setRevising({ id: e._id, schedule: { ...e.schedule }, reason: "" })}>Revise schedule</button>}
                            </div>
                        ))}
                    </div>

                    <form className="panel portal-form" onSubmit={create}>
                        <h2>Announce an election</h2>
                        <div className="form-row">
                            <div className="field"><label htmlFor="el-name">Name</label><input id="el-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} /></div>
                            <div className="field"><label htmlFor="el-type">Type</label>
                                <select id="el-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select></div>
                        </div>
                        <div className="field"><label htmlFor="el-states">States and Union Territories (hold Ctrl or ⌘ to choose several)</label>
                            <select id="el-states" multiple size={6} value={form.states} onChange={(e) => setForm({ ...form, states: [...e.target.selectedOptions].map((o) => o.value) })} required>
                                {states.map((s) => <option key={s.name}>{s.name}</option>)}
                            </select></div>
                        <ScheduleFields prefix="new" value={form.schedule} onChange={(schedule) => setForm({ ...form, schedule })} />
                        <p className="muted"><small>Each date must come after the one before it.</small></p>
                        <button className="btn btn-primary" type="submit" disabled={busy}>Announce election</button>
                    </form>
                </div>
            </section>
            {rejecting && (
                <ReasonDialog title={`Reject the change to ${rejecting.pendingChange.proposed.name}`} label="Reason" required confirmLabel="Reject" busy={busy} error={error}
                    onCancel={() => setRejecting(null)}
                    onConfirm={(reason) => act(() => api.post(`/polling-stations/${rejecting._id}/reject`, { reason }), () => "Change rejected.").then((ok) => ok && setRejecting(null))} />
            )}
        </>
    );
}

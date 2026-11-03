import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import useGeography from "../hooks/useGeography";

// ECI administrator: approved data sources for the new-voter pipeline, imports and rescreening.
// Only an officially documented API or a government-approved export, with a recorded legal basis
// and agreement, may carry real personal data. This prototype runs on synthetic records.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const TYPE_LABEL = { synthetic: "Synthetic (invented people)", approved_api: "Approved government API", approved_export: "Approved government export" };
const SAMPLE = JSON.stringify([
    { sourceReference: "SYN-1001", name: "Example Person", dateOfBirth: "2008-03-15", gender: "Female", state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South", partNumber: "18" }
], null, 2);

/** Recomputes every audit event's hash on the server and shows whether the trail is intact. */
function AuditIntegrity() {
    const [r, setR] = useState(null);
    const [error, setError] = useState("");
    const check = async () => { setError(""); try { setR((await api.get("/audit/integrity")).data.data); } catch (err) { setError(apiMessage(err, "Could not check the audit trail.")); } };
    return (
        <div className="panel">
            <h2>Audit trail integrity</h2>
            <p className="muted">Every audit event carries a hash of its content. This check recomputes all of them, compares the event count, and, when MongoDB is connected, replays the hash chain anchored there (a rewrite that kept each event's own hash consistent still breaks the chain).</p>
            <button className="secondary-btn" onClick={check}>Check the audit trail</button>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {r && (
                <div className={`alert ${r.ok ? "alert-ok" : "alert-error"}`} role="status" style={{ marginTop: 12 }}>
                    <strong>{r.ok ? "Intact" : "Problem found"}</strong>
                    {r.checked} events checked{r.unhashed ? `, ${r.unhashed} written before hashing` : ""}. {r.altered.length} altered, {r.missing.length} missing, count {r.countMatches ? "matches" : "does not match"}.
                    <br />{r.chain?.checked
                        ? (r.chain.ok ? `Hash chain in MongoDB: intact (${r.chain.entries} entries, ${r.chain.checkpoints} checkpoints).`
                            : `Hash chain in MongoDB: broken${r.chain.firstBreak ? ` at entry ${r.chain.firstBreak.seq}` : ""}${r.chain.truncated ? "; entries were removed from the end" : ""}.`)
                        : `Hash chain: not checked. ${r.chain?.reason ?? ""}`}
                </div>
            )}
        </div>
    );
}

/** Search the audit trail by action, official and time. */
export function AuditSearch() {
    const [q, setQ] = useState({ action: "", actor: "", from: "", to: "" });
    const [r, setR] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const search = async (e, before) => {
        e?.preventDefault();
        setBusy(true); setError("");
        try {
            const params = Object.fromEntries(Object.entries({ ...q, actor: q.actor.trim().toUpperCase(), from: q.from && new Date(q.from).toISOString(), to: q.to && new Date(q.to).toISOString(), before }).filter(([, v]) => v));
            const data = (await api.get("/audit/search", { params })).data.data;
            setR((old) => before && old ? { ...data, items: [...old.items, ...data.items] } : data);
        } catch (err) { setError(apiMessage(err, "The search failed.")); }
        finally { setBusy(false); }
    };
    const set = (k) => (e) => setQ((v) => ({ ...v, [k]: e.target.value }));
    return (
        <div className="panel">
            <h2>Search the audit trail</h2>
            <form className="row-actions" style={{ flexWrap: "wrap", gap: 8 }} onSubmit={search}>
                <input aria-label="Action starts with" placeholder="Action, e.g. objection. or station.approved" value={q.action} onChange={set("action")} maxLength={60} />
                <input aria-label="Official's EPIC" placeholder="Official's EPIC" value={q.actor} onChange={set("actor")} maxLength={10} />
                <label>From <input type="datetime-local" value={q.from} onChange={set("from")} /></label>
                <label>To <input type="datetime-local" value={q.to} onChange={set("to")} /></label>
                <button className="secondary-btn" type="submit" disabled={busy}>Search</button>
            </form>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {r && (
                <>
                    <p className="muted"><small>{r.items.length} result{r.items.length === 1 ? "" : "s"} · answered from {r.source === "mongodb" ? "the MongoDB archive" : "the latest Redis entries (MongoDB not connected)"}</small></p>
                    <ul className="rows">{r.items.map((e) => (
                        <li key={e._id}><strong>{e.action}</strong> · {e.actor ? `${e.actor.epic} (${e.actor.role})` : "system"} · {new Date(e.at).toLocaleString()} · {e.resource?.type} {e.resource?.id}{e.note ? ` · “${e.note}”` : ""}</li>
                    ))}</ul>
                    {r.next && <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => search(null, r.next)}>Show older</button>}
                </>
            )}
        </div>
    );
}

/**
 * Result sources: a mock source (demonstration counts, labelled as mock everywhere) or an official
 * feed with its legal basis and agreement. Entries from a real feed arrive server-to-server; this
 * panel registers sources, generates mock counts and moves a constituency's publication status.
 */
function ResultSources() {
    const { states, districtsOf, constituenciesOf } = useGeography();
    const [sources, setSources] = useState([]);
    const [elections, setElections] = useState([]);
    const [form, setForm] = useState({ name: "", type: "mock", legalBasis: "", agreementReference: "" });
    const [target, setTarget] = useState({ sourceId: "", electionId: "", state: "", district: "", constituency: "", status: "completed", winnerSerial: "" });
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const [s, e] = await Promise.all([api.get("/results/sources"), api.get("/public/elections")]);
            setSources(s.data.data.items); setElections(e.data.data.items ?? e.data.data);
        } catch (err) { setError(apiMessage(err, "Could not load result sources.")); }
    }, []);
    useEffect(() => { load(); }, [load]);
    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const r = await fn(); setNotice(ok(r)); await load(); } catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); } finally { setBusy(false); }
    };
    const area = { electionId: target.electionId, state: target.state, district: target.district || undefined, constituency: target.constituency };
    const setT = (k) => (e) => setTarget((t) => ({ ...t, [k]: e.target.value, ...(k === "state" ? { district: "", constituency: "" } : {}), ...(k === "district" ? { constituency: "" } : {}) }));
    const ready = target.sourceId && target.electionId && target.state && target.constituency;
    return (
        <div className="panel">
            <h2>Result sources</h2>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-ok" role="status">{notice}</div>}
            <ul className="rows">{sources.map((s) => <li key={s._id}><strong>{s.name}</strong> · {s.type === "mock" ? "Mock (demonstration only)" : "Official feed"} · {s.status}{s.agreementReference ? ` · Agreement ${s.agreementReference}` : ""}</li>)}
                {sources.length === 0 && <li className="muted">None registered.</li>}</ul>
            <form className="stack" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); act(() => api.post("/results/sources", form), () => "Result source registered."); }}>
                <h3>Register a result source</h3>
                <label>Name <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={3} maxLength={120} /></label>
                <label>Type <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="mock">Mock (demonstration)</option><option value="official_feed">Official feed</option></select></label>
                {form.type === "official_feed" && <>
                    <label>Legal basis <input value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })} required /></label>
                    <label>Agreement reference <input value={form.agreementReference} onChange={(e) => setForm({ ...form, agreementReference: e.target.value })} required /></label>
                </>}
                <button className="primary-btn" disabled={busy}>Register source</button>
            </form>
            <div className="stack" style={{ marginTop: 16 }}>
                <h3>Counts for a constituency</h3>
                <div className="form-row" style={{ flexWrap: "wrap", gap: 8, display: "flex" }}>
                    <label>Source <select value={target.sourceId} onChange={setT("sourceId")}><option value="">Choose…</option>{sources.filter((s) => s.status === "active").map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
                    <label>Election <select value={target.electionId} onChange={setT("electionId")}><option value="">Choose…</option>{elections.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}</select></label>
                    <label>State <select value={target.state} onChange={setT("state")}><option value="">Choose…</option>{states.map((x) => <option key={x.name}>{x.name}</option>)}</select></label>
                    <label>District <select value={target.district} onChange={setT("district")}><option value="">Choose…</option>{districtsOf(target.state).map((d) => <option key={d.name}>{d.name}</option>)}</select></label>
                    <label>Constituency <select value={target.constituency} onChange={setT("constituency")}><option value="">Choose…</option>{constituenciesOf(target.state, target.district).map((c) => <option key={c}>{c}</option>)}</select></label>
                </div>
                <div className="row-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                    <button className="secondary-btn" disabled={busy || !ready} onClick={() => act(() => api.post(`/results/sources/${target.sourceId}/mock`, { ...area, rounds: 6 }), (r) => `Generated ${r.data.data.entries} mock rounds (${r.data.data.label}).`)}>Generate mock count</button>
                    <label>Publication <select value={target.status} onChange={setT("status")}><option value="completed">Counting completed</option><option value="declared">Result declared</option></select></label>
                    {target.status === "declared" && <label>Winner's serial number <input value={target.winnerSerial} onChange={setT("winnerSerial")} inputMode="numeric" size={4} required /></label>}
                    <button className="secondary-btn" disabled={busy || !ready || (target.status === "declared" && !target.winnerSerial)}
                        onClick={() => act(() => api.post(`/results/sources/${target.sourceId}/publication`, { ...area, status: target.status, ...(target.status === "declared" ? { winnerSerial: Number(target.winnerSerial) } : {}) }), () => "Publication status updated.")}>Set publication status</button>
                </div>
                <p className="muted"><small>A mock count needs a constituency whose list of contesting candidates has been published and that has no results yet. Round-by-round entries from an official feed are sent by the feed itself to <code>POST /results/sources/:id/entries</code>; no one types vote figures into ECIWEB.</small></p>
            </div>
        </div>
    );
}

/** The latest audit events (newest first), before any search. */
function RecentAudit() {
    const [items, setItems] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => { api.get("/audit", { params: { limit: 15 } }).then((r) => setItems(r.data.data.items)).catch((err) => setError(apiMessage(err, "Could not load recent audit events."))); }, []);
    return (
        <div className="panel">
            <h2>Latest audit events</h2>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <ul className="rows">{(items ?? []).map((e) => <li key={e._id}><small>{new Date(e.at).toLocaleString()} · <strong>{e.action}</strong> · {e.actor ? `${e.actor.epic} (${e.actor.role})` : "system"}{e.note ? ` · “${e.note}”` : ""}</small></li>)}</ul>
        </div>
    );
}

export default function EciIntegrations() {
    const { logged, userData } = useContext(AuthContext);
    const [sources, setSources] = useState([]);
    const [runs, setRuns] = useState([]);
    const [form, setForm] = useState({ name: "", type: "synthetic", purpose: "", legalBasis: "", agreementReference: "" });
    const [importSource, setImportSource] = useState("");
    const [suspending, setSuspending] = useState(null); // { id, name, reason }
    const [records, setRecords] = useState(SAMPLE);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [s, r] = await Promise.all([api.get("/integrations/sources"), api.get("/integrations/runs")]);
            setSources(s.data.data.items); setRuns(r.data.data.items);
        } catch (err) { setError(apiMessage(err, "Could not load data sources.")); }
    }, []);
    useEffect(() => { if (logged && userData?.role === "eci") load(); }, [logged, userData, load]);

    if (!logged) return <Navigate to="/signin/eci" replace />;
    if (userData?.role !== "eci") return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const res = await fn(); setNotice(ok(res)); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const register = (e) => { e.preventDefault(); act(() => api.post("/integrations/sources", form), () => "Data source registered."); };
    const runImport = (e) => {
        e.preventDefault();
        let parsed;
        try { parsed = JSON.parse(records); } catch { setError("The records are not valid JSON."); return; }
        act(() => api.post(`/integrations/sources/${importSource}/runs`, { records: parsed }), ({ data }) => {
            const c = data.data.counts;
            return `Import finished: ${c.staged} staged, ${c.tasksCreated} BLO tasks (${c.unassigned} unassigned), ${c.notYetEligible} not yet eligible, ${c.duplicates} duplicates, ${c.alreadyEnrolled} already enrolled, ${c.alreadyApplied} already applied, ${c.rejected} rejected.`;
        });
    };
    const rescreen = () => act(() => api.post("/integrations/rescreen"), ({ data }) => `Rescreened ${data.data.checked} people: ${data.data.tasksCreated} new BLO tasks.`);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const active = sources.filter((s) => s.status === "active");

    return (
        <>
            <PageHead title="Data sources and new voters" lede="Approved sources that identify people reaching a qualifying date, so their BLO can help them apply. Nobody is enrolled automatically." crumbs={[{ label: "ECI", to: "/eci/dashboard" }]} />
            <section className="section">
                <div className="container stack">
                    <div className="alert alert-warn">
                        <strong>Only lawful sources.</strong> Use an officially documented API or a government-approved export with a data-sharing agreement. Public websites, scraped pages and databases that merely happen to be reachable are not data sources. This prototype uses synthetic people.
                    </div>
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}

                    <div className="panel">
                        <h2>Registered sources</h2>
                        <ul className="rows">
                            {sources.map((s) => (
                                <li key={s._id}><strong>{s.name}</strong> · {TYPE_LABEL[s.type]} · {s.status}
                                    {s.status === "active" && <> <button className="btn btn-quiet btn-small" onClick={() => setSuspending({ id: s._id, name: s.name, reason: "" })}>Suspend</button></>}
                                    <br /><small>{s.purpose}{s.agreementReference ? ` · Agreement ${s.agreementReference}` : ""}{s.suspendReason ? ` · Suspended: ${s.suspendReason}` : ""}</small></li>
                            ))}
                            {sources.length === 0 && <li className="muted">None yet.</li>}
                        </ul>
                        {suspending && (
                            <form className="stack" onSubmit={(e) => { e.preventDefault(); act(() => api.post(`/integrations/sources/${suspending.id}/suspend`, { reason: suspending.reason }), () => `${suspending.name} suspended. No more imports are accepted from it.`).then((done) => done && setSuspending(null)); }}>
                                <label>Why is {suspending.name} being suspended? <input value={suspending.reason} onChange={(e) => setSuspending({ ...suspending, reason: e.target.value })} required maxLength={500} /></label>
                                <div><button className="btn-reject" type="submit" disabled={busy}>Suspend source</button>{" "}<button className="btn btn-quiet" type="button" onClick={() => setSuspending(null)}>Cancel</button></div>
                            </form>
                        )}
                        <form onSubmit={register} className="stack" style={{ marginTop: 12 }}>
                            <h3>Register a source</h3>
                            <label>Name <input value={form.name} onChange={set("name")} required /></label>
                            <label>Type
                                <select value={form.type} onChange={set("type")}>{Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                            </label>
                            <label>Permitted purpose <input value={form.purpose} onChange={set("purpose")} required /></label>
                            {form.type !== "synthetic" && <>
                                <label>Legal basis <input value={form.legalBasis} onChange={set("legalBasis")} required /></label>
                                <label>Data-sharing agreement reference <input value={form.agreementReference} onChange={set("agreementReference")} required /></label>
                            </>}
                            <button className="primary-btn" disabled={busy}>Register source</button>
                        </form>
                    </div>

                    <div className="panel">
                        <h2>Import records</h2>
                        <p className="muted">A JSON array. Only these fields are kept: sourceReference, name, dateOfBirth, gender, state, district, constituency, partNumber, pollingStation, address. Anything else is dropped.</p>
                        <form onSubmit={runImport} className="stack">
                            <label>Source
                                <select value={importSource} onChange={(e) => setImportSource(e.target.value)} required>
                                    <option value="">Choose…</option>
                                    {active.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                                </select>
                            </label>
                            <label>Records <textarea rows={8} value={records} onChange={(e) => setRecords(e.target.value)} style={{ fontFamily: "monospace" }} /></label>
                            <button className="primary-btn" disabled={busy || !importSource}>Run import</button>
                        </form>
                        <button className="secondary-btn" style={{ marginTop: 12 }} onClick={rescreen} disabled={busy}>Rescreen staged people for new qualifying dates</button>
                    </div>

                    <div className="panel">
                        <h2>Import history</h2>
                        <ul className="rows">
                            {runs.map((r) => (
                                <li key={r._id}><small>{new Date(r.startedAt).toLocaleString()} · {r.sourceName} · by {r.by} · received {r.counts.received}, staged {r.counts.staged}, tasks {r.counts.tasksCreated}, rejected {r.counts.rejected}
                                    {r.rejections?.length > 0 && ` (${r.rejections.slice(0, 3).map((x) => `#${x.index}: ${x.reason}`).join("; ")})`}</small></li>
                            ))}
                            {runs.length === 0 && <li className="muted">No imports yet.</li>}
                        </ul>
                    </div>
                    <ResultSources />
                    <AuditIntegrity />
                    <RecentAudit />
                    <AuditSearch />
                    <p><Link to="/eci/dashboard">← Back to the ECI dashboard</Link></p>
                </div>
            </section>
        </>
    );
}

import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";

// ECI administrator: approved data sources for the new-voter pipeline, imports and rescreening.
// Only an officially documented API or a government-approved export, with a recorded legal basis
// and agreement, may carry real personal data. This prototype runs on synthetic records.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const TYPE_LABEL = { synthetic: "Synthetic (invented people)", approved_api: "Approved government API", approved_export: "Approved government export" };
const SAMPLE = JSON.stringify([
    { sourceReference: "SYN-1001", name: "Example Person", dateOfBirth: "2008-03-15", gender: "Female", state: "Punjab", district: "Ludhiana", constituency: "Ludhiana South", partNumber: "18" }
], null, 2);

export default function EciIntegrations() {
    const { logged, userData } = useContext(AuthContext);
    const [sources, setSources] = useState([]);
    const [runs, setRuns] = useState([]);
    const [form, setForm] = useState({ name: "", type: "synthetic", purpose: "", legalBasis: "", agreementReference: "" });
    const [importSource, setImportSource] = useState("");
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
        try { const res = await fn(); setNotice(ok(res)); await load(); }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); }
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
                                <li key={s._id}><strong>{s.name}</strong> · {TYPE_LABEL[s.type]} · {s.status}<br /><small>{s.purpose}{s.agreementReference ? ` · Agreement ${s.agreementReference}` : ""}</small></li>
                            ))}
                            {sources.length === 0 && <li className="muted">None yet.</li>}
                        </ul>
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
                    <p><Link to="/eci/dashboard">← Back to the ECI dashboard</Link></p>
                </div>
            </section>
        </>
    );
}

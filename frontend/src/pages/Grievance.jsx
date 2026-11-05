import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import "../styles/desk.css";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import { apiMessage } from "../config/elections";
import useGeography from "../hooks/useGeography";

// National Grievance Services Portal: file a grievance about election administration, track it
// with the reference and mobile number, and reopen it once if the response does not settle it.

const toDataUrl = (file) => new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) return reject(new Error(`${file.name} is over 2 MB.`));
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("The file could not be read.")); r.readAsDataURL(file);
});

function Status({ g, onReopen }) {
    const [reason, setReason] = useState("");
    return (
        <div className="panel" role="status">
            <h2 style={{ marginTop: 0 }}>{g.referenceId}: {g.statusText}</h2>
            <p>{g.categoryText} · {g.subject} · sent to the {g.routedTo} · filed {new Date(g.filedAt).toLocaleString("en-IN")}</p>
            {g.response ? <p><strong>Response</strong> (after {g.responseMinutes >= 120 ? `${Math.round(g.responseMinutes / 60)} hours` : `${g.responseMinutes} minutes`}): {g.response.text}</p> : <p className="muted">No response yet.</p>}
            {g.cvigilHint && <div className="alert alert-warn">{g.cvigilHint} <Link to="/report-violation">Report on cVIGIL</Link></div>}
            <ol className="muted">{g.timeline.map((t, i) => <li key={i}>{t.step.replace(/_/g, " ")} · {new Date(t.at).toLocaleString("en-IN")}</li>)}</ol>
            {g.canReopen && onReopen && (
                <form className="portal-form" onSubmit={(e) => { e.preventDefault(); onReopen(reason); }}>
                    <div className="field"><label htmlFor="gr-re">Not satisfied? Reopen it once, within 7 days, with your reasons</label><textarea id="gr-re" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required /></div>
                    <button className="btn btn-primary">Reopen</button>
                </form>
            )}
        </div>
    );
}

export default function Grievance() {
    const { states, districtsOf, constituenciesOf } = useGeography();
    const [tab, setTab] = useState("file");
    const [lists, setLists] = useState(null);
    const [f, setF] = useState({ category: "electoral_registration", stakeholder: "elector", subject: "", description: "", name: "", mobile: "", email: "", state: "", district: "", constituency: "" });
    const [files, setFiles] = useState([]);
    const [track, setTrack] = useState({ ref: "", mobile: "" });
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => { api.get("/grievances/lists").then((r) => setLists(r.data.data)).catch(() => {}); }, []);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === "state" ? { district: "", constituency: "" } : k === "district" ? { constituency: "" } : {}) });
    const go = async (fn) => { setBusy(true); setError(""); try { setResult((await fn()).data.data); } catch (e) { setError(e.message && !e.response ? e.message : apiMessage(e, "That did not work.")); } finally { setBusy(false); } };
    return (
        <>
            <PageHead title="Grievances about election services" crumbs={[{ label: "Voters" }, { label: "Grievance" }]}
                lede="Tell the election office about a problem with registration, your EPIC, a polling station, EVMs, expenditure or any other election service. You get a reference number and an SMS; the response and the time taken are shown here. For a Model Code of Conduct violation happening now, use cVIGIL instead." />
            <section className="section">
                <div className="container">
                    <Tabs label="Grievances" active={tab} onChange={(t) => { setTab(t); setResult(null); setError(""); }} tabs={[{ id: "file", label: "File a grievance" }, { id: "track", label: "Track a grievance" }]} />
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {tab === "file" && !result && lists && (
                        <form className="panel portal-form" style={{ maxWidth: 780 }} onSubmit={(e) => { e.preventDefault(); go(async () => api.post("/grievances", { ...f, documents: await Promise.all(files.map(toDataUrl)) })); }}>
                            <div className="form-row">
                                <div className="field"><label htmlFor="g-cat">What it is about</label><select id="g-cat" value={f.category} onChange={set("category")}>{Object.entries(lists.categories).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                                <div className="field"><label htmlFor="g-who">You are</label><select id="g-who" value={f.stakeholder} onChange={set("stakeholder")}>{Object.entries(lists.stakeholders).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                            </div>
                            <div className="field"><label htmlFor="g-sub">Subject</label><input id="g-sub" value={f.subject} onChange={set("subject")} required minLength={5} maxLength={150} /></div>
                            <div className="field"><label htmlFor="g-d">Describe the problem</label><textarea id="g-d" rows={5} value={f.description} onChange={set("description")} required minLength={20} /></div>
                            <div className="form-row">
                                <div className="field"><label htmlFor="g-st">State/UT (optional)</label><select id="g-st" value={f.state} onChange={set("state")}><option value="">Not specific to a State</option>{states.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
                                <div className="field"><label htmlFor="g-di">District (optional)</label><select id="g-di" value={f.district} onChange={set("district")} disabled={!f.state}><option value="">—</option>{districtsOf(f.state).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select></div>
                                <div className="field"><label htmlFor="g-ac">Constituency (optional)</label><select id="g-ac" value={f.constituency} onChange={set("constituency")} disabled={!f.district}><option value="">—</option>{constituenciesOf(f.state, f.district).map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                            </div>
                            <div className="form-row">
                                <div className="field"><label htmlFor="g-n">Your name (optional)</label><input id="g-n" value={f.name} onChange={set("name")} /></div>
                                <div className="field"><label htmlFor="g-m">Mobile number</label><input id="g-m" inputMode="numeric" maxLength={10} value={f.mobile} onChange={set("mobile")} required pattern="[6-9][0-9]{9}" /></div>
                                <div className="field"><label htmlFor="g-e">Email (optional)</label><input id="g-e" type="email" value={f.email} onChange={set("email")} /></div>
                            </div>
                            <div className="field"><label htmlFor="g-f">Documents (up to two; images or PDF, 2 MB each)</label><input id="g-f" type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles([...e.target.files].slice(0, 2))} /></div>
                            <button className="btn btn-primary" disabled={busy}>File grievance</button>
                        </form>
                    )}
                    {tab === "track" && !result && (
                        <form className="panel portal-form" style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); go(() => api.get(`/grievances/track/${encodeURIComponent(track.ref.trim())}`, { params: { mobile: track.mobile } })); }}>
                            <div className="form-row">
                                <div className="field"><label htmlFor="gt-r">Reference</label><input id="gt-r" value={track.ref} onChange={(e) => setTrack({ ...track, ref: e.target.value.toUpperCase() })} required placeholder="GRV-…" /></div>
                                <div className="field"><label htmlFor="gt-m">Mobile number</label><input id="gt-m" inputMode="numeric" maxLength={10} value={track.mobile} onChange={(e) => setTrack({ ...track, mobile: e.target.value })} required /></div>
                            </div>
                            <button className="btn btn-primary" disabled={busy}>Show status</button>
                        </form>
                    )}
                    {result && <><Status g={result} onReopen={tab === "track" ? (reason) => go(() => api.post(`/grievances/track/${result.referenceId}/reopen`, { mobile: track.mobile, reason })) : null} />
                        <button className="btn btn-quiet" style={{ marginTop: 10 }} onClick={() => setResult(null)}>Back</button></>}
                </div>
            </section>
        </>
    );
}

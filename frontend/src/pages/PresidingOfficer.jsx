import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import { apiMessage } from "../config/elections";

// Presiding officer assistant: readiness, equipment and closing checklists, the polling party
// and a searchable procedure library. The library explains; it never decides. Every entry shows
// its source and the library version, and is marked unreviewed until an authorised official has
// checked it against the Commission's current handbook.

export default function PresidingOfficer() {
    const { logged, userData } = useContext(AuthContext);
    const [data, setData] = useState(null);
    const [lib, setLib] = useState(null);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(null);
    const [error, setError] = useState("");
    const allowed = logged && ["presiding_officer", "admin"].includes(userData?.role);

    const load = useCallback(async () => {
        try { setData((await api.get("/poll-day/assistant")).data.data); setError(""); }
        catch (err) { setError(apiMessage(err, "Could not load the assistant.")); }
    }, []);
    const search = useCallback(async (text) => {
        try { setLib((await api.get("/poll-day/procedures", { params: text ? { q: text } : {} })).data.data); } catch { /* shown by load */ }
    }, []);
    useEffect(() => { if (allowed) { load(); search(""); } }, [allowed, load, search]);

    if (!logged) return <Navigate to="/signin" replace />;
    if (!allowed) return <Navigate to="/home" replace />;

    const tick = async (kind, item, done) => {
        try { await api.post(`/poll-day/checklists/${kind}`, { item: item.id, done }); await load(); }
        catch (err) { setError(apiMessage(err, "Could not save the checklist.")); }
    };
    const showRef = (id) => { const p = lib?.items.find((x) => x.id === id); if (p) setOpen(p.id); else { setQ(""); search("").then(() => setOpen(id)); } document.getElementById("po-library")?.scrollIntoView({ behavior: "smooth" }); };

    return (
        <>
            <PageHead title="Presiding officer assistant" crumbs={[{ label: "Poll day", to: "/poll-day" }, { label: "Presiding officer" }]}
                lede="Checklists for your station and quick reference to the procedure. You decide every case; this page only helps you find the rule." />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    <p><Link to="/poll-day">Back to the poll-day screen</Link> for marking, exceptions, incidents and escalation.</p>
                    {data && (
                        <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                            {Object.entries(data.checklists).map(([kind, list]) => {
                                const done = list.items.filter((i) => i.done).length;
                                return (
                                    <div className="panel" key={kind}>
                                        <h2 style={{ marginTop: 0 }}>{list.title} <small className="muted">{done}/{list.items.length}</small></h2>
                                        <ul style={{ listStyle: "none", padding: 0 }}>{list.items.map((i) => (
                                            <li key={i.id} style={{ marginBottom: 8 }}>
                                                <label className="check"><input type="checkbox" checked={Boolean(i.done)} onChange={(e) => tick(kind, i, e.target.checked)} /> {i.text}</label>
                                                {i.done && <small className="muted" style={{ display: "block", marginLeft: 26 }}>{new Date(i.done.at).toLocaleTimeString()} by {i.done.by}</small>}
                                                {i.ref && <button className="btn btn-quiet btn-small" style={{ marginLeft: 26 }} onClick={() => showRef(i.ref)}>How to</button>}
                                            </li>
                                        ))}</ul>
                                    </div>
                                );
                            })}
                            <div className="panel">
                                <h2 style={{ marginTop: 0 }}>Polling party and others at this station</h2>
                                {data.party.length === 0 ? <p>No assignments found.</p> : <ul className="rows">{data.party.map((p, n) => (
                                    <li key={n}><strong>{p.roleLabel}</strong>: {p.name ?? p.epic ?? "–"}{p.candidateName ? <small className="muted"> (for {p.candidateName})</small> : null}</li>
                                ))}</ul>}
                            </div>
                        </div>
                    )}

                    <div className="panel" id="po-library">
                        <h2 style={{ marginTop: 0 }}>Procedure library</h2>
                        {lib && <div className="alert alert-warn" role="note">{lib.notice} Library version {lib.version}.</div>}
                        <form className="portal-form" onSubmit={(e) => { e.preventDefault(); search(q); }} style={{ display: "flex", gap: 8, alignItems: "end" }}>
                            <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="po-q">Search (for example: challenge, companion, VVPAT, closing)</label>
                                <input id="po-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                            <button className="btn btn-quiet">Search</button>
                        </form>
                        {lib && lib.items.length === 0 && <p>Nothing found. Ask your sector officer or the Returning Officer.</p>}
                        <ul className="rows">{(lib?.items ?? []).map((p) => (
                            <li key={p.id} style={{ padding: "10px 0" }}>
                                <button className="btn btn-quiet btn-small" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "−" : "+"}</button> <strong>{p.title}</strong>
                                {open === p.id && (
                                    <div style={{ marginTop: 6 }}>
                                        <ol>{p.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
                                        <p style={{ margin: 0 }}><small><strong>Source:</strong> {p.sources.map((s) => `${lib.sources[s.source]?.title}, ${s.ref}`).join("; ")}.</small></p>
                                        <p style={{ margin: 0 }}><small className="muted">Version {p.version} · {p.reviewStatus === "unreviewed" ? "Not yet checked against the current official handbook" : `Reviewed`}</small></p>
                                    </div>
                                )}
                            </li>
                        ))}</ul>
                    </div>
                </div>
            </section>
        </>
    );
}

import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import { apiMessage } from "../config/elections";
import "../styles/desk.css";

// Presiding officer assistant, in the order of the day: before the poll, mock poll, the poll,
// closing and after the poll. Each phase has its checklist and the step that moves the poll on.
// The procedure library explains; it never decides. Every entry shows its source and version, and
// is marked unreviewed until an authorised official has checked it against the current handbook.

const PHASES = [
    { id: "before", label: "Before the poll", lists: ["arrival", "equipment", "readiness"], refs: [] },
    { id: "mock", label: "Mock poll", lists: [], refs: ["mock-poll"], step: { to: "mock_poll_done", from: "not_started", text: "Record that the mock poll is done and its data cleared" } },
    { id: "poll", label: "Poll", lists: [], refs: ["identify-elector", "indelible-ink", "challenged-vote", "tendered-vote", "companion", "vvpat-complaint", "adjournment", "secrecy"], step: { to: "open", from: "mock_poll_done", text: "Start the poll" } },
    { id: "closing", label: "Closing", lists: ["closing"], refs: ["close-poll"], step: { to: "closed", from: "open", text: "Close the poll" } },
    { id: "after", label: "After the poll", lists: ["post_poll"], refs: [] },
];
const STATUS_TEXT = { not_started: "Not started", mock_poll_done: "Mock poll done", open: "Poll open", closed: "Poll closed" };
const RANK = { not_started: 0, mock_poll_done: 1, open: 2, closed: 3 };
const PHASE_OF = { not_started: "before", mock_poll_done: "poll", open: "poll", closed: "after" };

export default function PresidingOfficer() {
    const { logged, userData } = useContext(AuthContext);
    const [data, setData] = useState(null);
    const [lib, setLib] = useState(null);
    const [phase, setPhase] = useState(null);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const allowed = logged && ["presiding_officer", "admin"].includes(userData?.role);

    const load = useCallback(async () => {
        try { const d = (await api.get("/poll-day/assistant")).data.data; setData(d); setPhase((p) => p ?? PHASE_OF[d.poll?.status] ?? "before"); setError(""); }
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
    const advance = async (status) => {
        setBusy(true);
        try { await api.post("/poll-day/poll/status", { status }); await load(); }
        catch (err) { setError(apiMessage(err, "The poll status could not be changed.")); }
        finally { setBusy(false); }
    };
    const showRef = (id) => { setQ(""); search("").then(() => setOpen(id)); document.getElementById("po-library")?.scrollIntoView({ behavior: "smooth" }); };

    const status = data?.poll?.status ?? "not_started";
    const current = PHASES.find((p) => p.id === phase) ?? PHASES[0];
    const listDone = (kind) => { const l = data?.checklists[kind]; return l ? l.items.filter((i) => i.done).length === l.items.length : true; };
    const phaseDone = (p) => p.lists.every(listDone) && (!p.step || RANK[status] >= RANK[p.step.to]);
    const titleOf = (id) => lib?.items.find((x) => x.id === id)?.title ?? id.replace(/-/g, " ");
    const changedAt = (s) => data?.poll?.history?.find((h) => h.status === s)?.at;

    return (
        <>
            <PageHead title="Presiding officer assistant" crumbs={[{ label: "Poll day", to: "/poll-day" }, { label: "Presiding officer" }]}
                lede="Your day, step by step. You decide every case; this page keeps your checklists and helps you find the rule." />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {data && (
                        <>
                            <div className="panel" style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <strong>{data.station?.name}</strong>{data.station?.partNumber ? ` · part ${data.station.partNumber}` : ""}{data.station?.constituency ? ` · ${data.station.constituency}` : ""}
                                    <div className="muted" style={{ fontSize: ".9rem" }}>{data.poll?.election}{data.poll?.pollDate ? ` · poll on ${data.poll.pollDate}` : ""}</div>
                                </div>
                                <span className={`badge ${status === "open" ? "badge-verified" : status === "closed" ? "badge-review" : "badge-progress"}`}>{STATUS_TEXT[status]}</span>
                            </div>

                            <Tabs label="Phases of the day" active={phase} onChange={setPhase} tabs={PHASES.map((p) => ({ id: p.id, label: `${phaseDone(p) ? "✓ " : ""}${p.label}` }))} />

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
                                {current.lists.map((kind) => {
                                    const list = data.checklists[kind];
                                    if (!list) return null;
                                    const done = list.items.filter((i) => i.done).length;
                                    return (
                                        <div className="panel" key={kind}>
                                            <h2 style={{ marginTop: 0 }}>{list.title} <small className="muted">{done}/{list.items.length}</small></h2>
                                            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{list.items.map((i) => (
                                                <li key={i.id} style={{ marginBottom: 8 }}>
                                                    <label className="check"><input type="checkbox" checked={Boolean(i.done)} onChange={(e) => tick(kind, i, e.target.checked)} /> {i.text}</label>
                                                    {i.done && <small className="muted" style={{ display: "block", marginLeft: 26 }}>{new Date(i.done.at).toLocaleTimeString("en-IN")} by {i.done.by}</small>}
                                                    {i.ref && <button className="link-button" style={{ marginLeft: 26, fontSize: ".85rem" }} onClick={() => showRef(i.ref)}>How to</button>}
                                                </li>
                                            ))}</ul>
                                        </div>
                                    );
                                })}

                                {current.step && (
                                    <div className="panel">
                                        <h2 style={{ marginTop: 0 }}>{current.label}</h2>
                                        {changedAt(current.step.to) ? (
                                            <p><span className="badge badge-verified">Done</span> at {new Date(changedAt(current.step.to)).toLocaleTimeString("en-IN")}</p>
                                        ) : status === current.step.from ? (
                                            <>
                                                {!data.poll.onPollDay && <p className="muted">This can be recorded only on poll day.</p>}
                                                {current.id === "closing" && !listDone("closing") && <p className="muted">Finish the closing checklist first.</p>}
                                                <button className="btn btn-primary" disabled={busy || !data.poll.onPollDay || (current.id === "closing" && !listDone("closing"))} onClick={() => advance(current.step.to)}>{current.step.text}</button>
                                            </>
                                        ) : <p className="muted">Complete the earlier phases first. The poll is now: {STATUS_TEXT[status].toLowerCase()}.</p>}
                                        {current.id === "poll" && (
                                            <p style={{ marginBottom: 0 }}><Link className="btn btn-secondary" to="/poll-day">Open the poll-day screen</Link><br /><small className="muted">Marking electors, turnout, the queue, challenged and tendered votes, incidents and escalation.</small></p>
                                        )}
                                    </div>
                                )}

                                {current.refs.length > 0 && (
                                    <div className="panel">
                                        <h2 style={{ marginTop: 0 }}>Procedures for this phase</h2>
                                        <ul className="rows">{current.refs.map((id) => <li key={id}><button type="button" className="row-link" style={{ width: "100%", background: "none", border: 0, font: "inherit", textAlign: "left" }} onClick={() => showRef(id)}><span><strong>{titleOf(id)}</strong></span><span className="go">Read</span></button></li>)}</ul>
                                    </div>
                                )}

                                {current.id === "before" && (
                                    <div className="panel">
                                        <h2 style={{ marginTop: 0 }}>Polling party and others at this station</h2>
                                        {data.party.length === 0 ? <p className="muted">No assignments found.</p> : <ul className="rows">{data.party.map((p, n) => (
                                            <li key={n} style={{ padding: "8px 0" }}><strong>{p.roleLabel}</strong>: {p.name ?? p.epic ?? "–"}{p.candidateName ? <small className="muted"> (for {p.candidateName})</small> : null}</li>
                                        ))}</ul>}
                                    </div>
                                )}

                                {current.id === "after" && (
                                    <div className="panel">
                                        <h2 style={{ marginTop: 0 }}>Reports</h2>
                                        <p>File the presiding officer's report and the machine log from your desk.</p>
                                        <Link className="btn btn-secondary" to="/desk?tab=stationRecords">Machine log and PO report</Link>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <div className="panel" id="po-library">
                        <h2 style={{ marginTop: 0 }}>Procedure library</h2>
                        {lib && <p className="muted" style={{ fontSize: ".9rem" }}>{lib.notice} Library version {lib.version}.</p>}
                        <form className="portal-form" onSubmit={(e) => { e.preventDefault(); search(q); }} style={{ display: "flex", gap: 8, alignItems: "end" }}>
                            <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="po-q">Search (for example: challenge, companion, VVPAT, closing)</label>
                                <input id="po-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                            <button className="btn btn-quiet">Search</button>
                        </form>
                        {lib && lib.items.length === 0 && <p>Nothing found. Ask your sector officer or the Returning Officer.</p>}
                        <div>{(lib?.items ?? []).map((p) => (
                            <div className="disclosure" key={p.id}>
                                <button type="button" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>{p.title}</button>
                                {open === p.id && (
                                    <div>
                                        <ol style={{ paddingLeft: 20 }}>{p.steps.map((s, n) => <li key={n}>{s}</li>)}</ol>
                                        <p style={{ margin: 0 }}><small><strong>Source:</strong> {p.sources.map((s) => `${lib.sources[s.source]?.title}, ${s.ref}`).join("; ")}.</small></p>
                                        <p style={{ margin: 0 }}><small>Version {p.version} · {p.reviewStatus === "unreviewed" ? "Not yet checked against the current official handbook" : "Reviewed"}</small></p>
                                    </div>
                                )}
                            </div>
                        ))}</div>
                    </div>
                </div>
            </section>
        </>
    );
}

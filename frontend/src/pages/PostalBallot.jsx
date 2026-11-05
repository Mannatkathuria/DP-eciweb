import { useState } from "react";
import api from "../api/axios";
import "../styles/desk.css";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import { apiMessage } from "../config/elections";

// Service voters' electronically transmitted postal ballot: open it with the ballot id and the PIN
// from your Record Officer, print it with Forms 13A, 13B and 13C, mark it on paper, post it, and
// follow it to the Returning Officer. No vote is cast online.

export default function PostalBallot() {
    const [tab, setTab] = useState("open");
    const [cred, setCred] = useState({ ballotId: "", pin: "" });
    const [ballot, setBallot] = useState(null);
    const [article, setArticle] = useState("");
    const [trackId, setTrackId] = useState("");
    const [tracked, setTracked] = useState(null);
    const [msg, setMsg] = useState({ error: "", notice: "" });
    const [busy, setBusy] = useState(false);
    const go = async (fn, after) => { setBusy(true); setMsg({ error: "", notice: "" }); try { const r = await fn(); after(r.data); } catch (e) { setMsg({ error: apiMessage(e, "That did not work."), notice: "" }); } finally { setBusy(false); } };
    return (
        <>
            <PageHead title="Postal ballot for service voters" crumbs={[{ label: "Voters" }, { label: "Postal ballot" }]}
                lede="If you are a service voter, your ballot is sent to you electronically and your Record Officer gives you its PIN separately. Open it here, print it, mark it on paper and post it back free of charge by Speed Post. It must reach the Returning Officer before counting of postal ballots begins." />
            <section className="section">
                <div className="container">
                    <div className="no-print"><Tabs label="Postal ballot" active={tab} onChange={(t) => { setTab(t); setMsg({ error: "", notice: "" }); }} tabs={[{ id: "open", label: "Open and print my ballot" }, { id: "track", label: "Track a returned ballot" }]} /></div>
                    {msg.error && <div className="alert alert-error" role="alert">{msg.error}</div>}
                    {msg.notice && <div className="alert alert-ok" role="status">{msg.notice}</div>}
                    {tab === "open" && !ballot && (
                        <form className="panel portal-form" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); go(() => api.post("/etpb/download", cred), (d) => setBallot(d.data)); }}>
                            <div className="form-row">
                                <div className="field"><label htmlFor="pb-id">Ballot id</label><input id="pb-id" value={cred.ballotId} onChange={(e) => setCred({ ...cred, ballotId: e.target.value.toUpperCase() })} required /></div>
                                <div className="field"><label htmlFor="pb-pin">PIN from your Record Officer</label><input id="pb-pin" inputMode="numeric" maxLength={6} value={cred.pin} onChange={(e) => setCred({ ...cred, pin: e.target.value })} required /></div>
                            </div>
                            <button className="btn btn-primary" disabled={busy}>Open ballot</button>
                        </form>
                    )}
                    {tab === "open" && ballot && (
                        <div className="stack">
                            <article className="panel ballot-sheet">
                                <h2 style={{ marginTop: 0 }}>Postal ballot paper · {ballot.constituency}, {ballot.state}</h2>
                                <p className="muted">{ballot.election} · ballot {ballot.ballotId} · elector {ballot.elector}</p>
                                <table className="desk-table"><thead><tr><th>#</th><th>Candidate</th><th>Party</th><th>Symbol</th><th>Your mark</th></tr></thead>
                                    <tbody>{ballot.candidates.map((c) => <tr key={c.serial}><td>{c.serial}</td><td>{c.name}</td><td>{c.party}</td><td>{c.symbol ?? "—"}</td><td style={{ width: 120, border: "1px solid var(--line)" }} /></tr>)}</tbody></table>
                                <h3>Forms to print with the ballot</h3>
                                <ul>{Object.entries(ballot.forms).map(([k, t]) => <li key={k}><strong>Form {k}</strong>: {t}</li>)}</ul>
                                <h3>How to vote</h3>
                                <ol>{ballot.instructions.map((t) => <li key={t}>{t}</li>)}</ol>
                            </article>
                            <div className="desk-actions no-print">
                                <button className="btn btn-primary" onClick={() => window.print()}>Print ballot and forms</button>
                            </div>
                            <form className="panel portal-form no-print" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); go(() => api.post("/etpb/return", { ...cred, speedPostNumber: article }), (d) => setMsg({ error: "", notice: d.message })); }}>
                                <div className="field"><label htmlFor="pb-sp">After posting: Speed Post article number</label><input id="pb-sp" value={article} onChange={(e) => setArticle(e.target.value.toUpperCase())} placeholder="EK123456789IN" required /></div>
                                <button className="btn btn-primary" disabled={busy}>I have posted it</button>
                            </form>
                        </div>
                    )}
                    {tab === "track" && (
                        <form className="panel portal-form" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); go(() => api.get(`/etpb/track/${encodeURIComponent(trackId.trim())}`), (d) => setTracked(d.data)); }}>
                            <div className="field"><label htmlFor="pb-t">Ballot id</label><input id="pb-t" value={trackId} onChange={(e) => setTrackId(e.target.value.toUpperCase())} required /></div>
                            <button className="btn btn-primary" disabled={busy}>Track</button>
                        </form>
                    )}
                    {tab === "track" && tracked && (
                        <div className="panel" role="status">
                            <h2 style={{ marginTop: 0 }}>{tracked.ballotId}: {tracked.statusText}</h2>
                            <p>{tracked.constituency}{tracked.article ? ` · Speed Post ${tracked.article}` : ""}</p>
                            <ol>{[...tracked.timeline.map((t) => ({ at: t.at, text: t.status.replace(/_/g, " ") })), ...tracked.tracking.map((t) => ({ at: t.at, text: t.event }))].sort((a, b) => a.at.localeCompare(b.at)).map((t, i) => <li key={i}>{t.text} · {new Date(t.at).toLocaleString("en-IN")}</li>)}</ol>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}

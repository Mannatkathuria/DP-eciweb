import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import { apiMessage } from "../config/elections";

// Poll day at the signed-in officer's own polling station. What each person can do is decided
// by the server; the page shows the controls their role is allowed to use.

const ROLES = ["presiding_officer", "polling_officer", "polling_agent", "micro_observer", "blo", "admin"];
const POLL_LABEL = { not_started: "Not started", mock_poll_done: "Mock poll held", open: "Poll open", closed: "Poll closed" };
const NEXT = { not_started: ["mock_poll_done", "Record mock poll held"], mock_poll_done: ["open", "Open the poll"], open: ["closed", "Close the poll"] };
const CASE_LABEL = { identity_doubt: "Identity doubt", challenged_vote: "Challenged vote", tendered_vote: "Tendered vote", assisted_voter: "Assisted voter (companion)", not_in_roll: "Name not in this part", other: "Other" };
const DECISION_LABEL = { allowed: "Allowed to vote", refused: "Refused", rejected: "Challenge failed", upheld: "Challenge upheld", closed: "Closed" };
const DECISIONS = { identity_doubt: [["allowed", "Allow to vote", false], ["refused", "Refuse", true]], challenged_vote: [["rejected", "Challenge fails, allow", false], ["upheld", "Uphold challenge", true]], other: [["closed", "Close", false]] };

function GuidedMark({ elector, documents, busy, onMark, onCancel, onDoubt }) {
    const [idDocument, setIdDocument] = useState("epic");
    const [photoMatches, setPhotoMatches] = useState(false);
    const [inkApplied, setInkApplied] = useState(false);
    return (
        <div className="panel" style={{ marginTop: 12, borderColor: "var(--brand)" }}>
            <h3 style={{ marginTop: 0 }}>Verify {elector.name} <small className="muted">(serial {elector.serial}, {elector.epic})</small></h3>
            <ol>
                <li className="field"><label htmlFor="g-doc">Identity document shown</label>
                    <select id="g-doc" value={idDocument} onChange={(e) => setIdDocument(e.target.value)}>
                        {Object.entries(documents).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></li>
                <li><label className="check"><input type="checkbox" checked={photoMatches} onChange={(e) => setPhotoMatches(e.target.checked)} /> The person matches the photograph in the roll or on the document</label></li>
                <li><label className="check"><input type="checkbox" checked={inkApplied} onChange={(e) => setInkApplied(e.target.checked)} /> Indelible ink applied to the left forefinger</label></li>
            </ol>
            <button className="btn btn-primary" disabled={busy || !photoMatches || !inkApplied} onClick={() => onMark({ idDocument, checks: { photoMatches, inkApplied } })}>Mark as voted</button>{" "}
            <button className="btn btn-quiet" onClick={onDoubt} disabled={busy}>Raise identity doubt</button>{" "}
            <button className="btn btn-quiet" onClick={onCancel} disabled={busy}>Cancel</button>
        </div>
    );
}

export default function PollDay() {
    const { logged, userData } = useContext(AuthContext);
    const [s, setS] = useState(null);
    const [q, setQ] = useState("");
    const [results, setResults] = useState(null);
    const [verifying, setVerifying] = useState(null);
    const [cases, setCases] = useState([]);
    const [register, setRegister] = useState(null);
    const [queue, setQueue] = useState("");
    const [dialog, setDialog] = useState(null); // { title, label, required, run(reason) }
    const [challenge, setChallenge] = useState({ epic: "", note: "" });
    const [assist, setAssist] = useState({ epic: "", companionName: "" });
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const allowed = logged && ROLES.includes(userData?.role);

    const load = useCallback(async () => {
        try {
            const st = await api.get("/poll-day/station");
            setS(st.data.data);
            if (userData?.role !== "blo" && userData?.role !== "admin") setCases((await api.get("/poll-day/cases")).data.data.items);
        } catch (err) { setError(apiMessage(err, "Could not load your polling station.")); }
    }, [userData]);
    useEffect(() => {
        if (!allowed) return undefined;
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [allowed, load]);

    if (!logged) return <Navigate to="/signin" replace />;
    if (!allowed) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const res = await fn(); setNotice(ok(res)); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const search = async (e) => {
        e?.preventDefault();
        try { setResults((await api.get("/poll-day/electors", { params: { q } })).data.data.items); }
        catch (err) { setError(apiMessage(err, "Search failed.")); }
    };
    const refreshSearch = () => results && search();

    const isVab = userData.role === "blo" || userData.role === "admin";
    const can = s?.can ?? {};
    const pollOpen = s?.poll.status === "open";

    return (
        <>
            <PageHead title={isVab ? "Voter assistance booth" : "Poll day"} crumbs={[{ label: "Poll day" }]}
                lede={s ? `${s.station.name}, part ${s.station.partNumber}, ${s.station.constituency}. ${s.election.name}.` : "Loading your polling station."} />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}
                    {s && !s.onPollDay && <div className="alert alert-warn">Poll day for this election is {s.election.pollDate}. Nothing can be recorded before then.</div>}
                    {s && !isVab && (
                        <div className="panel" aria-live="polite">
                            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                                <div><small className="muted">Poll</small><br /><span className={`badge ${pollOpen ? "badge-ok" : s.poll.status === "closed" ? "badge-bad" : "badge-warn"}`}>{POLL_LABEL[s.poll.status]}</span></div>
                                <div><small className="muted">Voted</small><br /><strong className="figure">{s.turnout.voted}</strong> of {s.turnout.electors} ({s.turnout.percent}%)</div>
                                <div><small className="muted">Queue</small><br /><strong className="figure">{s.queue ? s.queue.waiting : "–"}</strong>{s.queue && <small className="muted"> at {new Date(s.queue.at).toLocaleTimeString()}</small>}</div>
                                <div><small className="muted">Open cases</small><br /><strong className="figure">{s.openCases}</strong></div>
                            </div>
                            {can.conduct && s.onPollDay && NEXT[s.poll.status] && (
                                <p style={{ marginTop: 16 }}>
                                    <button className="btn btn-primary" disabled={busy} onClick={() => setDialog({
                                        title: NEXT[s.poll.status][1], label: "Note for the presiding officer's diary", required: false, confirmLabel: NEXT[s.poll.status][1], confirmClass: "btn-approve",
                                        run: (note) => act(() => api.post("/poll-day/poll/status", { status: NEXT[s.poll.status][0], note }), ({ data }) => `${POLL_LABEL[data.data.status]}.`)
                                    })}>{NEXT[s.poll.status][1]}</button>
                                </p>
                            )}
                            {s.poll.closing && <p className="muted">Closed at {new Date(s.poll.closing.at).toLocaleTimeString()} with {s.poll.closing.votesInRegister} electors in the register.</p>}
                            {(can.conduct || can.identify) && pollOpen && (
                                <form style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); act(() => api.post("/poll-day/queue", { waiting: Number(queue) }), () => "Queue reported.").then((ok) => ok && setQueue("")); }}>
                                    <div className="field" style={{ margin: 0 }}><label htmlFor="pd-queue">People waiting now</label><input id="pd-queue" type="number" min="0" max="5000" value={queue} onChange={(e) => setQueue(e.target.value)} required /></div>
                                    <button className="btn btn-quiet" type="submit" disabled={busy}>Report queue</button>
                                </form>
                            )}
                        </div>
                    )}

                    {(can.identify || can.mark || isVab) && (
                        <div className="panel">
                            <h2>{isVab ? "Find an elector's serial number" : "Find the elector"}</h2>
                            <form style={{ display: "flex", gap: 8, alignItems: "end" }} onSubmit={search}>
                                <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="pd-q">Name or EPIC number</label><input id="pd-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                                <button className="btn btn-primary" type="submit">Search</button>
                            </form>
                            {results && (
                                <div className="table-wrap" style={{ marginTop: 12 }}><table>
                                    <thead><tr><th>Serial</th><th>Elector</th><th>{isVab ? "Polling station" : "Status"}</th><th></th></tr></thead>
                                    <tbody>{results.map((e) => (
                                        <tr key={e.epic}>
                                            <td className="figure">{e.serial}</td>
                                            <td><strong>{e.name}</strong><br /><small>{e.epic} · {e.gender} · {e.age}</small></td>
                                            <td>{isVab ? <small>Part {e.partNumber}, {e.pollingStation}</small>
                                                : e.voted ? <span className="badge badge-ok">Voted</span> : e.openCase ? <span className="badge badge-warn">{CASE_LABEL[e.openCase]} open</span> : <span className="badge">Not voted</span>}</td>
                                            <td>{!isVab && can.mark && pollOpen && !e.voted && !e.openCase && <button className="btn-approve" onClick={() => setVerifying(e)}>Verify</button>}</td>
                                        </tr>
                                    ))}
                                    {results.length === 0 && <tr><td colSpan={4}>No elector of this part matches.</td></tr>}</tbody>
                                </table></div>
                            )}
                            {verifying && (
                                <GuidedMark elector={verifying} documents={s.idDocuments} busy={busy} onCancel={() => setVerifying(null)}
                                    onMark={(body) => act(() => api.post(`/poll-day/electors/${verifying.epic}/mark`, body), ({ data }) => data.message).then((ok) => { if (ok) { setVerifying(null); refreshSearch(); } })}
                                    onDoubt={() => setDialog({ title: `Identity doubt about ${verifying.name}`, label: "What is the doubt?", required: true, confirmLabel: "Send to presiding officer",
                                        run: (note) => act(() => api.post("/poll-day/cases", { type: "identity_doubt", epic: verifying.epic, note }), () => "Sent to the presiding officer.").then((ok) => { if (ok) { setVerifying(null); refreshSearch(); } return ok; }) })} />
                            )}
                        </div>
                    )}

                    {can.object && !can.identify && (
                        <form className="panel portal-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post("/poll-day/cases", { type: "challenged_vote", ...challenge }), () => "Challenge sent to the presiding officer.").then((ok) => ok && setChallenge({ epic: "", note: "" })); }}>
                            <h2>Challenge an elector's identity</h2>
                            <p className="muted">The presiding officer decides the challenge before the elector can vote.</p>
                            <div className="form-row">
                                <div className="field"><label htmlFor="ch-epic">EPIC number</label><input id="ch-epic" value={challenge.epic} onChange={(e) => setChallenge({ ...challenge, epic: e.target.value })} required /></div>
                                <div className="field"><label htmlFor="ch-note">Grounds</label><input id="ch-note" value={challenge.note} onChange={(e) => setChallenge({ ...challenge, note: e.target.value })} required /></div>
                            </div>
                            <button className="btn btn-primary" type="submit" disabled={busy || !pollOpen}>Challenge</button>
                        </form>
                    )}

                    {can.identify && pollOpen && (
                        <form className="panel portal-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post("/poll-day/cases", { type: "assisted_voter", ...assist }), () => "Companion recorded.").then((ok) => ok && setAssist({ epic: "", companionName: "" })); }}>
                            <h2>Record a companion (Rule 49N)</h2>
                            <div className="form-row">
                                <div className="field"><label htmlFor="as-epic">Elector's EPIC</label><input id="as-epic" value={assist.epic} onChange={(e) => setAssist({ ...assist, epic: e.target.value })} required /></div>
                                <div className="field"><label htmlFor="as-name">Companion's name</label><input id="as-name" value={assist.companionName} onChange={(e) => setAssist({ ...assist, companionName: e.target.value })} required /></div>
                            </div>
                            <button className="btn btn-quiet" type="submit" disabled={busy}>Record companion</button>
                        </form>
                    )}

                    {!isVab && (
                        <div className="panel">
                            <h2>Cases at this station ({cases.length})</h2>
                            {cases.length === 0 && <p>None.</p>}
                            <ul className="rows">{cases.map((c) => (
                                <li key={c._id} style={{ padding: "10px 0" }}>
                                    <strong>{CASE_LABEL[c.type]}</strong>{c.name && <> · {c.name} ({c.epic})</>} <span className={`badge ${c.status === "open" ? "badge-warn" : ""}`}>{c.status === "decided" ? DECISION_LABEL[c.decision] : c.status === "open" ? "Waiting for the presiding officer" : "Recorded"}</span><br />
                                    <small>{c.note}{c.companionName ? `Companion: ${c.companionName}` : ""} · raised by {c.raisedBy.epic} at {new Date(c.raisedAt).toLocaleTimeString()}</small>
                                    {c.decisionNote && <><br /><small>Decision: {c.decisionNote}</small></>}
                                    {can.conduct && c.status === "open" && (
                                        <div style={{ marginTop: 6 }}>{(DECISIONS[c.type] ?? []).map(([d, label, needsReason]) => (
                                            <button key={d} className={needsReason ? "btn-reject" : "btn-approve"} style={{ marginRight: 8 }} disabled={busy} onClick={() => setDialog({
                                                title: `${label}: ${c.name || CASE_LABEL[c.type]}`, label: needsReason ? "Reason" : "Note", required: needsReason, confirmLabel: label, confirmClass: needsReason ? "btn-reject" : "btn-approve",
                                                run: (note) => act(() => api.post(`/poll-day/cases/${c._id}/resolve`, { decision: d, note }), () => "Decision recorded.")
                                            })}>{label}</button>
                                        ))}</div>
                                    )}
                                </li>
                            ))}</ul>
                        </div>
                    )}

                    {can.conduct && s && (
                        <div className="panel">
                            <h2>Register of electors who voted</h2>
                            <p className="muted">Confidential. Shown only to the presiding officer.</p>
                            <button className="btn btn-quiet btn-small" onClick={async () => { try { setRegister(register ? null : (await api.get("/poll-day/register")).data.data.items); } catch (err) { setError(apiMessage(err, "Could not load the register.")); } }}>{register ? "Hide register" : "Show register"}</button>
                            {pollOpen && <button className="btn btn-quiet btn-small" style={{ marginLeft: 8 }} onClick={() => setDialog({
                                title: "Record a tendered vote", label: "EPIC number of the elector already marked as voted", required: true, confirmLabel: "Record",
                                run: (epic) => act(() => api.post("/poll-day/cases", { type: "tendered_vote", epic, note: "Person claims to be this elector; tendered ballot issued" }), () => "Tendered vote recorded.")
                            })}>Record a tendered vote</button>}
                            {register && (
                                <div className="table-wrap" style={{ marginTop: 12 }}><table>
                                    <thead><tr><th>No.</th><th>Elector</th><th>Document</th><th>Time</th><th>Officer</th></tr></thead>
                                    <tbody>{register.map((r) => <tr key={r.serial}><td>{r.serial}</td><td>{r.name}<br /><small>{r.epic}</small></td><td><small>{r.idDocumentLabel}</small></td><td>{new Date(r.at).toLocaleTimeString()}</td><td>{r.by}</td></tr>)}
                                        {register.length === 0 && <tr><td colSpan={5}>Nobody has voted yet.</td></tr>}</tbody>
                                </table></div>
                            )}
                        </div>
                    )}
                </div>
            </section>
            {dialog && (
                <ReasonDialog title={dialog.title} label={dialog.label} required={dialog.required} confirmLabel={dialog.confirmLabel} confirmClass={dialog.confirmClass} busy={busy} error={error}
                    onCancel={() => setDialog(null)} onConfirm={(value) => dialog.run(value).then((ok) => ok && setDialog(null))} />
            )}
        </>
    );
}

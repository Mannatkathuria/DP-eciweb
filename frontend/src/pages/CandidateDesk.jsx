import { useCallback, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import { NOMINATION_STATUS, STAGE_LABEL, apiMessage, rupees } from "../config/elections";

// Candidate: file a nomination for the constituency of their assignment during the nomination
// period, follow scrutiny, and withdraw until the last date of withdrawal.

const blank = { name: "", dateOfBirth: "", party: "", independent: false, symbol: "", criminalCases: "0", assets: "", liabilities: "0", education: "", declarationAccepted: false };

export default function CandidateDesk() {
    const { logged, userData } = useContext(AuthContext);
    const [area, setArea] = useState(null);
    const [elections, setElections] = useState([]);
    const [mine, setMine] = useState([]);
    const [electionId, setElectionId] = useState("");
    const [form, setForm] = useState(blank);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const isCandidate = logged && userData?.role === "candidate";

    const load = useCallback(async () => {
        try {
            const [me, el, n] = await Promise.all([api.get("/assignments/me"), api.get("/elections"), api.get("/nominations/mine")]);
            const a = me.data.data.assignments.find((x) => x.jurisdiction?.constituency);
            setArea(a?.jurisdiction ?? null);
            setElections(el.data.data.items); setMine(n.data.data.items);
            const open = el.data.data.items.filter((e) => e.stage === "nominations_open" && (!a || e.states.includes(a.jurisdiction.state)));
            setElectionId((id) => id || open[0]?._id || "");
        } catch (err) { setError(apiMessage(err, "Could not load your details.")); }
    }, []);
    useEffect(() => { if (isCandidate) load(); }, [isCandidate, load]);

    if (!logged) return <Navigate to="/signin/candidate" replace />;
    if (!isCandidate) return <Navigate to="/home" replace />;

    const open = elections.filter((e) => e.stage === "nominations_open" && (!area || e.states.includes(area.state)));
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const res = await fn(); setNotice(ok(res)); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const file = (e) => {
        e.preventDefault();
        act(() => api.post("/nominations", {
            electionId, name: form.name, dateOfBirth: form.dateOfBirth, party: form.independent ? "" : form.party, independent: form.independent, symbol: form.symbol,
            affidavit: { criminalCases: form.criminalCases, assets: form.assets, liabilities: form.liabilities, education: form.education, declarationAccepted: form.declarationAccepted }
        }), ({ data }) => data.message).then((ok) => ok && setForm(blank));
    };
    const electionName = (id) => elections.find((e) => e._id === id)?.name ?? id;

    return (
        <>
            <PageHead title="Candidate nomination" crumbs={[{ label: "Candidates and parties", to: "/candidates" }, { label: "Nomination" }]}
                lede={area ? `You are registered as a candidate for ${area.constituency}, ${area.state}.` : "Your candidate registration is loading."} />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}

                    <div className="panel">
                        <h2>Your nominations</h2>
                        {mine.length === 0 && <p>You have not filed a nomination.</p>}
                        {mine.map((n) => {
                            const e = elections.find((x) => x._id === n.electionId);
                            const canWithdraw = ["filed", "accepted"].includes(n.status) && e && e.today <= e.schedule.lastDateOfWithdrawal;
                            return (
                                <div key={n._id} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
                                    <strong>{electionName(n.electionId)}</strong>, {n.constituency}<br />
                                    <span className="badge">{NOMINATION_STATUS[n.status]}</span>
                                    {n.scrutiny?.reason && <p style={{ margin: "6px 0" }}>Returning officer's reason: {n.scrutiny.reason}</p>}
                                    <p className="muted" style={{ margin: "6px 0" }}><small>{n.party} · assets {rupees(n.affidavit.assets)} · filed {new Date(n.filedAt).toLocaleString()}</small></p>
                                    {canWithdraw && <button className="btn-reject" disabled={busy} onClick={() => act(() => api.post(`/nominations/${n._id}/withdraw`), () => "Nomination withdrawn.")}>Withdraw nomination</button>}
                                </div>
                            );
                        })}
                    </div>

                    {area && (open.length === 0 ? <p className="panel">No election in your State is accepting nominations today.</p> : (
                        <form className="panel portal-form" onSubmit={file}>
                            <h2>File a nomination</h2>
                            <div className="field"><label htmlFor="n-el">Election</label>
                                <select id="n-el" value={electionId} onChange={(e) => setElectionId(e.target.value)}>
                                    {open.map((e) => <option key={e._id} value={e._id}>{e.name} ({STAGE_LABEL[e.stage]} until {e.schedule.lastDateOfNominations})</option>)}
                                </select></div>
                            <div className="form-row">
                                <div className="field"><label htmlFor="n-name">Name as on the roll</label><input id="n-name" value={form.name} onChange={set("name")} required /></div>
                                <div className="field"><label htmlFor="n-dob">Date of birth</label><input id="n-dob" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} required /><span className="hint">You must be at least 25 on the date of scrutiny.</span></div>
                            </div>
                            <label className="check"><input type="checkbox" checked={form.independent} onChange={set("independent")} /> I am contesting as an independent</label>
                            <div className="form-row">
                                {!form.independent && <div className="field"><label htmlFor="n-party">Party</label><input id="n-party" value={form.party} onChange={set("party")} required /></div>}
                                <div className="field"><label htmlFor="n-sym">Symbol</label><input id="n-sym" value={form.symbol} onChange={set("symbol")} /></div>
                            </div>
                            <h3>Affidavit (Form 26) summary</h3>
                            <div className="form-row">
                                <div className="field"><label htmlFor="n-cc">Pending criminal cases</label><input id="n-cc" type="number" min="0" value={form.criminalCases} onChange={set("criminalCases")} required /></div>
                                <div className="field"><label htmlFor="n-edu">Education</label><input id="n-edu" value={form.education} onChange={set("education")} /></div>
                            </div>
                            <div className="form-row">
                                <div className="field"><label htmlFor="n-assets">Total assets (₹)</label><input id="n-assets" type="number" min="0" value={form.assets} onChange={set("assets")} required /></div>
                                <div className="field"><label htmlFor="n-liab">Total liabilities (₹)</label><input id="n-liab" type="number" min="0" value={form.liabilities} onChange={set("liabilities")} required /></div>
                            </div>
                            <label className="check"><input type="checkbox" checked={form.declarationAccepted} onChange={set("declarationAccepted")} /> I declare that the affidavit is true and complete.</label>
                            <button className="btn btn-primary" type="submit" disabled={busy || !form.declarationAccepted}>File nomination</button>
                            <p className="muted"><small>Prototype: nominations here are demonstration records and do not reach a real returning officer.</small></p>
                        </form>
                    ))}
                </div>
            </section>
        </>
    );
}

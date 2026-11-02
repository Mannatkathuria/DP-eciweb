import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import StaffAssignments from "../components/StaffAssignments";
import { NOMINATION_STATUS, SCHEDULE_STEPS, STAGE_LABEL, apiMessage, rupees } from "../config/elections";

// Returning Officer (and Assistant RO): scrutiny of nominations in the constituency, the list of
// contesting candidates (published by the RO once withdrawals close), and polling parties.

const PARTY_ROLES = ["presiding_officer", "polling_officer"];
const BADGE = { filed: "badge-warn", accepted: "badge-ok", rejected: "badge-bad", withdrawn: "" };

export default function RoDesk() {
    const { logged, userData } = useContext(AuthContext);
    const [area, setArea] = useState(null);
    const [assignedElection, setAssignedElection] = useState(null);
    const [elections, setElections] = useState([]);
    const [electionId, setElectionId] = useState("");
    const [nominations, setNominations] = useState([]);
    const [contesting, setContesting] = useState(null);
    const [stations, setStations] = useState([]);
    const [rejecting, setRejecting] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [delegation, setDelegation] = useState(null);
    const [delegateForm, setDelegateForm] = useState({ aroEpic: "", reason: "" });
    const [revoking, setRevoking] = useState(false);
    const [agents, setAgents] = useState([]);

    const isRo = logged && ["ro", "aro"].includes(userData?.role);
    const isReturningOfficer = userData?.role === "ro";

    useEffect(() => {
        if (!isRo) return;
        Promise.all([api.get("/assignments/me"), api.get("/elections"), api.get("/polling-stations")]).then(([me, el, st]) => {
            const a = me.data.data.assignments.find((x) => x.jurisdiction?.constituency);
            setArea(a?.jurisdiction ?? null); setAssignedElection(a?.election ?? null);
            const items = el.data.data.items.filter((e) => !a || e.states.includes(a.jurisdiction.state));
            setElections(items);
            setElectionId((id) => id || items.find((e) => ["scrutiny_and_withdrawal", "campaign"].includes(e.stage))?._id || items[0]?._id || "");
            setStations(st.data.data.items);
        }).catch((err) => setError(apiMessage(err, "Could not load your constituency.")));
    }, [isRo]);

    const load = useCallback(async () => {
        if (!electionId || !area) return;
        try {
            const where = { electionId, state: area.state, district: area.district, constituency: area.constituency };
            const [n, c, d, ag] = await Promise.all([
                api.get("/nominations", { params: { electionId } }),
                api.get("/public/candidates", { params: where }),
                api.get("/nominations/scrutiny-delegation", { params: where }),
                api.get("/agents", { params: { electionId } })
            ]);
            setAgents(ag.data.data.items);
            setNominations(n.data.data.items); setContesting(c.data.data); setDelegation(d.data.data);
        } catch (err) { setError(apiMessage(err, "Could not load nominations.")); }
    }, [electionId, area]);
    useEffect(() => { load(); }, [load]);

    if (!logged) return <Navigate to="/signin/ro" replace />;
    if (!isRo) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const res = await fn(); setNotice(ok(res)); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const election = elections.find((e) => e._id === electionId);
    const where = area ? { electionId, state: area.state, district: area.district, constituency: area.constituency } : {};
    const activeDelegation = delegation && !delegation.revokedAt ? delegation : null;
    // RP Act 1951, s.22(2): an ARO scrutinises only when the RO is unavoidably prevented and has named them.
    const canScrutinise = isReturningOfficer || (activeDelegation && activeDelegation.aroEpic === userData?.epic);
    const delegate = (e) => { e.preventDefault(); return act(() => api.post("/nominations/scrutiny-delegation", { ...where, ...delegateForm }), () => "Scrutiny delegated. The named ARO can now scrutinise in your place.").then((ok) => ok && setDelegateForm({ aroEpic: "", reason: "" })); };
    const accept = (n) => act(() => api.post(`/nominations/${n._id}/scrutiny`, { decision: "accepted" }), () => `Nomination of ${n.name} accepted.`);
    const publish = () => act(() => api.post("/nominations/contesting", { electionId, state: area.state, district: area.district, constituency: area.constituency }),
        ({ data }) => `List of ${data.data.candidates.length} contesting candidates published.`);

    return (
        <>
            <PageHead title={isReturningOfficer ? "Returning officer" : "Assistant returning officer"} crumbs={[{ label: "Returning officer" }]}
                lede={area ? `${area.constituency}, ${area.state}. Scrutinise nominations, publish the list of contesting candidates and arrange polling parties.` : "Your constituency assignment is loading."} />
            <section className="section">
                <div className="container stack">
                    <p><Link to="/control-room">Open the control room</Link></p>
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}
                    {area && (
                        <>
                            <div className="panel">
                                <div className="field" style={{ maxWidth: 480 }}>
                                    <label htmlFor="ro-election">Election</label>
                                    <select id="ro-election" value={electionId} onChange={(e) => setElectionId(e.target.value)}>
                                        {elections.map((e) => <option key={e._id} value={e._id}>{e.name} ({STAGE_LABEL[e.stage]})</option>)}
                                    </select>
                                </div>
                                {election && <p><small>{SCHEDULE_STEPS.map(([k, label]) => `${label}: ${election.schedule[k]}`).join(" · ")}</small></p>}
                            </div>

                            <div className="panel">
                                <h2>Nominations ({nominations.length})</h2>
                                <p className="muted">Scrutiny opens on the scrutiny date and ends with the last date of withdrawal. A rejection needs a reason, which the candidate sees.</p>
                                {!isReturningOfficer && !canScrutinise && <div className="alert alert-warn" role="note">Under section 22(2) of the Representation of the People Act, 1951, an Assistant Returning Officer scrutinises nominations only when the Returning Officer is unavoidably prevented. The Returning Officer has not named you, so you can view nominations but not decide them.</div>}
                                {!isReturningOfficer && canScrutinise && <div className="alert alert-ok" role="note">The Returning Officer has recorded that they are unavoidably prevented ({activeDelegation.reason}). You are scrutinising in their place.</div>}
                                <div className="table-wrap"><table>
                                    <thead><tr><th>Candidate</th><th>Affidavit</th><th>Status</th><th>Scrutiny</th></tr></thead>
                                    <tbody>{nominations.map((n) => (
                                        <tr key={n._id}>
                                            <td><strong>{n.name}</strong><br /><small>{n.party}{n.symbol ? ` · symbol: ${n.symbol}` : ""} · age {n.age}</small></td>
                                            <td><small>Assets {rupees(n.affidavit.assets)} · liabilities {rupees(n.affidavit.liabilities)}<br />{n.affidavit.criminalCases} criminal case(s) · {n.affidavit.education}</small></td>
                                            <td><span className={`badge ${BADGE[n.status]}`}>{NOMINATION_STATUS[n.status]}</span>{n.scrutiny?.reason && <><br /><small>{n.scrutiny.reason}</small></>}</td>
                                            <td style={{ whiteSpace: "nowrap" }}>{n.status === "filed" && canScrutinise && <>
                                                <button className="btn-approve" disabled={busy} onClick={() => accept(n)}>Accept</button>{" "}
                                                <button className="btn-reject" disabled={busy} onClick={() => setRejecting(n)}>Reject</button>
                                            </>}</td>
                                        </tr>
                                    ))}
                                    {nominations.length === 0 && <tr><td colSpan={4}>No nominations for this election in your constituency.</td></tr>}</tbody>
                                </table></div>
                            </div>

                            {isReturningOfficer && (
                                <div className="panel">
                                    <h2>If you are unavoidably prevented from scrutiny</h2>
                                    <p className="muted">Section 22(2) of the Representation of the People Act, 1951 lets an Assistant Returning Officer scrutinise nominations only when you are unavoidably prevented. Record the reason and name the ARO of this constituency. The record is audited.</p>
                                    {activeDelegation ? (
                                        <>
                                            <p>Delegated to <strong>{activeDelegation.aroName ?? activeDelegation.aroEpic}</strong> ({activeDelegation.aroEpic}) on {new Date(activeDelegation.at).toLocaleString()}. Reason: {activeDelegation.reason}</p>
                                            <button className="btn btn-secondary" disabled={busy} onClick={() => setRevoking(true)}>I can scrutinise again</button>
                                        </>
                                    ) : (
                                        <form className="portal-form" onSubmit={delegate}>
                                            <div className="form-row" style={{ flexWrap: "wrap" }}>
                                                <div className="field"><label htmlFor="d-aro">ARO's EPIC</label>
                                                    <input id="d-aro" value={delegateForm.aroEpic} onChange={(e) => setDelegateForm({ ...delegateForm, aroEpic: e.target.value })} required /></div>
                                                <div className="field" style={{ flex: 2 }}><label htmlFor="d-reason">Why you are prevented</label>
                                                    <input id="d-reason" value={delegateForm.reason} onChange={(e) => setDelegateForm({ ...delegateForm, reason: e.target.value })} required minLength={5} /></div>
                                            </div>
                                            <button className="btn btn-secondary" type="submit" disabled={busy}>Delegate scrutiny</button>
                                        </form>
                                    )}
                                </div>
                            )}

                            <div className="panel">
                                <h2>List of contesting candidates</h2>
                                {contesting?.publishedAt ? (
                                    <>
                                        <p className="muted">Published {new Date(contesting.publishedAt).toLocaleString()} by {contesting.publishedBy}. It cannot be changed.</p>
                                        <ol>{contesting.candidates.map((c) => <li key={c.nominationId}>{c.name}, {c.party}{c.symbol ? ` (${c.symbol})` : ""}</li>)}</ol>
                                    </>
                                ) : (
                                    <>
                                        <p>Not published yet. It can be published after the last date of withdrawal{election ? ` (${election.schedule.lastDateOfWithdrawal})` : ""}, once every nomination has been scrutinised.</p>
                                        {isReturningOfficer && <button className="btn btn-primary" onClick={publish} disabled={busy}>Publish the list</button>}
                                    </>
                                )}
                            </div>

                            <div className="panel">
                                <h2>Candidates' agents ({agents.length})</h2>
                                <p className="muted">Appointed by the candidates (election agents) or by them or their election agents (polling and counting agents).</p>
                                <div className="table-wrap"><table>
                                    <thead><tr><th>Candidate</th><th>Agent</th><th>Type</th><th>Where</th><th>Appointed</th></tr></thead>
                                    <tbody>{agents.map((a) => (
                                        <tr key={a._id}><td>{a.candidateName}<br /><small>{a.party}</small></td><td>{a.epic}</td><td>{a.agentType}</td>
                                            <td><small>{a.jurisdiction.pollingStation ? `Part ${a.jurisdiction.partNumber}: ${a.jurisdiction.pollingStation}` : a.jurisdiction.constituency}</small></td>
                                            <td><small>{new Date(a.grantedAt).toLocaleDateString()} by {a.grantedBy}</small></td></tr>
                                    ))}
                                    {agents.length === 0 && <tr><td colSpan={5}>No agents appointed for this election.</td></tr>}</tbody>
                                </table></div>
                            </div>

                            <StaffAssignments roles={PARTY_ROLES} stations={stations} constituencies={[area.constituency]} election={assignedElection} area={area} />
                        </>
                    )}
                </div>
            </section>
            {revoking && (
                <ReasonDialog title="Withdraw the delegation" label="Reason" required confirmLabel="Withdraw" busy={busy} error={error}
                    onCancel={() => setRevoking(false)}
                    onConfirm={(reason) => act(() => api.post("/nominations/scrutiny-delegation/revoke", { ...where, reason }), () => "Delegation withdrawn. Only you can scrutinise now.").then((ok) => ok && setRevoking(false))} />
            )}
            {rejecting && (
                <ReasonDialog title={`Reject the nomination of ${rejecting.name}`} label="Reason (the candidate will see it)" required confirmLabel="Reject" busy={busy} error={error}
                    onCancel={() => setRejecting(null)}
                    onConfirm={(reason) => act(() => api.post(`/nominations/${rejecting._id}/scrutiny`, { decision: "rejected", reason }), () => "Nomination rejected.").then((ok) => ok && setRejecting(null))} />
            )}
        </>
    );
}

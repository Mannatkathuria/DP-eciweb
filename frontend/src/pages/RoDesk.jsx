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
            const [n, c] = await Promise.all([
                api.get("/nominations", { params: { electionId } }),
                api.get("/public/candidates", { params: { electionId, state: area.state, constituency: area.constituency } })
            ]);
            setNominations(n.data.data.items); setContesting(c.data.data);
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
                                <div className="table-wrap"><table>
                                    <thead><tr><th>Candidate</th><th>Affidavit</th><th>Status</th><th>Scrutiny</th></tr></thead>
                                    <tbody>{nominations.map((n) => (
                                        <tr key={n._id}>
                                            <td><strong>{n.name}</strong><br /><small>{n.party}{n.symbol ? ` · symbol: ${n.symbol}` : ""} · age {n.age}</small></td>
                                            <td><small>Assets {rupees(n.affidavit.assets)} · liabilities {rupees(n.affidavit.liabilities)}<br />{n.affidavit.criminalCases} criminal case(s) · {n.affidavit.education}</small></td>
                                            <td><span className={`badge ${BADGE[n.status]}`}>{NOMINATION_STATUS[n.status]}</span>{n.scrutiny?.reason && <><br /><small>{n.scrutiny.reason}</small></>}</td>
                                            <td style={{ whiteSpace: "nowrap" }}>{n.status === "filed" && <>
                                                <button className="btn-approve" disabled={busy} onClick={() => accept(n)}>Accept</button>{" "}
                                                <button className="btn-reject" disabled={busy} onClick={() => setRejecting(n)}>Reject</button>
                                            </>}</td>
                                        </tr>
                                    ))}
                                    {nominations.length === 0 && <tr><td colSpan={4}>No nominations for this election in your constituency.</td></tr>}</tbody>
                                </table></div>
                            </div>

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

                            <StaffAssignments roles={PARTY_ROLES} stations={stations} constituencies={[area.constituency]} election={assignedElection} area={area} />
                        </>
                    )}
                </div>
            </section>
            {rejecting && (
                <ReasonDialog title={`Reject the nomination of ${rejecting.name}`} label="Reason (the candidate will see it)" required confirmLabel="Reject" busy={busy} error={error}
                    onCancel={() => setRejecting(null)}
                    onConfirm={(reason) => act(() => api.post(`/nominations/${rejecting._id}/scrutiny`, { decision: "rejected", reason }), () => "Nomination rejected.").then((ok) => ok && setRejecting(null))} />
            )}
        </>
    );
}

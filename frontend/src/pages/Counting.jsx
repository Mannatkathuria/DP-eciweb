import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import { apiMessage } from "../config/elections";
import { useLiveEvents } from "../api/live";

// Counting operations for one assembly constituency: plan, staff randomisation, rounds,
// discrepancies, observer reports and the VVPAT draw. No vote figures are entered here: the count
// is the Returning Officer's and figures are published from the official result source.

const ROLES = ["ro", "aro", "counting_supervisor", "counting_assistant", "counting_agent", "counting_observer", "general_observer", "eci"];
const ROUND = { pending: ["Not started", ""], in_progress: ["In progress", "badge-progress"], all_tables_counted: ["All tables recorded", "badge-warn"], completed: ["Completed", "badge-ok"] };
const lines = (v) => v.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

export default function Counting() {
    const { logged, userData } = useContext(AuthContext);
    const [areas, setAreas] = useState([]);
    const [elections, setElections] = useState([]);
    const [pick, setPick] = useState({ area: 0, electionId: "" });
    const [data, setData] = useState(null);
    const [planForm, setPlanForm] = useState({ name: "", address: "", halls: [{ name: "Hall 1", tables: 7 }] });
    const [staff, setStaff] = useState({ supervisors: "", assistants: "" });
    const [disc, setDisc] = useState({ round: "1", table: "1", type: "form17c_mismatch", description: "" });
    const [report, setReport] = useState({ note: "", severity: "routine", round: "" });
    const [witnesses, setWitnesses] = useState("");
    const [dialog, setDialog] = useState(null);
    const [msg, setMsg] = useState({ error: "", notice: "" });
    const [busy, setBusy] = useState(false);
    const allowed = logged && ROLES.includes(userData?.role);

    useEffect(() => {
        if (!allowed) return;
        Promise.all([api.get("/assignments/me"), api.get("/elections")]).then(([a, e]) => {
            const seen = new Set();
            const list = a.data.data.assignments.filter((x) => x.jurisdiction?.constituency && x.jurisdiction?.district).filter((x) => { const k = `${x.jurisdiction.state}|${x.jurisdiction.constituency}`; if (seen.has(k)) return false; seen.add(k); return true; });
            setAreas(list); setElections(e.data.data.items);
            const first = list[0]; const el = e.data.data.items.find((x) => x._id === first?.election || x.name === first?.election) ?? e.data.data.items.find((x) => x.states.includes(first?.jurisdiction.state));
            setPick({ area: 0, electionId: el?._id ?? "" });
        }).catch((err) => setMsg({ error: apiMessage(err, "Could not load your assignments."), notice: "" }));
    }, [allowed]);

    const area = areas[pick.area]?.jurisdiction;
    const params = useMemo(() => area ? { state: area.state, district: area.district, constituency: area.constituency } : null, [area]);
    const load = useCallback(async () => {
        if (!params || !pick.electionId) return;
        try { setData((await api.get(`/counting/${pick.electionId}`, { params })).data.data); }
        catch (err) { setData(null); setMsg({ error: apiMessage(err, "Could not load the counting record."), notice: "" }); }
    }, [params, pick.electionId]);
    useEffect(() => { load(); }, [load]);
    useLiveEvents(() => load(), { enabled: allowed && Boolean(params), types: ["COUNTING_UPDATE_IMPORTED", "EXCEPTION_CREATED", "EXCEPTION_RESOLVED"], pollMs: 20000 });
    useEffect(() => {
        if (!data?.can.plan || !params) return;
        api.get(`/counting/${pick.electionId}/staff`, { params }).then(({ data: r }) => setStaff((s) => s.supervisors || s.assistants ? s : { supervisors: r.data.supervisors.join("\n"), assistants: r.data.assistants.join("\n") })).catch(() => {});
    }, [data?.can.plan, params, pick.electionId]);

    if (!logged) return <Navigate to="/signin" replace />;
    if (!allowed) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setMsg({ error: "", notice: "" });
        try { await fn(); setMsg({ error: "", notice: ok }); await load(); return true; }
        catch (err) { setMsg({ error: apiMessage(err, "The request failed. Nothing was changed."), notice: "" }); return false; }
        finally { setBusy(false); }
    };
    const url = `/counting/${pick.electionId}`;
    const plan = data?.plan;
    const started = plan?.rounds.some((r) => r.status !== "pending");
    const tableStaff = (no) => plan?.halls.flatMap((h) => h.tables).find((t) => t.no === no);

    return (
        <>
            <PageHead title="Counting" crumbs={[{ label: "Counting" }]} lede={data ? `${data.election.name}: ${data.area.constituency}. Counting on ${data.election.countingDate}.` : "Counting operations for your constituency."} />
            <section className="section">
                <div className="container stack">
                    {msg.error && <div className="alert alert-error" role="alert">{msg.error}</div>}
                    {msg.notice && <div className="alert alert-ok" role="status">{msg.notice}</div>}
                    <div className="panel" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div className="field" style={{ margin: 0 }}><label htmlFor="ct-area">Constituency</label>
                            <select id="ct-area" value={pick.area} onChange={(e) => setPick({ ...pick, area: Number(e.target.value) })}>{areas.map((a, i) => <option key={i} value={i}>{a.jurisdiction.constituency}, {a.jurisdiction.state}</option>)}</select></div>
                        <div className="field" style={{ margin: 0 }}><label htmlFor="ct-el">Election</label>
                            <select id="ct-el" value={pick.electionId} onChange={(e) => setPick({ ...pick, electionId: e.target.value })}>{elections.filter((e) => !area || e.states.includes(area.state)).map((e) => <option key={e._id} value={e._id}>{e.name} (counting {e.schedule.countingDate})</option>)}</select></div>
                    </div>
                    {data && <div className="alert alert-warn" role="note">{data.notice}</div>}
                    {data?.myTable && <div className="alert alert-ok">You are at table {data.myTable.no} in {data.myTable.hall}.</div>}

                    {data?.can.plan && !started && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>Counting centre and halls {plan && <small className="muted">(version {plan.version})</small>}</h2>
                            <form className="portal-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post(`${url}/plan`, { ...params, centre: { name: planForm.name, address: planForm.address }, halls: planForm.halls }), "Counting plan saved."); }}>
                                <div className="form-row">
                                    <div className="field"><label htmlFor="ct-cn">Centre</label><input id="ct-cn" value={planForm.name} placeholder={plan?.centre.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} required /></div>
                                    <div className="field"><label htmlFor="ct-ca">Address</label><input id="ct-ca" value={planForm.address} placeholder={plan?.centre.address} onChange={(e) => setPlanForm({ ...planForm, address: e.target.value })} required /></div>
                                </div>
                                {planForm.halls.map((h, i) => (
                                    <div className="form-row" key={i}>
                                        <div className="field"><label htmlFor={`ct-h${i}`}>Hall</label><input id={`ct-h${i}`} value={h.name} onChange={(e) => setPlanForm({ ...planForm, halls: planForm.halls.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} /></div>
                                        <div className="field"><label htmlFor={`ct-t${i}`}>Tables</label><input id={`ct-t${i}`} type="number" min="1" max="30" value={h.tables} onChange={(e) => setPlanForm({ ...planForm, halls: planForm.halls.map((x, j) => j === i ? { ...x, tables: Number(e.target.value) } : x) })} /></div>
                                    </div>
                                ))}
                                <button type="button" className="btn btn-quiet btn-small" onClick={() => setPlanForm({ ...planForm, halls: [...planForm.halls, { name: `Hall ${planForm.halls.length + 1}`, tables: 7 }] })}>Add a hall</button>{" "}
                                <button className="btn btn-primary" disabled={busy}>{plan ? "Replace the plan" : "Save the plan"}</button>
                            </form>
                            {plan && (
                                <form className="portal-form" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); act(() => api.post(`${url}/randomise`, { ...params, supervisors: lines(staff.supervisors), assistants: lines(staff.assistants) }), "Staff allocated to tables at random."); }}>
                                    <h3>Allocate counting staff at random</h3>
                                    <div className="form-row">
                                        <div className="field"><label htmlFor="ct-sup">Counting supervisors (EPIC, one per line)</label><textarea id="ct-sup" rows={4} value={staff.supervisors} onChange={(e) => setStaff({ ...staff, supervisors: e.target.value })} /></div>
                                        <div className="field"><label htmlFor="ct-ass">Counting assistants (EPIC, one per line)</label><textarea id="ct-ass" rows={4} value={staff.assistants} onChange={(e) => setStaff({ ...staff, assistants: e.target.value })} /></div>
                                    </div>
                                    <button className="btn btn-primary" disabled={busy}>Randomise</button>
                                </form>
                            )}
                        </div>
                    )}

                    {plan && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>{plan.centre.name}</h2>
                            <p style={{ marginTop: 0 }}>{plan.centre.address}</p>
                            {plan.halls.map((h) => (
                                <div key={h.id}><h3>{h.name}</h3>
                                    <div className="table-wrap"><table><thead><tr><th>Table</th><th>Supervisor</th><th>Assistant</th></tr></thead>
                                        <tbody>{h.tables.map((t) => <tr key={t.no}><td>{t.no}</td><td>{t.supervisor ? `${t.supervisor.name ?? ""} ${t.supervisor.epic}` : "–"}</td><td>{t.assistant ? `${t.assistant.name ?? ""} ${t.assistant.epic}` : "–"}</td></tr>)}</tbody></table></div>
                                </div>
                            ))}
                            {plan.randomisation && <p><small className="muted">Randomised {new Date(plan.randomisation.at).toLocaleString()} by {plan.randomisation.by}; seed {plan.randomisation.seed}.</small></p>}
                        </div>
                    )}

                    {plan && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>Rounds ({plan.rounds.filter((r) => r.status === "completed").length} of {plan.rounds.length} completed)</h2>
                            <div className="table-wrap"><table>
                                <thead><tr><th>Round</th><th>Tables (polling station part)</th><th>Status</th>{data.can.decide && <th></th>}</tr></thead>
                                <tbody>{plan.rounds.map((r) => (
                                    <tr key={r.no}>
                                        <td>{r.no}</td>
                                        <td>{r.tables.map((t) => {
                                            const mineHere = tableStaff(t.table)?.supervisor?.epic === userData.epic;
                                            return (
                                                <span key={t.table} style={{ display: "inline-block", margin: "0 8px 6px 0" }}>
                                                    <span className={`badge ${t.status === "counted" ? "badge-ok" : ""}`}>T{t.table}: part {t.partNumber}</span>
                                                    {t.status !== "counted" && (mineHere || data.can.decide) && r.status !== "completed" && (
                                                        <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => setDialog({
                                                            title: `Round ${r.no}, table ${t.table}: part ${t.partNumber} counted`, label: "Form 17C Part II completed and signed? Note (optional)", required: false, confirmLabel: "Record as counted", confirmClass: "btn-approve",
                                                            run: (note) => act(() => api.post(`${url}/rounds/${r.no}/tables/${t.table}`, { ...params, form17cPart2Signed: true, note }), `Table ${t.table} recorded for round ${r.no}.`)
                                                        })}>Record</button>
                                                    )}
                                                </span>
                                            );
                                        })}</td>
                                        <td><span className={`badge ${ROUND[r.status][1]}`}>{ROUND[r.status][0]}</span></td>
                                        {data.can.decide && <td>{r.status === "all_tables_counted" && <button className="btn-approve" disabled={busy} onClick={() => act(() => api.post(`${url}/rounds/${r.no}/complete`, params), `Round ${r.no} completed.`)}>Complete round</button>}</td>}
                                    </tr>
                                ))}</tbody>
                            </table></div>
                        </div>
                    )}

                    {plan && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>VVPAT slip verification</h2>
                            {plan.vvpatDraw ? <>
                                <p>Drawn by lot on {new Date(plan.vvpatDraw.at).toLocaleString()} from {plan.vvpatDraw.of} polling stations. Witnesses: {plan.vvpatDraw.witnesses}.</p>
                                <ul>{plan.vvpatDraw.drawn.map((d) => <li key={d.stationId}>Part {d.partNumber}: {d.station}</li>)}</ul>
                                <p><small className="muted">{plan.vvpatDraw.basis}. Seed {plan.vvpatDraw.seed}.</small></p>
                            </> : data.can.decide ? (
                                <form className="portal-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post(`${url}/vvpat-draw`, { ...params, witnesses }), "Draw recorded."); }}>
                                    <div className="field"><label htmlFor="ct-wit">Who witnessed the draw</label><input id="ct-wit" value={witnesses} onChange={(e) => setWitnesses(e.target.value)} required /></div>
                                    <button className="btn btn-primary" disabled={busy}>Draw five polling stations</button>
                                </form>
                            ) : <p>The draw has not been made yet.</p>}
                        </div>
                    )}

                    {plan && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>Discrepancies ({data.discrepancies.length})</h2>
                            {data.can.object && (
                                <form className="portal-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post(`${url}/discrepancies`, { ...params, ...disc }), "Discrepancy reported to the Returning Officer.").then((ok) => ok && setDisc({ ...disc, description: "" })); }}>
                                    <div className="form-row">
                                        <div className="field"><label htmlFor="ds-r">Round</label><input id="ds-r" type="number" min="1" value={disc.round} onChange={(e) => setDisc({ ...disc, round: e.target.value })} /></div>
                                        <div className="field"><label htmlFor="ds-t">Table</label><input id="ds-t" type="number" min="1" value={disc.table} onChange={(e) => setDisc({ ...disc, table: e.target.value })} /></div>
                                        <div className="field"><label htmlFor="ds-ty">Type</label><select id="ds-ty" value={disc.type} onChange={(e) => setDisc({ ...disc, type: e.target.value })}>{Object.entries(data.discrepancyTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                                    </div>
                                    <div className="field"><label htmlFor="ds-d">What you saw</label><input id="ds-d" value={disc.description} onChange={(e) => setDisc({ ...disc, description: e.target.value })} required /></div>
                                    <button className="btn btn-quiet" disabled={busy}>Report discrepancy</button>
                                </form>
                            )}
                            <ul className="rows">{data.discrepancies.map((d) => (
                                <li key={d._id}>
                                    <strong>Round {d.round}, table {d.table}</strong> (part {d.partNumber}): {data.discrepancyTypes[d.type]}. {d.description} <small className="muted">by {d.byRole.replace(/_/g, " ")}{d.candidateName ? ` for ${d.candidateName}` : ""}</small>{" "}
                                    {d.status === "open" ? <span className="badge badge-warn">Open</span> : <span className="badge">{d.decisionText}: {d.note}</span>}
                                    {d.status === "open" && data.can.decide && ["accepted", "rejected", "referred"].map((k) => (
                                        <button key={k} className="btn btn-quiet btn-small" style={{ marginLeft: 6 }} onClick={() => setDialog({ title: `${k[0].toUpperCase()}${k.slice(1)}: round ${d.round}, table ${d.table}`, label: "Your decision and what was done", required: true, confirmLabel: "Record decision", confirmClass: "btn-approve",
                                            run: (note) => act(() => api.post(`${url}/discrepancies/${d._id}/decide`, { ...params, decision: k, note }), "Decision recorded.") })}>{k}</button>
                                    ))}
                                </li>
                            ))}</ul>
                        </div>
                    )}

                    {data && (data.can.report || data.observerReports.length > 0) && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>Observer reports</h2>
                            {data.can.report && (
                                <form className="portal-form" onSubmit={(e) => { e.preventDefault(); act(() => api.post(`${url}/observer-reports`, { ...params, ...report }), "Report filed.").then((ok) => ok && setReport({ ...report, note: "" })); }}>
                                    <div className="form-row">
                                        <div className="field"><label htmlFor="or-s">Severity</label><select id="or-s" value={report.severity} onChange={(e) => setReport({ ...report, severity: e.target.value })}><option value="routine">Routine</option><option value="concern">Concern</option><option value="serious">Serious</option></select></div>
                                        <div className="field"><label htmlFor="or-r">Round (optional)</label><input id="or-r" type="number" min="1" value={report.round} onChange={(e) => setReport({ ...report, round: e.target.value })} /></div>
                                    </div>
                                    <div className="field"><label htmlFor="or-n">Report</label><input id="or-n" value={report.note} onChange={(e) => setReport({ ...report, note: e.target.value })} required /></div>
                                    <button className="btn btn-quiet" disabled={busy}>File report</button>
                                </form>
                            )}
                            <ul className="rows">{data.observerReports.map((r) => <li key={r._id}><span className="badge">{r.severity}</span> {r.round ? `Round ${r.round}: ` : ""}{r.note} <small className="muted">{new Date(r.createdAt).toLocaleTimeString()} by {r.by}</small></li>)}</ul>
                        </div>
                    )}
                </div>
            </section>
            {dialog && <ReasonDialog title={dialog.title} label={dialog.label} required={dialog.required} confirmLabel={dialog.confirmLabel} confirmClass={dialog.confirmClass} busy={busy} error={msg.error}
                onCancel={() => setDialog(null)} onConfirm={(v) => dialog.run(v).then((ok) => ok && setDialog(null))} />}
        </>
    );
}

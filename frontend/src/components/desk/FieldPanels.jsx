// Security (police), polling logistics (sector officers) and nodal officers.
import { useState } from "react";
import api from "../../api/axios";
import { AreaPicker, Badge, Empty, Field, Kpis, Panel, Status, Table, day, label, useAction, useLoad, when } from "./kit";

const CAT_TONE = { normal: "ok", sensitive: "warn", critical: "bad" };

export function SecurityPanel({ area }) {
    const { data, error, loading, reload } = useLoad("/security");
    const [run, st] = useAction(reload);
    const [assess, setAssess] = useState(null);
    const [dep, setDep] = useState({ unit: "", forceType: "capf", duty: "static", strength: "", from: "", to: "", inCharge: "" });
    const [where, setWhere] = useState(area ?? {});
    const [rep, setRep] = useState({ kind: "law_and_order", status: "normal", location: "", details: "" });
    if (loading || error) return <Panel title="Security"><Status loading={loading} error={error} /></Panel>;
    const { can, lists, counts } = data;
    return (
        <>
            <Panel title="Polling station vulnerability" intro={data.notice}>
                <Kpis items={[{ label: "Critical", value: counts.critical, tone: counts.critical ? "bad" : undefined }, { label: "Sensitive", value: counts.sensitive, tone: counts.sensitive ? "warn" : undefined },
                    { label: "Normal", value: counts.normal, tone: "ok" }, { label: "Not yet assessed", value: counts.unassessed, tone: counts.unassessed ? "warn" : undefined },
                    ...Object.entries(data.force).map(([k, v]) => ({ label: `${lists.forceTypes[k]} deployed`, value: v }))]} />
                <div style={{ marginTop: 12 }}>
                    <Table head={["Part", "Polling station", "Constituency", "Category", "Measures", ""]} empty="No approved polling stations in your jurisdiction." rows={data.stations.map((s) => (
                        <tr key={s.stationId}><td>{s.partNumber}</td><td>{s.stationName}</td><td>{s.constituency}</td>
                            <td>{s.assessment ? <><Badge tone={CAT_TONE[s.assessment.category]}>{lists.categories[s.assessment.category]}</Badge><br /><small className="muted">{s.assessment.reasons.map((r) => lists.reasons[r]).join("; ")}</small></> : <span className="muted">Not assessed</span>}</td>
                            <td>{s.assessment ? <small>CAPF {s.assessment.measures.capf} · State police {s.assessment.measures.statePolice} · Home Guards {s.assessment.measures.homeGuards}{s.assessment.measures.microObserver ? " · micro observer" : ""}{s.assessment.measures.webcasting ? " · webcasting" : ""}</small> : "—"}</td>
                            <td>{can.plan && <button className="btn btn-quiet btn-small" onClick={() => setAssess({ stationId: s.stationId, name: s.stationName, category: s.assessment?.category ?? "normal", reasons: s.assessment?.reasons ?? [], capf: s.assessment?.measures.capf ?? 0, statePolice: s.assessment?.measures.statePolice ?? 0, homeGuards: s.assessment?.measures.homeGuards ?? 0, microObserver: s.assessment?.measures.microObserver ?? false, webcasting: s.assessment?.measures.webcasting ?? false, note: "" })}>Assess</button>}</td></tr>
                    ))} />
                </div>
                {assess && (
                    <form className="desk-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/security/stations/${assess.stationId}/assessment`, assess), "Assessment saved.").then((ok) => ok && setAssess(null)); }}>
                        <p className="wide"><strong>{assess.name}</strong></p>
                        <Field id="sa-cat" text="Category"><select id="sa-cat" value={assess.category} onChange={(e) => setAssess({ ...assess, category: e.target.value })}>{Object.entries(lists.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        {["capf", "statePolice", "homeGuards"].map((k) => <Field key={k} id={`sa-${k}`} text={{ capf: "CAPF personnel", statePolice: "State police", homeGuards: "Home Guards" }[k]}><input id={`sa-${k}`} inputMode="numeric" value={assess[k]} onChange={(e) => setAssess({ ...assess, [k]: e.target.value })} /></Field>)}
                        <fieldset className="wide" style={{ border: 0, padding: 0 }}><legend>Reasons</legend>
                            {Object.entries(lists.reasons).map(([k, v]) => <label key={k} className="check" style={{ display: "inline-flex", marginRight: 14 }}><input type="checkbox" checked={assess.reasons.includes(k)} onChange={(e) => setAssess({ ...assess, reasons: e.target.checked ? [...assess.reasons, k] : assess.reasons.filter((x) => x !== k) })} /> {v}</label>)}
                        </fieldset>
                        <label className="check"><input type="checkbox" checked={assess.microObserver} onChange={(e) => setAssess({ ...assess, microObserver: e.target.checked })} /> Micro observer needed</label>
                        <label className="check"><input type="checkbox" checked={assess.webcasting} onChange={(e) => setAssess({ ...assess, webcasting: e.target.checked })} /> Webcasting</label>
                        <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Save assessment</button> <button type="button" className="btn btn-quiet" onClick={() => setAssess(null)}>Cancel</button></div>
                    </form>
                )}
                <Status error={st.error} notice={st.notice} />
            </Panel>

            <Panel title="Force deployment">
                {can.plan && (
                    <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/security/deployments", { ...where, ...dep }), "Deployment planned."); }}>
                        <AreaPicker value={where} onChange={setWhere} level={where.constituency ? "constituency" : "district"} />
                        <Field id="dp-unit" text="Unit"><input id="dp-unit" value={dep.unit} onChange={(e) => setDep({ ...dep, unit: e.target.value })} required placeholder="e.g. 2 coys, 45 Bn CRPF" /></Field>
                        <Field id="dp-ft" text="Force"><select id="dp-ft" value={dep.forceType} onChange={(e) => setDep({ ...dep, forceType: e.target.value })}>{Object.entries(lists.forceTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <Field id="dp-duty" text="Duty"><select id="dp-duty" value={dep.duty} onChange={(e) => setDep({ ...dep, duty: e.target.value })}>{Object.entries(lists.duties).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <Field id="dp-str" text="Strength"><input id="dp-str" inputMode="numeric" value={dep.strength} onChange={(e) => setDep({ ...dep, strength: e.target.value })} required /></Field>
                        <Field id="dp-from" text="From"><input id="dp-from" type="date" value={dep.from} onChange={(e) => setDep({ ...dep, from: e.target.value })} required /></Field>
                        <Field id="dp-to" text="To"><input id="dp-to" type="date" value={dep.to} onChange={(e) => setDep({ ...dep, to: e.target.value })} required /></Field>
                        <Field id="dp-ic" text="Officer in charge"><input id="dp-ic" value={dep.inCharge} onChange={(e) => setDep({ ...dep, inCharge: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Add deployment</button></div>
                    </form>
                )}
                <div style={{ marginTop: 12 }}>
                    <Table head={["Unit", "Force", "Duty", "#Strength", "Area", "Period", "Status", ""]} empty="No deployments recorded." rows={data.deployments.map((d) => (
                        <tr key={d._id}><td>{d.unit}{d.inCharge ? <><br /><small>{d.inCharge}</small></> : null}</td><td>{lists.forceTypes[d.forceType]}</td><td>{lists.duties[d.duty]}</td><td className="num">{d.strength}</td>
                            <td>{d.jurisdiction.constituency ?? d.jurisdiction.district}</td><td>{day(d.from)} – {day(d.to)}</td><td><Badge tone={d.status === "deployed" ? "ok" : d.status === "withdrawn" ? undefined : "warn"}>{label(d.status)}</Badge></td>
                            <td>{(can.plan || can.coordinate) && d.status !== "withdrawn" && <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/security/deployments/${d._id}`, { status: d.status === "planned" ? "deployed" : "withdrawn" }))}>{d.status === "planned" ? "Mark deployed" : "Withdraw"}</button>}</td></tr>
                    ))} />
                </div>
            </Panel>

            <Panel title="Situation reports">
                {can.coordinate && (
                    <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/security/sitreps", { ...where, ...rep }), "Report sent.").then((ok) => ok && setRep({ ...rep, details: "" })); }}>
                        {!can.plan && <AreaPicker value={where} onChange={setWhere} />}
                        <Field id="sr-k" text="Subject"><select id="sr-k" value={rep.kind} onChange={(e) => setRep({ ...rep, kind: e.target.value })}>{Object.entries(lists.sitrepKinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <Field id="sr-s" text="Status"><select id="sr-s" value={rep.status} onChange={(e) => setRep({ ...rep, status: e.target.value })}><option value="normal">Normal</option><option value="alert">Alert</option><option value="incident">Incident</option></select></Field>
                        <Field id="sr-l" text="Location"><input id="sr-l" value={rep.location} onChange={(e) => setRep({ ...rep, location: e.target.value })} /></Field>
                        <Field id="sr-d" text="Details" wide><textarea id="sr-d" rows={2} value={rep.details} onChange={(e) => setRep({ ...rep, details: e.target.value })} required minLength={5} /></Field>
                        <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Send report</button></div>
                    </form>
                )}
                <ul className="rows" style={{ marginTop: 12 }}>
                    {data.sitreps.length ? data.sitreps.map((r) => <li key={r._id}><Badge tone={r.status === "incident" ? "bad" : r.status === "alert" ? "warn" : "ok"}>{label(r.status)}</Badge> <strong>{lists.sitrepKinds[r.kind]}</strong> · {r.jurisdiction.constituency ?? r.jurisdiction.district}{r.location ? `, ${r.location}` : ""} · {when(r.at)} · {r.by.epic}<br /><small>{r.details}</small></li>) : <li className="muted">No reports.</li>}
                </ul>
            </Panel>
        </>
    );
}

export function LogisticsPanel() {
    const { data, error, loading, reload } = useLoad("/logistics");
    const [run, st] = useAction(reload);
    const [pick, setPick] = useState({});
    if (loading || error) return <Panel title="Polling logistics"><Status loading={loading} error={error} /></Panel>;
    if (!data.election) return <Panel title="Polling logistics"><Empty>No election has been announced.</Empty></Panel>;
    return (
        <Panel title={`Polling logistics · ${data.election.name}`} intro="Movement of polling parties and custody of the machines, station by station, from dispatch to the sealed strong room. Each step is added, never edited.">
            <Kpis items={Object.entries(data.byStep).filter(([, v]) => v).map(([k, v]) => ({ label: data.steps[k], value: v }))} />
            <div style={{ marginTop: 12 }}>
                <Table head={["Part", "Polling station", "Last step", "Progress", ""]} empty="No approved stations in your jurisdiction." rows={data.stations.map((s) => (
                    <tr key={s.stationId}><td>{s.partNumber}</td><td>{s.stationName}<br /><small className="muted">{s.constituency}</small></td>
                        <td>{s.last ? <>{data.steps[s.last.step]}<br /><small className="muted">{when(s.last.at)} · {s.last.by.epic}{s.last.vehicle ? ` · ${s.last.vehicle}` : ""}</small></> : <span className="muted">Not started</span>}</td>
                        <td style={{ minWidth: 110 }}><div className="meter"><span style={{ width: `${s.progress}%` }} /></div></td>
                        <td>{data.can.record && <div className="desk-actions" style={{ marginTop: 0 }}>
                            <select aria-label={`Next step for ${s.stationName}`} value={pick[s.stationId] ?? ""} onChange={(e) => setPick({ ...pick, [s.stationId]: e.target.value })}>
                                <option value="">Record a step…</option>{Object.entries(data.steps).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <button className="btn btn-quiet btn-small" disabled={!pick[s.stationId] || st.busy} onClick={() => run(() => api.post(`/logistics/stations/${s.stationId}`, { electionId: data.election._id, step: pick[s.stationId] }), "Recorded.")}>Save</button>
                        </div>}</td></tr>
                ))} />
            </div>
            <Status error={st.error} notice={st.notice} />
        </Panel>
    );
}

const N_TONE = { on_track: "ok", at_risk: "warn", blocked: "bad" };
export function NodalPanel({ area }) {
    const { data, error, loading, reload } = useLoad("/nodal");
    const [run, st] = useAction(reload);
    const [r, setR] = useState({ progressPercent: 0, status: "on_track", summary: "", issues: "" });
    const [t, setT] = useState({ function: "evm", title: "", details: "", dueDate: "" });
    const [where, setWhere] = useState(area ?? {});
    const [taskNote, setTaskNote] = useState({});
    const [des, setDes] = useState({ epic: "", function: "evm" });
    if (loading || error) return <Panel title="Nodal functions"><Status loading={loading} error={error} /></Panel>;
    const { can, functions } = data;
    return (
        <>
            {can.report && (
                <Panel title={`Your subject: ${data.mine.map((m) => functions[m.function]).join(", ")}`} intro="Report progress on your subject only. Your designation gives no power over statutory officers or other subjects.">
                    <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/nodal/reports", r), "Report filed.").then((ok) => ok && setR({ ...r, summary: "", issues: "" })); }}>
                        <Field id="nr-p" text={`Progress: ${r.progressPercent}%`}><input id="nr-p" type="range" min={0} max={100} step={5} value={r.progressPercent} onChange={(e) => setR({ ...r, progressPercent: Number(e.target.value) })} /></Field>
                        <Field id="nr-s" text="Status"><select id="nr-s" value={r.status} onChange={(e) => setR({ ...r, status: e.target.value })}><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="blocked">Blocked</option></select></Field>
                        <Field id="nr-sum" text="Summary" wide><textarea id="nr-sum" rows={2} value={r.summary} onChange={(e) => setR({ ...r, summary: e.target.value })} required minLength={10} /></Field>
                        <Field id="nr-i" text="Issues needing the DEO / CEO" wide><input id="nr-i" value={r.issues} onChange={(e) => setR({ ...r, issues: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary" disabled={st.busy}>File progress report</button></div>
                    </form>
                </Panel>
            )}
            {can.coordinate && (
                <Panel title="Functions at a glance" intro="The latest report from each nodal subject in your jurisdiction.">
                    <Table head={["Subject", "Area", "Progress", "Status", "Last report"]} empty="No nodal reports yet." rows={data.latest.map((x) => (
                        <tr key={x._id}><td>{functions[x.function]}</td><td>{x.jurisdiction.district ?? x.jurisdiction.state}</td><td style={{ minWidth: 120 }}><div className={`meter${x.status === "blocked" ? " is-bad" : x.status === "at_risk" ? " is-warn" : ""}`}><span style={{ width: `${x.progressPercent}%` }} /></div><small>{x.progressPercent}%</small></td>
                            <td><Badge tone={N_TONE[x.status]}>{label(x.status)}</Badge></td><td><small>{when(x.at)} · {x.summary}</small>{x.issues ? <><br /><small><strong>Issues:</strong> {x.issues}</small></> : null}</td></tr>
                    ))} />
                    <h3>Designate a nodal officer</h3>
                    <form className="desk-form" onSubmit={(e) => { e.preventDefault();
                        const district = area?.district;
                        run(() => api.post("/assignments", { epic: des.epic.trim().toUpperCase(), role: district ? "district_nodal_officer" : "state_nodal_officer", function: des.function,
                            jurisdiction: district ? { state: area.state, district } : { state: area?.state } }), "Nodal officer designated.").then((ok) => ok && setDes({ ...des, epic: "" })); }}>
                        <Field id="nd-e" text="Officer's identifier (EPIC)"><input id="nd-e" value={des.epic} onChange={(e) => setDes({ ...des, epic: e.target.value })} required /></Field>
                        <Field id="nd-f" text="Subject"><select id="nd-f" value={des.function} onChange={(e) => setDes({ ...des, function: e.target.value })}>{Object.entries(functions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <div><button className="btn btn-quiet" disabled={st.busy}>Designate</button></div>
                    </form>
                    <h3>Give a task to a subject</h3>
                    <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/nodal/tasks", { ...where, ...t }), "Task given.").then((ok) => ok && setT({ ...t, title: "", details: "" })); }}>
                        <AreaPicker value={where} onChange={setWhere} level={where.district ? "district" : area?.district ? "district" : "state"} />
                        <Field id="nt-f" text="Subject"><select id="nt-f" value={t.function} onChange={(e) => setT({ ...t, function: e.target.value })}>{Object.entries(functions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <Field id="nt-d" text="Due by"><input id="nt-d" type="date" value={t.dueDate} onChange={(e) => setT({ ...t, dueDate: e.target.value })} /></Field>
                        <Field id="nt-t" text="Task" wide><input id="nt-t" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} required minLength={5} /></Field>
                        <Field id="nt-x" text="Details" wide><textarea id="nt-x" rows={2} value={t.details} onChange={(e) => setT({ ...t, details: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Give task</button></div>
                    </form>
                </Panel>
            )}
            <Panel title="Tasks">
                {data.tasks.length ? data.tasks.map((x) => (
                    <div className="desk-item" key={x._id}>
                        <h4>{x.title} <Badge tone={x.status === "done" ? "ok" : x.status === "in_progress" ? "info" : "warn"}>{data.taskStatus[x.status]}</Badge></h4>
                        <p className="meta">{functions[x.function]} · {x.jurisdiction.district ?? x.jurisdiction.state} · from {x.createdBy.epic}{x.dueDate ? ` · due ${day(x.dueDate)}` : ""}</p>
                        {x.details && <p style={{ margin: "4px 0" }}>{x.details}</p>}
                        {x.updates.map((u, i) => <p key={i} className="meta">{label(u.status)} · {u.by.epic} · {when(u.at)}{u.note ? `: ${u.note}` : ""}</p>)}
                        {x.status !== "done" && (
                            <div className="desk-actions">
                                <input aria-label="Note" placeholder="Note" value={taskNote[x._id] ?? ""} onChange={(e) => setTaskNote({ ...taskNote, [x._id]: e.target.value })} style={{ flex: "1 1 220px" }} />
                                <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/nodal/tasks/${x._id}`, { status: "in_progress", note: taskNote[x._id] }))}>In progress</button>
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/nodal/tasks/${x._id}`, { status: "done", note: taskNote[x._id] }))}>Done</button>
                            </div>
                        )}
                    </div>
                )) : <Empty>No tasks.</Empty>}
                <Status error={st.error} notice={st.notice} />
            </Panel>
        </>
    );
}

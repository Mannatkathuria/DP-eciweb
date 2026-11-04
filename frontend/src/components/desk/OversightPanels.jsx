// Observer reports (confidential, to the Commission) and Commission directions with compliance.
import { useState } from "react";
import api from "../../api/axios";
import { AreaPicker, Badge, Empty, Field, Panel, Status, label, useAction, useLoad, when } from "./kit";

const SEV = { routine: undefined, concern: "info", serious: "warn", critical: "bad" };
const R_STATUS = { submitted: "Submitted", acknowledged: "Acknowledged", information_sought: "Information sought", direction_issued: "Direction issued", closed: "Closed" };

/** File (observers), review (Commission) or read (DEO). */
export function ObserverReports({ area, canFile }) {
    const { data, error, loading, reload } = useLoad("/oversight/observer-reports");
    const [run, st] = useAction(reload);
    const [f, setF] = useState({ topic: "poll_day", severity: "routine", title: "", facts: "", recommendation: "", pollingStation: "" });
    const [reply, setReply] = useState({});
    const [where, setWhere] = useState(area ?? {});
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const can = data?.can ?? {};
    return (
        <Panel title="Observer reports" intro="Factual reports to the Commission's observer channel. They are confidential: they are not shown to candidates, agents or the officers being observed, except the DEO for the district.">
            {canFile && (
                <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/oversight/observer-reports", { ...where, ...f }), "Report filed.").then((ok) => ok && setF({ ...f, title: "", facts: "", recommendation: "" })); }}>
                    <AreaPicker value={where} onChange={setWhere} />
                    <Field id="or-topic" text="Topic"><select id="or-topic" value={f.topic} onChange={set("topic")}>{Object.entries(data?.topics ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                    <Field id="or-sev" text="Severity"><select id="or-sev" value={f.severity} onChange={set("severity")}>{Object.keys(SEV).map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
                    <Field id="or-ps" text="Polling station (optional)"><input id="or-ps" value={f.pollingStation} onChange={set("pollingStation")} /></Field>
                    <Field id="or-title" text="Title" wide><input id="or-title" value={f.title} onChange={set("title")} required minLength={5} /></Field>
                    <Field id="or-facts" text="Facts observed (what, where, when, who was present)" wide><textarea id="or-facts" rows={4} value={f.facts} onChange={set("facts")} required minLength={20} /></Field>
                    <Field id="or-rec" text="Recommendation (optional)" wide><textarea id="or-rec" rows={2} value={f.recommendation} onChange={set("recommendation")} /></Field>
                    <div className="wide"><button className="btn btn-primary" disabled={st.busy}>File report</button></div>
                </form>
            )}
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && (data.items.length ? data.items.map((r) => (
                <div className="desk-item" key={r._id}>
                    <h4>{r.title} <Badge tone={SEV[r.severity]}>{label(r.severity)}</Badge> <Badge>{R_STATUS[r.status] ?? r.status}</Badge></h4>
                    <p className="meta">{label(r.kind)} observer {r.filedBy.epic} · {data.topics[r.topic]} · {r.jurisdiction.constituency ?? r.jurisdiction.district ?? r.jurisdiction.state}{r.pollingStation ? ` · ${r.pollingStation}` : ""} · {when(r.filedAt)}</p>
                    <p style={{ margin: "6px 0" }}>{r.facts}</p>
                    {r.recommendation && <p className="meta">Recommendation: {r.recommendation}</p>}
                    {r.review.map((x, i) => <p key={i} className="meta">{label(x.action)} by {x.by.epic} ({when(x.at)}){x.note ? `: ${x.note}` : ""}</p>)}
                    {can.review && r.status !== "closed" && (
                        <div className="desk-actions">
                            <input aria-label="Note" placeholder="Note" value={reply[r._id] ?? ""} onChange={(e) => setReply({ ...reply, [r._id]: e.target.value })} style={{ flex: "1 1 240px" }} />
                            {["acknowledge", "seek_information", "close"].map((a) => <button key={a} className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/oversight/observer-reports/${r._id}/review`, { action: a, note: reply[r._id] }))}>{label(a)}</button>)}
                        </div>
                    )}
                    {canFile && r.status === "information_sought" && (
                        <div className="desk-actions">
                            <input aria-label="Additional information" placeholder="Additional information" value={reply[r._id] ?? ""} onChange={(e) => setReply({ ...reply, [r._id]: e.target.value })} style={{ flex: "1 1 240px" }} />
                            <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/oversight/observer-reports/${r._id}/supplement`, { note: reply[r._id] }), "Sent.")}>Send</button>
                        </div>
                    )}
                </div>
            )) : <Empty>No reports.</Empty>)}
        </Panel>
    );
}

const D_TONE = { issued: "warn", complied: "info", closed: "ok" };

/** Commission issues; addressees comply; others follow. */
export function Directions({ canIssue }) {
    const { data, error, loading, reload } = useLoad("/oversight/directions");
    const reports = useLoad(canIssue ? "/oversight/observer-reports" : null);
    const [run, st] = useAction(reload);
    const [where, setWhere] = useState({});
    const [f, setF] = useState({ addressedTo: "deo", legalBasis: "administrative", instruction: "", dueDate: "", subjectType: "general", subjectId: "" });
    const [answer, setAnswer] = useState({});
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    return (
        <Panel title="Commission directions" intro={canIssue ? "Directions to field officers under a named legal basis. The addressee reports compliance; you close the direction when satisfied." : "Directions of the Commission that concern your jurisdiction. Directions addressed to your role need a compliance report."}>
            {canIssue && (
                <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/oversight/directions", { ...where, ...f }), "Direction issued.").then((ok) => ok && setF({ ...f, instruction: "" })); }}>
                    <AreaPicker value={where} onChange={setWhere} level={["ro", "ero", "sector_officer", "presiding_officer"].includes(f.addressedTo) ? "constituency" : ["ceo", "state_police_nodal"].includes(f.addressedTo) ? "state" : "district"} />
                    <Field id="di-to" text="Addressed to"><select id="di-to" value={f.addressedTo} onChange={set("addressedTo")}>{(data?.addressees ?? []).map((a) => <option key={a} value={a}>{label(a)}</option>)}</select></Field>
                    <Field id="di-basis" text="Legal basis"><select id="di-basis" value={f.legalBasis} onChange={set("legalBasis")}>{Object.entries(data?.basis ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                    <Field id="di-due" text="Comply by"><input id="di-due" type="date" value={f.dueDate} onChange={set("dueDate")} /></Field>
                    <Field id="di-subj" text="About"><select id="di-subj" value={f.subjectType === "incident" ? "incident" : f.subjectId ? `observer_report:${f.subjectId}` : "general"} onChange={(e) => { const [t, id] = e.target.value.split(":"); setF({ ...f, subjectType: t, subjectId: id ?? "" }); }}>
                        <option value="general">A general matter</option>
                        <option value="incident">A poll-day incident referred to the Commission</option>
                        {(reports.data?.items ?? []).filter((r) => r.status !== "closed").map((r) => <option key={r._id} value={`observer_report:${r._id}`}>Observer report: {r.title}</option>)}
                    </select></Field>
                    {f.subjectType === "incident" && <Field id="di-inc" text="Incident reference (from the control room)"><input id="di-inc" value={f.subjectId} onChange={set("subjectId")} required /></Field>}
                    <Field id="di-ins" text="Instruction" wide><textarea id="di-ins" rows={3} value={f.instruction} onChange={set("instruction")} required minLength={10} /></Field>
                    <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Issue direction</button> <small className="muted">A fresh one-time code is asked for.</small></div>
                </form>
            )}
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && (data.items.length ? data.items.map((d) => (
                <div className="desk-item" key={d._id}>
                    <h4>{d.reference} → {label(d.addressedTo)}, {d.jurisdiction.constituency ?? d.jurisdiction.district ?? d.jurisdiction.state} <Badge tone={D_TONE[d.status]}>{d.statusText}</Badge></h4>
                    <p className="meta">{data.basis[d.legalBasis]} · issued {when(d.issuedAt)} by {d.issuedBy.epic}{d.dueDate ? ` · comply by ${d.dueDate}` : ""}{d.subject.type !== "general" ? ` · about ${label(d.subject.type)}` : ""}</p>
                    <p style={{ margin: "6px 0" }}>{d.instruction}</p>
                    {d.compliance.map((c, i) => <p key={i} className="meta">{c.returned ? "Returned" : "Compliance"} by {c.by.epic} ({when(c.at)}): {c.note}{c.evidence ? ` · evidence: ${c.evidence}` : ""}</p>)}
                    {d.mine && d.status === "issued" && (
                        <div className="desk-actions">
                            <input aria-label="Action taken" placeholder="Action taken" value={answer[d._id] ?? ""} onChange={(e) => setAnswer({ ...answer, [d._id]: e.target.value })} style={{ flex: "1 1 280px" }} />
                            <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/oversight/directions/${d._id}/comply`, { note: answer[d._id] }), "Compliance reported.")}>Report compliance</button>
                        </div>
                    )}
                    {canIssue && d.status === "complied" && (
                        <div className="desk-actions">
                            <input aria-label="Note" placeholder="Note (required to return)" value={answer[d._id] ?? ""} onChange={(e) => setAnswer({ ...answer, [d._id]: e.target.value })} style={{ flex: "1 1 240px" }} />
                            <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/oversight/directions/${d._id}/close`, { note: answer[d._id] }), "Closed.")}>Close</button>
                            <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/oversight/directions/${d._id}/close`, { accept: false, note: answer[d._id] }), "Returned to the addressee.")}>Return</button>
                        </div>
                    )}
                </div>
            )) : <Empty>No directions.</Empty>)}
        </Panel>
    );
}

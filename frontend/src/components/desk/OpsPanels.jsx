// Panels for district/state administration and roll supervision: consolidated reports, the
// polling-station change workflow (RP Act 1951, s. 25), station issues, the BLO team, the roll of
// a part, and the audit trail.
import { useState } from "react";
import api from "../../api/axios";
import { Badge, Empty, Field, Kpis, Panel, Status, Table, day, downloadCsv, inr, label, useAction, useLoad, when } from "./kit";

const sum = (o) => Object.values(o ?? {}).reduce((n, v) => n + v, 0);
const LEVEL = { state: "State/UT", district: "District", constituency: "Constituency" };

/** The consolidated report for the caller's jurisdiction, with a CSV download. */
export function SummaryPanel({ title = "Report for your jurisdiction", focus = "all" }) {
    const { data, error, loading, reload } = useLoad("/reports/summary");
    if (loading || error) return <Panel title={title}><Status loading={loading} error={error} /></Panel>;
    const d = data;
    const items = [
        { label: "Electors on the roll", value: d.roll.electors.toLocaleString("en-IN") },
        { label: "Applications awaiting action", value: d.roll.pendingApplications, tone: d.roll.pendingApplications ? "warn" : "ok" },
        focus !== "roll" && { label: "Approved polling stations", value: d.stations.byStatus.ACTIVE ?? 0 },
        focus !== "roll" && { label: "Station changes in progress", value: d.stations.pendingChanges, tone: d.stations.pendingChanges ? "warn" : undefined },
        focus !== "roll" && { label: "Open incidents", value: d.incidents.open, tone: d.incidents.bySeverity.critical ? "bad" : d.incidents.open ? "warn" : "ok" },
        focus !== "roll" && { label: "Staff on assignment", value: d.staff.active },
        focus !== "roll" && { label: "Nominations", value: sum(d.nominations) },
        focus !== "roll" && { label: "Campaign permissions pending", value: (d.permissions.applied ?? 0) + (d.permissions.with_ro ?? 0) },
        focus !== "roll" && d.expenditure.entries > 0 && { label: "Expenditure reported", value: inr(d.expenditure.total) },
        d.observerReports && { label: "Open observer reports", value: d.observerReports.open, tone: d.observerReports.bySeverity.critical ? "bad" : d.observerReports.open ? "warn" : undefined },
        { label: "Open Commission directions", value: d.directions.issued ?? 0, tone: d.directions.issued ? "warn" : undefined }
    ];
    return (
        <Panel title={title} intro={`Counts only, from the records in your jurisdiction. Generated ${when(d.generatedAt)}.`}
            actions={<div className="row-actions"><button className="btn btn-quiet btn-small" onClick={reload}>Refresh</button>
                <button className="btn btn-quiet btn-small" disabled={!d.breakdown.length} onClick={() => downloadCsv(`report-${d.level}-${d.generatedAt.slice(0, 10)}.csv`, d.breakdown)}>Download CSV</button></div>}>
            <Kpis items={items} />
            {d.elections.length > 0 && <p className="muted" style={{ marginTop: 12 }}>Elections: {d.elections.map((e) => `${e.name} (${label(e.stage)}, poll ${day(e.pollDate)})`).join(" · ")}</p>}
            <details style={{ marginTop: 12 }} open={focus !== "roll"}>
                <summary>By {LEVEL[d.level]?.toLowerCase() ?? "area"} ({d.breakdown.length})</summary>
                <Table head={[LEVEL[d.level] ?? "Area", "#Electors", "#Pending applications", "#Stations", "#Station changes", "#Open incidents", "#Nominations"]} rows={d.breakdown.map((r) => (
                    <tr key={r.area}><td>{r.area}</td><td className="num">{r.electors}</td><td className="num">{r.pendingApplications}</td><td className="num">{r.stations}</td><td className="num">{r.stationsPending}</td><td className="num">{r.openIncidents}</td><td className="num">{r.nominations}</td></tr>
                ))} />
            </details>
            <details style={{ marginTop: 8 }}>
                <summary>Roll work in detail</summary>
                <dl className="facts">
                    <dt>Form 6</dt><dd>{Object.entries(d.roll.form6).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || "—"}</dd>
                    <dt>Form 8 (from voter accounts)</dt><dd>{Object.entries(d.roll.form8).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || "—"}</dd>
                    <dt>Form 7 objections</dt><dd>{Object.entries(d.roll.form7).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || "—"}</dd>
                    <dt>Forms 2, 2A, 3, 6A, 6B, 7, 8</dt><dd>{Object.entries(d.roll.otherForms).map(([k, v]) => `${k.replace("FORM_", "Form ").replace(":", " ")} ${v}`).join(" · ") || "—"}</dd>
                    <dt>Service / overseas / PwD electors</dt><dd>{d.roll.serviceVoters} / {d.roll.overseasElectors} / {d.roll.pwd}</dd>
                    <dt>New-voter tasks</dt><dd>{Object.entries(d.roll.newVoterTasks).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || "—"}</dd>
                    <dt>Staff by role</dt><dd>{Object.entries(d.staff.byRole).map(([k, v]) => `${label(k)} ${v}`).join(" · ") || "—"}</dd>
                </dl>
            </details>
        </Panel>
    );
}

const STAGES = ["DISTRICT_REVIEW", "STAKEHOLDER_CONSULTATION", "SENT_TO_CEO", "SENT_TO_ECI", "ECI_APPROVED"];
const STAGE_SHORT = { DISTRICT_REVIEW: "Draft", STAKEHOLDER_CONSULTATION: "Consulted", SENT_TO_CEO: "With CEO", SENT_TO_ECI: "With ECI", ECI_APPROVED: "ECI approved", CLARIFICATION_REQUIRED: "Clarification" };

function StageLine({ stage }) {
    const at = stage === "CLARIFICATION_REQUIRED" ? 1 : STAGES.indexOf(stage);
    return <ol className="steps-line">{STAGES.map((s, i) => <li key={s} className={i < at ? "done" : i === at ? "now" : ""}>{STAGE_SHORT[s]}</li>)}<li className={stage === "CLARIFICATION_REQUIRED" ? "now" : ""}>Published</li></ol>;
}

/** role: "deo" (consult, forward, publish), "ceo" (forward or return), "eci" (clarify, approve, reject). */
export function StationWorkflow({ role }) {
    const { data, error, loading, reload } = useLoad("/polling-stations", { pending: "1" });
    const [run, st] = useAction(reload);
    const [f, setF] = useState({});
    const val = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    const items = data?.items ?? [];
    const mine = items.filter((s) => {
        const stage = s.pendingChange.stage;
        if (role === "deo") return ["DISTRICT_REVIEW", "STAKEHOLDER_CONSULTATION", "CLARIFICATION_REQUIRED", "ECI_APPROVED"].includes(stage);
        if (role === "ceo") return stage === "SENT_TO_CEO";
        return stage === "SENT_TO_ECI";
    });
    return (
        <Panel title="Polling-station changes (RP Act 1951, s. 25)"
            intro={role === "deo" ? "Draft, consult the recognised parties, forward through the CEO; after the Commission's prior approval, issue the final order and publish."
                : role === "ceo" ? "Scrutinise the DEO's reasoned proposal and the consultation record, then forward it to the Commission with your remarks, or return it."
                    : "Give prior approval with the Commission's order reference, ask for clarification, or reject. The DEO publishes after approval."}>
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && (mine.length ? mine.map((s) => {
                const c = s.pendingChange;
                return (
                    <div className="desk-item" key={s._id}>
                        <h4>{c.type === "create" ? "New station" : "Relocation"}: {c.proposed.name} <Badge tone={c.stage === "ECI_APPROVED" ? "ok" : "warn"}>{c.stageText}</Badge></h4>
                        <p className="meta">Part {s.partNumber}, {s.constituency}, {s.district} · {c.proposed.address}{c.type === "relocate" ? ` · from ${s.name}` : ""}{c.reason ? ` · reason: ${c.reason}` : ""}</p>
                        <StageLine stage={c.stage} />
                        {c.consultation && <p className="meta">Consulted {c.consultation.parties} on {day(c.consultation.meetingDate)}: {c.consultation.outcome}{c.consultation.objections ? ` · objections: ${c.consultation.objections}` : ""}</p>}
                        {(c.steps ?? []).filter((x) => x.note).slice(-3).map((x, i) => <p key={i} className="meta">{STAGE_SHORT[x.stage] ?? x.stage} · {x.by} ({label(x.role)}): {x.note}</p>)}
                        {c.eciApproval && <p className="meta">Commission's approval: {c.eciApproval.reference} ({when(c.eciApproval.at)})</p>}
                        {role === "deo" && ["DISTRICT_REVIEW", "STAKEHOLDER_CONSULTATION", "CLARIFICATION_REQUIRED"].includes(c.stage) && (
                            <div className="desk-form" style={{ marginTop: 10 }}>
                                <Field id={`cs-p-${s._id}`} text="Parties consulted"><input id={`cs-p-${s._id}`} value={val(s._id, "parties")} onChange={set(s._id, "parties")} /></Field>
                                <Field id={`cs-d-${s._id}`} text="Meeting date"><input id={`cs-d-${s._id}`} type="date" value={val(s._id, "meetingDate")} onChange={set(s._id, "meetingDate")} /></Field>
                                <Field id={`cs-o-${s._id}`} text="Outcome"><input id={`cs-o-${s._id}`} value={val(s._id, "outcome")} onChange={set(s._id, "outcome")} /></Field>
                                <Field id={`cs-x-${s._id}`} text="Objections received"><input id={`cs-x-${s._id}`} value={val(s._id, "objections")} onChange={set(s._id, "objections")} /></Field>
                                <div className="wide desk-actions">
                                    <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/consultation`, f[s._id] ?? {}))}>Record consultation</button>
                                    <input aria-label="Note to the CEO" placeholder={c.stage === "CLARIFICATION_REQUIRED" ? "Clarification asked for (required)" : "Note to the CEO"} value={val(s._id, "note")} onChange={set(s._id, "note")} style={{ flex: "1 1 220px" }} />
                                    <button className="btn btn-primary btn-small" disabled={st.busy || !c.consultation} onClick={() => run(() => api.post(`/polling-stations/${s._id}/forward`, { note: val(s._id, "note") }))}>Forward to the CEO</button>
                                </div>
                            </div>
                        )}
                        {role === "deo" && c.stage === "ECI_APPROVED" && (
                            <div className="desk-actions">
                                <input aria-label="DEO order number" placeholder="Your final order number (optional)" value={val(s._id, "orderReference")} onChange={set(s._id, "orderReference")} style={{ flex: "1 1 220px" }} />
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/publish`, { orderReference: val(s._id, "orderReference") }))}>Issue order and publish</button>
                            </div>
                        )}
                        {role === "ceo" && (
                            <div className="desk-actions">
                                <input aria-label="CEO's remarks" placeholder="Your remarks (required)" value={val(s._id, "remarks")} onChange={set(s._id, "remarks")} style={{ flex: "1 1 260px" }} />
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/ceo-forward`, { remarks: val(s._id, "remarks") }))}>Forward to the Commission</button>
                                <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/ceo-forward`, { remarks: val(s._id, "remarks"), return: true }))}>Return to the DEO</button>
                            </div>
                        )}
                        {role === "eci" && (
                            <div className="desk-actions">
                                <input aria-label="Commission order reference" placeholder="Order reference, e.g. ECI/464/PS/2026" value={val(s._id, "eciReference")} onChange={set(s._id, "eciReference")} style={{ flex: "1 1 220px" }} />
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/approve`, { eciReference: val(s._id, "eciReference") }))}>Give prior approval</button>
                                <input aria-label="Note" placeholder="Reason or question" value={val(s._id, "note")} onChange={set(s._id, "note")} style={{ flex: "1 1 200px" }} />
                                <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/clarification`, { note: val(s._id, "note") }))}>Ask for clarification</button>
                                <button className="btn btn-danger btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/${s._id}/reject`, { reason: val(s._id, "note") }))}>Reject</button>
                            </div>
                        )}
                    </div>
                );
            }) : <Empty>Nothing is waiting for you.</Empty>)}
            {data && items.length > mine.length && <p className="muted"><small>{items.length - mine.length} other change{items.length - mine.length === 1 ? " is" : "s are"} at another stage.</small></p>}
        </Panel>
    );
}

/** Anyone working in an area reports a problem with a station; the DEO closes it. */
export function StationIssues({ canClose = false }) {
    const issues = useLoad("/polling-stations/issues");
    const [run, st] = useAction(issues.reload);
    const [f, setF] = useState({ stationId: "", kind: "damaged", details: "" });
    const [res, setRes] = useState({});
    const canReport = (issues.data?.stations ?? []).length > 0;
    return (
        <Panel title="Problems with polling stations" intro="Report a damaged, unavailable or inaccessible building, or missing facilities. The DEO looks into it and, if needed, proposes a change for the Commission's approval. Reporting a problem changes nothing by itself.">
            {canReport && (
                <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/polling-stations/issues", f)).then((ok) => ok && setF({ ...f, details: "" })); }}>
                    <Field id="si-st" text="Polling station"><select id="si-st" value={f.stationId} onChange={(e) => setF({ ...f, stationId: e.target.value })} required>
                        <option value="">Choose…</option>{(issues.data?.stations ?? []).map((s) => <option key={s._id} value={s._id}>Part {s.partNumber}: {s.name}</option>)}</select></Field>
                    <Field id="si-k" text="Problem"><select id="si-k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(issues.data?.kinds ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                    <Field id="si-d" text="Details" wide><textarea id="si-d" rows={2} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} required minLength={10} /></Field>
                    <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Report to the DEO</button></div>
                </form>
            )}
            <Status error={issues.error || st.error} notice={st.notice} loading={issues.loading} />
            {issues.data && (issues.data.items.length ? issues.data.items.map((i) => (
                <div className="desk-item" key={i._id}>
                    <h4>Part {i.partNumber}: {i.stationName} <Badge tone={i.status === "open" ? "warn" : "ok"}>{label(i.status)}</Badge></h4>
                    <p className="meta">{issues.data.kinds[i.kind]} · reported by {label(i.reportedBy.role)} {i.reportedBy.epic} · {when(i.at)}</p>
                    <p style={{ margin: "4px 0" }}>{i.details}</p>
                    {i.resolution && <p className="meta">Closed: {i.resolution.note}</p>}
                    {canClose && i.status === "open" && (
                        <div className="desk-actions">
                            <input aria-label="What was done" placeholder="What was done (for example: relocation proposed)" value={res[i._id] ?? ""} onChange={(e) => setRes({ ...res, [i._id]: e.target.value })} style={{ flex: "1 1 260px" }} />
                            <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/polling-stations/issues/${i._id}/close`, { resolution: res[i._id] }))}>Close</button>
                        </div>
                    )}
                </div>
            )) : <Empty>No problems reported.</Empty>)}
        </Panel>
    );
}

/** BLO supervisor / ERO: the BLOs of the area, their training and the new-voter tasks to route. */
export function BloTeam() {
    const team = useLoad("/training/team");
    const tasks = useLoad("/registration-tasks", { status: "open" });
    const [run, st] = useAction(tasks.reload);
    const [to, setTo] = useState({});
    const blos = (team.data?.items ?? []).filter((m) => m.role === "blo" || m.role === "admin");
    const open = tasks.data?.items ?? [];
    const load = (epic) => open.filter((t) => t.assignedTo?.epic === epic).length;
    return (
        <>
            <Panel title="Booth level officers" intro="The BLOs working in your area, their open tasks and training. You allocate and check field work; the ERO decides applications.">
                <Kpis items={[{ label: "BLOs", value: blos.length }, { label: "Open tasks", value: open.length }, { label: "Unassigned tasks", value: open.filter((t) => !t.assignedTo).length, tone: open.some((t) => !t.assignedTo) ? "warn" : "ok" },
                    { label: "BLOs with all training passed", value: blos.filter((b) => b.modules && b.passed === b.modules).length }]} />
                <Status loading={team.loading} error={team.error} />
                <div style={{ marginTop: 12 }}>
                    <Table head={["BLO", "Part / station", "#Open tasks", "Training"]} empty="No BLOs in your area." rows={blos.map((b) => (
                        <tr key={b.epic}><td><code>{b.epic}</code></td><td>{b.jurisdiction.partNumber ? `Part ${b.jurisdiction.partNumber}, ` : ""}{b.jurisdiction.pollingStation ?? b.jurisdiction.constituency}</td><td className="num">{load(b.epic)}</td>
                            <td>{b.passed}/{b.modules} modules {b.passed === b.modules && b.modules ? <Badge tone="ok">complete</Badge> : <Badge tone="warn">pending</Badge>}</td></tr>
                    ))} />
                </div>
            </Panel>
            <Panel title="New-voter tasks to route" intro="Young people found eligible through the approved data sources. Route each to the BLO of their part; nobody is enrolled without their own Form 6.">
                <Status loading={tasks.loading} error={tasks.error || st.error} notice={st.notice} />
                <Table head={["Person", "Area", "Due", "With", ""]} empty="No open tasks." rows={open.map((t) => (
                    <tr key={t._id}><td>{t.name ?? t.person?.name ?? "—"}<br /><small className="muted">{label(t.eligibility ?? t.stage)}</small></td><td>{t.partNumber ? `Part ${t.partNumber}, ` : ""}{t.constituency ?? t.jurisdiction?.constituency}</td><td>{day(t.dueBy)}</td>
                        <td>{t.assignedTo?.epic ?? <Badge tone="warn">Unassigned</Badge>}</td>
                        <td><div className="desk-actions" style={{ marginTop: 0 }}>
                            <select aria-label="BLO" value={to[t._id] ?? ""} onChange={(e) => setTo({ ...to, [t._id]: e.target.value })}><option value="">BLO…</option>{blos.map((b) => <option key={b.epic} value={b.epic}>{b.epic}</option>)}</select>
                            <button className="btn btn-quiet btn-small" disabled={!to[t._id] || st.busy} onClick={() => run(() => api.post(`/registration-tasks/${t._id}/assign`, { epic: to[t._id] }), "Task routed.")}>Route</button>
                        </div></td></tr>
                ))} />
            </Panel>
        </>
    );
}

/** BLA / BLO: the roll of the assigned part, as published (no addresses or documents). */
export function RollPart() {
    const [part, setPart] = useState("");
    const [q, setQ] = useState("");
    const { data, error, loading } = useLoad("/reports/roll-part", part ? { partNumber: part } : {});
    const items = (data?.items ?? []).filter((e) => !q || `${e.name} ${e.epic} ${e.relativeName ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    return (
        <Panel title="Electoral roll of your part" intro="The roll as it is open to inspection: serial number, EPIC, name, relative, gender and age. Addresses, documents and contact details are not shown. To point out an error, file a Form 7 objection or tell the BLO; you cannot change an entry yourself.">
            <div className="desk-form">
                <Field id="rp-part" text="Part"><select id="rp-part" value={part} onChange={(e) => setPart(e.target.value)}><option value="">All my parts</option>{(data?.parts ?? []).map((p) => <option key={p} value={p}>Part {p}</option>)}</select></Field>
                <Field id="rp-q" text="Search"><input id="rp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, EPIC or relative" /></Field>
            </div>
            <Status loading={loading} error={error} />
            {data && <div style={{ marginTop: 12 }}><Table head={["#Serial", "EPIC", "Name", "Relative", "Gender", "#Age", "Part"]} empty="No entries in your part." rows={items.slice(0, 300).map((e) => (
                <tr key={e.epic}><td className="num">{e.serialNumber ?? "—"}</td><td><code>{e.epic}</code></td><td>{e.name}</td><td>{e.relativeName ? `${e.relationType ?? ""} ${e.relativeName}` : "—"}</td><td>{e.gender}</td><td className="num">{e.age ?? "—"}</td><td>{e.partNumber}</td></tr>
            ))} /></div>}
            {items.length > 300 && <p className="muted">Showing the first 300 of {items.length}. Narrow the search.</p>}
        </Panel>
    );
}

/** Recent audit events in the caller's jurisdiction. */
export function AuditPanel() {
    const { data, error, loading, reload } = useLoad("/audit", { limit: 50 });
    return (
        <Panel title="Audit trail" intro="Append-only record of who did what, under which role, in your jurisdiction." actions={<button className="btn btn-quiet btn-small" onClick={reload}>Refresh</button>}>
            <Status loading={loading} error={error} />
            {data && <Table head={["When", "Action", "By", "Record", "Note"]} empty="No events." rows={data.items.map((e) => (
                <tr key={e._id}><td><small>{when(e.at)}</small></td><td>{e.action}</td><td>{e.actor ? `${e.actor.epic} (${label(e.actor.role)})` : "public"}</td><td><small>{e.resource?.type}</small></td><td><small>{e.note ?? ""}</small></td></tr>
            ))} />}
        </Panel>
    );
}

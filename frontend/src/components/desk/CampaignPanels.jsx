// Campaign permissions and expenditure: the candidate's side and the officials' side.
import { useState } from "react";
import api from "../../api/axios";
import { Badge, Empty, Field, Kpis, Panel, Status, Table, day, inr, label, useAction, useLoad, when } from "./kit";

const P_TONE = { applied: "warn", with_ro: "info", granted: "ok", refused: "bad", withdrawn: undefined };

/** Candidate / election agent: apply for permissions and follow them. */
export function PermissionsApply() {
    const { data, error, loading, reload } = useLoad("/campaign-permissions/mine");
    const [run, st] = useAction(reload);
    const [f, setF] = useState({ type: "public_meeting", date: "", from: "10:00", to: "13:00", venue: "", purpose: "", expectedCrowd: "", vehicleNumbers: "" });
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const types = data?.types ?? {};
    return (
        <Panel title="Campaign permissions" intro="Apply for meetings, rallies, vehicles, loudspeakers and offices. The police give remarks on events in public places; the Returning Officer decides. No meeting or procession is allowed in the 48 hours before the poll closes.">
            {data?.context && <p className="muted">Acting for <strong>{data.context.candidate.name}</strong>{data.context.candidate.party ? ` (${data.context.candidate.party})` : ""}, {data.context.area.constituency}.</p>}
            <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/campaign-permissions", f)).then((ok) => ok && setF({ ...f, venue: "", purpose: "" })); }}>
                <Field id="cp-type" text="Permission for"><select id="cp-type" value={f.type} onChange={set("type")}>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
                <Field id="cp-date" text="Date"><input id="cp-date" type="date" value={f.date} onChange={set("date")} required /></Field>
                <Field id="cp-from" text="From"><input id="cp-from" type="time" value={f.from} onChange={set("from")} required /></Field>
                <Field id="cp-to" text="To"><input id="cp-to" type="time" value={f.to} onChange={set("to")} required /></Field>
                <Field id="cp-venue" text="Venue or route" wide><input id="cp-venue" value={f.venue} onChange={set("venue")} required minLength={5} /></Field>
                <Field id="cp-purpose" text="Purpose" wide><input id="cp-purpose" value={f.purpose} onChange={set("purpose")} required minLength={5} /></Field>
                <Field id="cp-crowd" text="Expected attendance"><input id="cp-crowd" inputMode="numeric" value={f.expectedCrowd} onChange={set("expectedCrowd")} /></Field>
                <Field id="cp-veh" text="Vehicle numbers (if any)"><input id="cp-veh" value={f.vehicleNumbers} onChange={set("vehicleNumbers")} /></Field>
                <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Apply</button></div>
            </form>
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && (
                <div style={{ marginTop: 16 }}>
                    {data.items.length ? data.items.map((p) => (
                        <div key={p._id} className="desk-item">
                            <h4>{p.typeLabel} · {day(p.date)} {p.from}–{p.to} <Badge tone={P_TONE[p.status]}>{p.statusText}</Badge></h4>
                            <p className="meta">{p.venue} · {p.purpose}</p>
                            {p.police && <p className="meta">Police: {p.police.remark === "no_objection" ? "no objection" : `objection — ${p.police.note}`}</p>}
                            {p.decision && <p className="meta">{p.decision.decision === "grant" ? `Permit ${p.decision.permitNumber}. Conditions: ${p.decision.conditions}` : `Refused: ${p.decision.reason}`}</p>}
                            {["applied", "with_ro"].includes(p.status) && <div className="desk-actions"><button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/campaign-permissions/mine/${p._id}/withdraw`), "Withdrawn.")}>Withdraw</button></div>}
                        </div>
                    )) : <Empty>No applications yet.</Empty>}
                </div>
            )}
        </Panel>
    );
}

/** RO/ARO decide; police remark; others read. */
export function PermissionsStaff() {
    const [status, setStatus] = useState("");
    const { data, error, loading, reload } = useLoad("/campaign-permissions", status ? { status } : {});
    const [run, st] = useAction(reload);
    const [note, setNote] = useState({});
    const n = (id) => note[id] ?? "";
    return (
        <Panel title="Campaign permissions in your area" intro={data?.can?.decide ? "Grant with conditions or refuse with a reason, after the police remarks for events in public places." : data?.can?.police ? "Give the police remarks: no objection, or objection with reasons. The Returning Officer decides." : "Read-only."}>
            <div className="row-actions" style={{ marginBottom: 12 }}>
                {[["", "All"], ["applied", "Awaiting police"], ["with_ro", "Awaiting RO"], ["granted", "Granted"], ["refused", "Refused"]].map(([k, t]) => (
                    <button key={k} type="button" className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}{k && data?.counts && !status ? ` (${data.counts[k] ?? 0})` : ""}</button>))}
            </div>
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && (data.items.length ? data.items.map((p) => (
                <div key={p._id} className="desk-item">
                    <h4>{p.typeLabel} · {p.candidate.name} <Badge tone={P_TONE[p.status]}>{p.statusText}</Badge></h4>
                    <p className="meta">{day(p.date)} {p.from}–{p.to} · {p.venue} · {p.purpose}{p.expectedCrowd ? ` · about ${p.expectedCrowd} people` : ""} · applied {when(p.appliedAt)} by {p.appliedAs === "candidate" ? "the candidate" : "the election agent"}</p>
                    {p.police && <p className="meta">Police remarks: <strong>{label(p.police.remark)}</strong>{p.police.note ? ` — ${p.police.note}` : ""}</p>}
                    {p.decision && <p className="meta">{p.decision.decision === "grant" ? `Granted (permit ${p.decision.permitNumber}): ${p.decision.conditions}` : `Refused: ${p.decision.reason}`}</p>}
                    {((data.can.police && p.status === "applied") || (data.can.decide && p.status === "with_ro")) && (
                        <div className="desk-actions">
                            <input aria-label="Note or conditions" placeholder={p.status === "applied" ? "Remarks (required for an objection)" : "Conditions, or reason for refusal"} value={n(p._id)} onChange={(e) => setNote({ ...note, [p._id]: e.target.value })} style={{ flex: "1 1 260px" }} />
                            {p.status === "applied" ? <>
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/campaign-permissions/${p._id}/police`, { remark: "no_objection", note: n(p._id) }), "No objection recorded.")}>No objection</button>
                                <button className="btn btn-danger btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/campaign-permissions/${p._id}/police`, { remark: "objection", note: n(p._id) }), "Objection recorded.")}>Object</button>
                            </> : <>
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/campaign-permissions/${p._id}/decide`, { decision: "grant", conditions: n(p._id), reason: p.police?.remark === "objection" ? n(p._id) : undefined }), "Granted.")}>Grant</button>
                                <button className="btn btn-danger btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/campaign-permissions/${p._id}/decide`, { decision: "refuse", reason: n(p._id) }), "Refused.")}>Refuse</button>
                            </>}
                        </div>
                    )}
                </div>
            )) : <Empty>No applications.</Empty>)}
        </Panel>
    );
}

/** Candidate / election agent: the day-to-day register of expenditure. */
export function ExpenditureRegister() {
    const { data, error, loading, reload } = useLoad("/expenditure/mine");
    const [run, st] = useAction(reload);
    const blank = { date: new Date().toISOString().slice(0, 10), category: "public_meeting", amount: "", mode: "bank_transfer", payee: "", description: "", voucherRef: "" };
    const [f, setF] = useState(blank);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const s = data?.summary;
    return (
        <Panel title="Expenditure register" intro="Enter every payment on the day it is made. Entries cannot be edited: a correction is a new entry that replaces the old one, with a reason. Payments above ₹10,000 should not be made in cash.">
            {s && <Kpis items={[
                { label: "Spent so far", value: inr(s.total) },
                { label: `Of the ceiling (${inr(s.ceiling)})`, value: `${s.percentOfCeiling}%`, tone: s.percentOfCeiling > 90 ? "bad" : s.percentOfCeiling > 70 ? "warn" : "ok" },
                { label: "Entries", value: s.entries }, { label: "Flagged entries", value: s.flagged, tone: s.flagged ? "warn" : undefined }
            ]} />}
            {s && <div className="meter" style={{ margin: "12px 0" }}><span style={{ width: `${Math.min(100, s.percentOfCeiling)}%` }} /></div>}
            <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/expenditure", f), "Entry added.").then((ok) => ok && setF(blank)); }}>
                <Field id="ex-date" text="Date"><input id="ex-date" type="date" value={f.date} onChange={set("date")} required /></Field>
                <Field id="ex-cat" text="Head"><select id="ex-cat" value={f.category} onChange={set("category")}>{Object.entries(data?.categories ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field id="ex-amt" text="Amount (₹)"><input id="ex-amt" inputMode="decimal" value={f.amount} onChange={set("amount")} required /></Field>
                <Field id="ex-mode" text="Paid by"><select id="ex-mode" value={f.mode} onChange={set("mode")}>{(data?.modes ?? []).map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></Field>
                <Field id="ex-payee" text="Paid to"><input id="ex-payee" value={f.payee} onChange={set("payee")} required /></Field>
                <Field id="ex-v" text="Voucher / bill number"><input id="ex-v" value={f.voucherRef} onChange={set("voucherRef")} /></Field>
                <Field id="ex-desc" text="Description" wide><input id="ex-desc" value={f.description} onChange={set("description")} required minLength={3} /></Field>
                <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Add entry</button></div>
            </form>
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && <div style={{ marginTop: 16 }}><Table head={["Date", "Head", "#Amount", "Mode", "Paid to", "Voucher", "Notes"]} empty="No entries yet." rows={data.items.filter((e) => !e.supersededBy).map((e) => (
                <tr key={e._id}><td>{day(e.date)}</td><td>{data.categories[e.category]}</td><td className="num">{inr(e.amount)}</td><td>{label(e.mode)}</td><td>{e.payee}<br /><small className="muted">{e.description}</small></td>
                    <td>{e.voucherRef ?? "—"}</td>
                    <td>{e.flags.map((x) => <Badge key={x} tone="warn">{label(x)}</Badge>)} {e.corrects && <small className="muted">corrects an earlier entry: {e.correctionReason}</small>}
                        {e.observerNotes?.map((o, i) => <div key={i}><small>Observer ({o.kind}): {o.text}</small></div>)}</td></tr>
            ))} /></div>}
        </Panel>
    );
}

/** Expenditure observer (and readers): registers per candidate, the shadow register and notes. */
export function ExpenditureObserve({ election }) {
    const { data, error, loading, reload } = useLoad("/expenditure");
    const [run, st] = useAction(reload);
    const [noteFor, setNoteFor] = useState(null);
    const [text, setText] = useState("");
    const [sh, setSh] = useState({ candidateKey: "", date: new Date().toISOString().slice(0, 10), event: "", estimatedAmount: "" });
    const can = data?.can?.observe;
    return (
        <Panel title="Candidates' expenditure registers" intro="Registers as entered by candidates, against the ceiling, with what you observed in the shadow register. A note is an observation, not a finding.">
            <Status error={error || st.error} notice={st.notice} loading={loading} />
            {data && (data.candidates.length ? data.candidates.map((g) => (
                <div className="desk-item" key={`${g.electionId}${g.candidateKey}`}>
                    <h4>{g.candidate.name}{g.candidate.party ? ` (${g.candidate.party})` : ""} · {g.jurisdiction.constituency}</h4>
                    <p className="meta">Reported {inr(g.summary.total)} ({g.summary.percentOfCeiling}% of {inr(g.summary.ceiling)}) · observed in the shadow register {inr(g.summary.observed)}
                        {g.summary.observed > g.summary.total ? <> · <Badge tone="bad">observed exceeds reported by {inr(g.summary.observed - g.summary.total)}</Badge></> : null} · {g.summary.flagged} flagged</p>
                    <details><summary>Entries ({g.items.length})</summary>
                        <Table head={["Date", "Head", "#Amount", "Mode", "Paid to", "Flags", ""]} rows={g.items.map((e) => (
                            <tr key={e._id} style={e.supersededBy ? { opacity: .5 } : undefined}><td>{day(e.date)}</td><td>{data.categories[e.category]}</td><td className="num">{inr(e.amount)}</td><td>{label(e.mode)}</td><td>{e.payee}</td>
                                <td>{e.flags.map((x) => <Badge key={x} tone="warn">{label(x)}</Badge>)}{e.supersededBy ? " superseded" : ""}{e.observerNotes?.map((o, i) => <div key={i}><small>{o.kind}: {o.text}</small></div>)}</td>
                                <td>{can && !e.supersededBy && <button className="btn btn-quiet btn-small" onClick={() => { setNoteFor(e._id); setText(""); }}>Note</button>}</td></tr>
                        ))} />
                    </details>
                    {can && <button className="btn btn-quiet btn-small" style={{ marginTop: 8 }} onClick={() => setSh({ ...sh, candidateKey: g.candidateKey, candidateName: g.candidate.name, electionId: g.electionId, ...g.jurisdiction })}>Add to shadow register</button>}
                </div>
            )) : <Empty>No registers in your area yet.</Empty>)}
            {noteFor && (
                <form className="desk-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/expenditure/${noteFor}/notes`, { kind: "discrepancy", text }), "Note recorded.").then((ok) => ok && setNoteFor(null)); }}>
                    <Field id="eo-note" text="Observation on this entry" wide><textarea id="eo-note" rows={2} value={text} onChange={(e) => setText(e.target.value)} required minLength={5} /></Field>
                    <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Save note</button> <button type="button" className="btn btn-quiet" onClick={() => setNoteFor(null)}>Cancel</button></div>
                </form>
            )}
            {can && sh.candidateKey && (
                <form className="desk-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api.post("/expenditure/shadow", { ...sh, electionId: sh.electionId ?? election?._id }), "Added to the shadow register.").then((ok) => ok && setSh({ ...sh, candidateKey: "" })); }}>
                    <p className="wide"><strong>Shadow register: {sh.candidateName}</strong></p>
                    <Field id="sh-d" text="Date"><input id="sh-d" type="date" value={sh.date} onChange={(e) => setSh({ ...sh, date: e.target.value })} required /></Field>
                    <Field id="sh-a" text="Estimated cost (₹)"><input id="sh-a" inputMode="decimal" value={sh.estimatedAmount} onChange={(e) => setSh({ ...sh, estimatedAmount: e.target.value })} required /></Field>
                    <Field id="sh-e" text="What you observed" wide><input id="sh-e" value={sh.event} onChange={(e) => setSh({ ...sh, event: e.target.value })} required minLength={5} placeholder="e.g. Rally with 40 vehicles, stage and LED wall" /></Field>
                    <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Add</button> <button type="button" className="btn btn-quiet" onClick={() => setSh({ ...sh, candidateKey: "" })}>Cancel</button></div>
                </form>
            )}
        </Panel>
    );
}

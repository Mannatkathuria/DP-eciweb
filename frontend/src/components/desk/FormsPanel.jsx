// Electoral forms 2, 2A, 3, 6A, 6B, 7 and 8 for officials: the BLO verifies in the field and
// recommends; only the ERO/AERO decides. Observers and supervisors read.
import { useState } from "react";
import api from "../../api/axios";
import { Badge, Empty, Field, Panel, Status, Table, day, label, useAction, useLoad, when } from "./kit";

const TONE = { submitted: "warn", field_verified: "info", approved: "ok", rejected: "bad", withdrawn: undefined };
const FIELD_LABELS = { firstName: "First name", lastName: "Last name", fullName: "Full name", applicantName: "Applicant", electorName: "Elector", dateOfBirth: "Date of birth", gender: "Gender",
    epicNumber: "EPIC", applicantEpic: "Applicant's EPIC", personEpic: "EPIC objected to", reason: "Reason", applicationType: "Request", correctionFields: "Entries to correct" };

function Detail({ id, mode, onDone }) {
    const { data, error, loading } = useLoad(`/elector-forms/staff/${id}`);
    const [run, st] = useAction(onDone);
    const [form, setForm] = useState({ recommendation: "approve", note: "", partNumber: "", pollingStation: "", method: "home_visit", decision: "approve", reason: "" });
    const [doc, setDoc] = useState(null);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    if (loading || error) return <Status loading={loading} error={error} />;
    const a = data;
    const open = async (name) => { try { setDoc((await api.get(`/elector-forms/staff/${id}/documents/${name}`)).data.data); } catch { setDoc({ error: "The document could not be opened (it is deleted once an application is decided)." }); } };
    const entries = Object.entries(a.fields).filter(([, v]) => v !== "" && v !== false);
    return (
        <div className="desk-item" style={{ marginTop: 12 }}>
            <h4>{a.title} · {a.referenceId}</h4>
            <p className="meta">{a.jurisdiction.constituency}, {a.jurisdiction.district} · received {when(a.submittedAt)} · {a.channel}</p>
            <details><summary>Form fields ({entries.length})</summary>
                <dl className="facts">{entries.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{FIELD_LABELS[k] ?? label(k)}</dt><dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>)}
                    {a.aadhaar && <><dt>Aadhaar</dt><dd>XXXX XXXX {a.aadhaar.last4} (only the last four digits are kept)</dd></>}</dl>
            </details>
            {a.rollEntries && Object.values(a.rollEntries).map((e) => (
                <p key={e.epic} className="meta">Roll entry {e.epic}: {e.name}, {e.gender}, part {e.partNumber} ({e.pollingStation}){e.isActive ? "" : " — already deleted"}</p>
            ))}
            {a.documents.length > 0 && (
                <div className="desk-actions">Documents: {a.documents.map((d) => <button key={d.name} className="btn btn-quiet btn-small" type="button" disabled={Boolean(d.deletedAt)} onClick={() => open(d.name)}>{label(d.name)} ({Math.round(d.bytes / 1024)} KB){d.deletedAt ? " · deleted" : ""}</button>)}</div>
            )}
            {doc?.error && <div className="alert alert-warn">{doc.error}</div>}
            {doc?.dataUrl && (doc.mimeType === "application/pdf"
                ? <p><a href={doc.dataUrl} download={doc.fileName}>Download {doc.fileName}</a></p>
                : <img src={doc.dataUrl} alt={doc.fileName} style={{ maxWidth: "100%", maxHeight: 360, marginTop: 8, borderRadius: 8 }} />)}
            {a.fieldReport && <p className="meta">Field report: <strong>{a.fieldReport.recommendation === "approve" ? "recommends approval" : "recommends rejection"}</strong> by {a.fieldReport.by.epic} on {when(a.fieldReport.at)} ({label(a.fieldReport.method)}){a.fieldReport.booth ? `; part ${a.fieldReport.booth.partNumber}, ${a.fieldReport.booth.pollingStation}` : ""}{a.fieldReport.note ? ` — “${a.fieldReport.note}”` : ""}</p>}
            {a.decision && <p className="meta">Decision: <strong>{a.decision.outcome}</strong> by {a.decision.by.epic} on {when(a.decision.at)} — {a.decision.reason}{a.decision.effect ? ` (${a.decision.effect})` : ""}</p>}

            {mode === "field" && a.status === "submitted" && (
                <form className="desk-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/elector-forms/staff/${id}/field-report`, form)); }}>
                    <Field id="fr-rec" text="Recommendation"><select id="fr-rec" value={form.recommendation} onChange={set("recommendation")}><option value="approve">Verified: recommend approval</option><option value="reject">Recommend rejection</option></select></Field>
                    <Field id="fr-m" text="How verified"><select id="fr-m" value={form.method} onChange={set("method")}><option value="home_visit">Home visit</option><option value="documents">Documents</option><option value="phone">Phone</option><option value="office">At the office</option></select></Field>
                    {(a.kind === "inclusion" || a.fields.applicationType === "shift") && <>
                        <Field id="fr-part" text="Part number"><input id="fr-part" value={form.partNumber} onChange={set("partNumber")} inputMode="numeric" placeholder="From your assignment if blank" /></Field>
                        <Field id="fr-ps" text="Polling station"><input id="fr-ps" value={form.pollingStation} onChange={set("pollingStation")} placeholder="From your assignment if blank" /></Field>
                    </>}
                    <Field id="fr-note" text={form.recommendation === "reject" ? "Reason (shown to the applicant)" : "Note (optional)"} wide><textarea id="fr-note" rows={2} value={form.note} onChange={set("note")} required={form.recommendation === "reject"} /></Field>
                    <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Record field verification</button></div>
                </form>
            )}
            {mode === "decide" && ["submitted", "field_verified"].includes(a.status) && (
                <form className="desk-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/elector-forms/staff/${id}/decide`, { decision: form.decision, reason: form.reason, ...(form.partNumber ? { partNumber: form.partNumber, pollingStation: form.pollingStation } : {}) })); }}>
                    <Field id="dc-d" text="Decision"><select id="dc-d" value={form.decision} onChange={set("decision")}><option value="approve">Approve</option><option value="reject">Reject</option></select></Field>
                    <Field id="dc-part" text="Correct the part (optional)"><input id="dc-part" value={form.partNumber} onChange={set("partNumber")} inputMode="numeric" /></Field>
                    <Field id="dc-ps" text="Polling station (with a corrected part)"><input id="dc-ps" value={form.pollingStation} onChange={set("pollingStation")} /></Field>
                    <Field id="dc-r" text={form.decision === "reject" ? "Reason (shown to the applicant)" : "Reasons for the order"} wide><textarea id="dc-r" rows={2} value={form.reason} onChange={set("reason")} required={form.decision === "reject"} /></Field>
                    <div className="wide"><button className={form.decision === "approve" ? "btn btn-primary" : "btn btn-danger"} disabled={st.busy}>{form.decision === "approve" ? "Approve and update the roll" : "Reject"}</button>
                        <small className="muted"> You will be asked for a fresh one-time code.</small></div>
                </form>
            )}
            <Status error={st.error} notice={st.notice} />
        </div>
    );
}

/** mode: "field" (BLO), "decide" (ERO/AERO) or "read". */
export default function FormsPanel({ mode = "read" }) {
    const [status, setStatus] = useState(mode === "decide" ? "field_verified" : mode === "field" ? "submitted" : "");
    const { data, error, loading, reload } = useLoad("/elector-forms/staff", status ? { status } : {});
    const [open, setOpen] = useState(null);
    const counts = data?.counts ?? {};
    return (
        <Panel title="Electoral forms 2, 2A, 3, 6A, 6B, 7 and 8"
            intro={mode === "field" ? "Verify in the field and recommend. Your report is evidence for the ERO; nothing changes in the roll until the ERO decides."
                : mode === "decide" ? "Decide applications for your constituency. Only an approval changes the roll; every order records its reasons."
                    : "Read-only view of applications in your jurisdiction."}>
            <div className="row-actions" style={{ marginBottom: 12 }}>
                {[["", "All"], ["submitted", "Awaiting field verification"], ["field_verified", "Awaiting decision"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([k, t]) => (
                    <button key={k} type="button" className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}{k && counts[k] !== undefined && status === "" ? ` (${counts[k]})` : ""}</button>
                ))}
            </div>
            <Status loading={loading} error={error} />
            {data && (data.items.length ? (
                <Table head={["Reference", "Form", "Applicant / entry", "Area", "Received", "Status", ""]} rows={data.items.map((a) => (
                    <tr key={a._id}>
                        <td><code>{a.referenceId}</code></td>
                        <td>{a.formCode.replace("_", " ")}{a.requestType ? <><br /><small>{label(a.requestType)}</small></> : null}</td>
                        <td>{a.subject?.name ?? "—"}{a.subject?.epic ? <><br /><small>{a.subject.epic}</small></> : null}{a.subject?.targetEpic && a.subject.targetEpic !== a.subject.epic ? <><br /><small>About {a.subject.targetEpic}</small></> : null}</td>
                        <td>{a.jurisdiction.constituency}</td>
                        <td>{day(a.submittedAt)}</td>
                        <td><Badge tone={TONE[a.status]}>{a.statusText}</Badge></td>
                        <td><button type="button" className="btn btn-quiet btn-small" onClick={() => setOpen(open === a._id ? null : a._id)}>{open === a._id ? "Close" : "Open"}</button></td>
                    </tr>
                ))} />
            ) : <Empty>No applications here.</Empty>)}
            {open && <Detail key={open} id={open} mode={mode} onDone={reload} />}
        </Panel>
    );
}

import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";

// BLO: registration assistance tasks from the new-voter pipeline. Each task is a person who is,
// or is about to be, old enough to enrol. The BLO contacts them and helps them file Form 6.
// Finishing a task never enrols anyone: the Form 6 still needs field verification and the ERO.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const ELIGIBILITY = {
    ELIGIBLE: "Eligible now",
    ADVANCE: "Advance application (17+)"
};
const STAGE = {
    open: "Open", contacted: "Contacted", form6_submitted: "Form 6 filed", declined: "Declined", not_found: "Not found", ineligible: "Not eligible",
    application_pending: "Form 6 awaiting your field verification", application_field_verified: "Form 6 with the ERO",
    registered: "Registered", application_rejected: "Form 6 rejected"
};
const OUTCOMES = [
    ["contacted", "Contacted (keep open)"],
    ["form6_submitted", "Form 6 filed (give reference ID)"],
    ["declined", "Declined to apply"],
    ["not_found", "Not found at address"],
    ["ineligible", "Not eligible"]
];

export default function BloTasks({ onCount }) {
    const [items, setItems] = useState([]);
    const [filter, setFilter] = useState("open");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [forms, setForms] = useState({}); // per task: { outcome, note, applicationId }
    const [busy, setBusy] = useState({});
    const [rowErrors, setRowErrors] = useState({});

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/registration-tasks", { params: { status: filter } });
            setItems(data.data?.items || []);
            if (filter === "open") onCount?.(data.data?.total ?? 0);
            setError("");
        } catch (err) {
            setError(apiMessage(err, "Could not load registration tasks."));
        }
    }, [filter, onCount]);

    useEffect(() => { load(); }, [load]);

    const formFor = (t) => ({ outcome: "contacted", note: "", applicationId: "", ...forms[t._id] });
    const setForm = (t, field, value) => setForms((f) => ({ ...f, [t._id]: { ...formFor(t), [field]: value } }));

    const submit = async (t) => {
        const form = formFor(t);
        setBusy((b) => ({ ...b, [t._id]: true }));
        setRowErrors((e) => ({ ...e, [t._id]: "" }));
        setNotice("");
        try {
            await api.post(`/registration-tasks/${t._id}/outcome`, {
                outcome: form.outcome, note: form.note.trim() || undefined,
                applicationId: form.outcome === "form6_submitted" ? form.applicationId.trim() : undefined
            });
            setNotice(`Recorded for ${t.person.name}.`);
            setForms((f) => { const next = { ...f }; delete next[t._id]; return next; });
            await load();
        } catch (err) {
            setRowErrors((e) => ({ ...e, [t._id]: apiMessage(err, "Could not save. Nothing was changed.") }));
        } finally {
            setBusy((b) => ({ ...b, [t._id]: false }));
        }
    };

    return (
        <section className="admin-card">
            <div className="admin-toolbar">
                <div>
                    <h2>New voter registration tasks</h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
                        People in your area who have reached, or will soon reach, a qualifying date (1 January, 1 April, 1 July, 1 October).
                        Contact them and help them file Form 6. They are not enrolled until the ERO approves their application.
                    </p>
                </div>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show tasks">
                    <option value="open">Open</option>
                    <option value="all">All</option>
                </select>
            </div>
            {error && <div className="verification-error" role="alert">{error}</div>}
            {notice && <div className="admin-notice" role="status">{notice}</div>}
            {!error && items.length === 0 && <p style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>No tasks.</p>}
            {items.length > 0 && (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr><th>Person</th><th>Eligibility</th><th>Area</th><th>Status</th><th style={{ minWidth: 260 }}>Record outcome</th></tr>
                        </thead>
                        <tbody>
                            {items.map((t) => {
                                const form = formFor(t);
                                return (
                                    <tr key={t._id}>
                                        <td><strong>{t.person.name}</strong><br /><small>Born {t.person.dateOfBirth}{t.person.gender ? ` · ${t.person.gender}` : ""}</small><br /><small>{t.caseId}</small></td>
                                        <td>{ELIGIBILITY[t.eligibility.status] || t.eligibility.status}<br /><small>Qualifying date {t.eligibility.qualifyingDate}</small></td>
                                        <td><small>{t.jurisdiction.constituency}{t.jurisdiction.partNumber ? `, part ${t.jurisdiction.partNumber}` : ""}</small>{t.person.address && <><br /><small>{t.person.address}</small></>}</td>
                                        <td>
                                            {STAGE[t.stage] || t.stage}
                                            {t.application?.epic && <><br /><small>EPIC {t.application.epic}</small></>}
                                            {t.outcomes.length > 0 && <><br /><small>Last: {t.outcomes.at(-1).outcome} on {new Date(t.outcomes.at(-1).at).toLocaleDateString()}</small></>}
                                        </td>
                                        <td>
                                            {t.status === "open" ? (
                                                <div className="booth-assignment">
                                                    <label>Outcome
                                                        <select value={form.outcome} onChange={(e) => setForm(t, "outcome", e.target.value)} disabled={Boolean(busy[t._id])}>
                                                            {OUTCOMES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                                                        </select>
                                                    </label>
                                                    {form.outcome === "form6_submitted" && (
                                                        <label>Form 6 reference ID
                                                            <input value={form.applicationId} onChange={(e) => setForm(t, "applicationId", e.target.value)} disabled={Boolean(busy[t._id])} />
                                                        </label>
                                                    )}
                                                    <label>Note{["declined", "not_found", "ineligible"].includes(form.outcome) ? " *" : ""}
                                                        <input value={form.note} onChange={(e) => setForm(t, "note", e.target.value)} maxLength={500} disabled={Boolean(busy[t._id])} />
                                                    </label>
                                                    <button className="btn-approve" onClick={() => submit(t)} disabled={Boolean(busy[t._id])}>{busy[t._id] ? "Saving…" : "Save"}</button>
                                                </div>
                                            ) : <small>Closed</small>}
                                            {rowErrors[t._id] && <p className="row-error" role="alert">{rowErrors[t._id]}</p>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

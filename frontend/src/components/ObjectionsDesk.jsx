import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import ReasonDialog from "../pages/ReasonDialog";

// Form 7 objections for officials. mode="verify": the BLO records the field finding.
// mode="decide": the ERO/AERO accepts or rejects, with a reason (step-up is asked for by the server).
// The server checks permission and jurisdiction on every request.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const OPEN = ["notice", "pending_verification", "field_verified"];
const STATUS = { notice: "Notice period", pending_verification: "Awaiting BLO", field_verified: "BLO verified", accepted: "Accepted (deleted)", rejected: "Rejected", withdrawn: "Withdrawn" };

export default function ObjectionsDesk({ mode }) {
    const [items, setItems] = useState(null);
    const [showClosed, setShowClosed] = useState(false);
    const [report, setReport] = useState({});
    const [dialog, setDialog] = useState(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const [dialogError, setDialogError] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState("");

    const load = useCallback(async () => {
        try { setItems((await api.get("/objections/staff")).data.data.items); setError(""); }
        catch (e) { setError(apiMessage(e, "Objections could not be loaded.")); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const sendReport = async (o) => {
        const r = report[o._id] ?? {};
        setBusy(o._id); setError(""); setNotice("");
        try {
            await api.post(`/objections/staff/${o._id}/field-report`, { finding: r.finding, notes: r.notes ?? "" });
            setNotice(`Field report recorded for ${o.target.name}.`);
            await load();
        } catch (e) { setError(apiMessage(e, "The field report was not saved.")); }
        finally { setBusy(""); }
    };
    const decide = async (reason) => {
        setDialogBusy(true); setDialogError("");
        try {
            const r = await api.post(`/objections/staff/${dialog.item._id}/decide`, { outcome: dialog.outcome, reason });
            setNotice(r.data.message); setDialog(null); await load();
        } catch (e) { setDialogError(apiMessage(e, "The decision was not saved.")); }
        finally { setDialogBusy(false); }
    };

    const shown = (items ?? []).filter((o) => showClosed || OPEN.includes(o.status));
    return (
        <div className="panel">
            <h2>Form 7 objections ({(items ?? []).filter((o) => OPEN.includes(o.status)).length} open)</h2>
            <p className="muted">{mode === "decide" ? "Accept only after the BLO's field report and the end of the elector's notice period. An accepted objection marks the entry deleted; nothing is erased." : "Visit the address and record what you found. The ERO decides."}</p>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show decided and withdrawn</label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-ok" role="status">{notice}</div>}
            {items && !shown.length && <p className="muted">Nothing to show.</p>}
            <ul className="rows">
                {shown.map((o) => (
                    <li key={o._id}>
                        <strong>{o.target.name}</strong> ({o.target.epic}) · part {o.target.partNumber ?? "–"}, {o.target.assemblyConstituency}<br />
                        <span className="badge">{STATUS[o.status]}</span> {o.groundLabel} · filed by {o.self ? "the elector (own entry)" : `${o.objector.name || o.objector.epic} (${o.objector.role === "bla" ? "booth level agent" : "elector"})`} on {new Date(o.filedAt).toLocaleDateString()}
                        <p style={{ margin: "6px 0" }}>“{o.details}”</p>
                        {o.noticeUntil && <p className="muted" style={{ margin: "4px 0" }}><small>Notice {o.noticeOpen ? "runs until" : "ended"} {new Date(o.noticeUntil).toLocaleString()}</small></p>}
                        {o.reply && <p style={{ margin: "4px 0" }}><strong>Elector's reply:</strong> “{o.reply.text}”</p>}
                        {o.fieldReport && <p style={{ margin: "4px 0" }}><strong>BLO report:</strong> {o.fieldReport.finding === "confirmed" ? "Grounds confirmed" : "Grounds not confirmed"}: “{o.fieldReport.notes}” ({o.fieldReport.by})</p>}
                        {o.decision && <p style={{ margin: "4px 0" }}><strong>Decision:</strong> {o.decision.outcome}{o.decision.reason ? `: ${o.decision.reason}` : ""}</p>}
                        {mode === "verify" && OPEN.includes(o.status) && (
                            <form className="row-actions" onSubmit={(e) => { e.preventDefault(); sendReport(o); }} style={{ flexWrap: "wrap", gap: 8 }}>
                                <select aria-label="Finding" required value={report[o._id]?.finding ?? ""} onChange={(e) => setReport((r) => ({ ...r, [o._id]: { ...r[o._id], finding: e.target.value } }))}>
                                    <option value="">Finding…</option>
                                    <option value="confirmed">Grounds confirmed</option>
                                    <option value="not_confirmed">Grounds not confirmed</option>
                                </select>
                                <input aria-label="What you found" required minLength={10} maxLength={1000} placeholder="What you found at the address" style={{ flex: 1, minWidth: 220 }}
                                    value={report[o._id]?.notes ?? ""} onChange={(e) => setReport((r) => ({ ...r, [o._id]: { ...r[o._id], notes: e.target.value } }))} />
                                <button className="btn btn-primary btn-small" type="submit" disabled={busy === o._id}>{o.fieldReport ? "Replace report" : "Record report"}</button>
                            </form>
                        )}
                        {mode === "decide" && OPEN.includes(o.status) && (
                            <div className="row-actions">
                                <button className="btn-approve" disabled={!o.fieldReport || o.noticeOpen} title={!o.fieldReport ? "Needs the BLO's field report" : o.noticeOpen ? "The notice period has not ended" : ""}
                                    onClick={() => { setDialogError(""); setDialog({ item: o, outcome: "accepted" }); }}>Accept and delete entry</button>
                                <button className="btn-reject" onClick={() => { setDialogError(""); setDialog({ item: o, outcome: "rejected" }); }}>Reject</button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            {dialog && (
                <ReasonDialog
                    title={`${dialog.outcome === "accepted" ? "Accept objection" : "Reject objection"}: ${dialog.item.target.name}`}
                    label="Reasoned order (shown to the elector and the objector)"
                    required
                    confirmClass={dialog.outcome === "accepted" ? "btn-approve" : "btn-reject"}
                    confirmLabel={dialog.outcome === "accepted" ? "Accept and delete entry" : "Reject objection"}
                    busy={dialogBusy} error={dialogError} onConfirm={decide} onCancel={() => setDialog(null)}
                />
            )}
        </div>
    );
}

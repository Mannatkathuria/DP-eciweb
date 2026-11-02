import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import { homeFor } from "../config/roles";

// Electoral Registration Officer / Assistant ERO: decides Form 6 applications that the BLO has
// verified in the field. Every request is checked again on the server for permission and for the
// officer's constituency; this page only shows what the server returns.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const DECIDING_ROLES = ["ero", "aero"];
const ACTION_TEXT = {
    "registration.field_verified": "Field verification submitted",
    "registration.approved": "Approved and added to the roll",
    "registration.rejected": "Rejected"
};

export default function EroDecisions() {
    const { logged, userData } = useContext(AuthContext);
    const [verified, setVerified] = useState([]);
    const [awaitingBlo, setAwaitingBlo] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [booths, setBooths] = useState({}); // corrections typed by the officer, per application
    const [busy, setBusy] = useState({});
    const [rowErrors, setRowErrors] = useState({});
    const [history, setHistory] = useState({}); // application id -> audit events (when opened)
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [dialog, setDialog] = useState(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const [dialogError, setDialogError] = useState("");

    const allowed = logged && DECIDING_ROLES.includes(userData?.role);

    const load = useCallback(async () => {
        setError("");
        try {
            const [v, p, a] = await Promise.all([
                api.get("/admin/registrations", { params: { status: "field_verified" } }),
                api.get("/admin/registrations", { params: { status: "pending" } }),
                api.get("/assignments/me")
            ]);
            setVerified(v.data.data?.items || []);
            setAwaitingBlo(p.data.data?.items || []);
            setAssignments(a.data.data?.assignments || []);
        } catch (err) {
            setError(apiMessage(err, "Could not load applications."));
        }
    }, []);

    useEffect(() => { if (allowed) load(); }, [allowed, load]);

    if (!logged) return <Navigate to="/signin/ero" replace />;
    if (!allowed) return <Navigate to={homeFor(userData?.role)} replace />;

    const boothFor = (r) => ({
        partNumber: booths[r._id]?.partNumber ?? r.fieldVerification?.partNumber ?? "",
        pollingStation: booths[r._id]?.pollingStation ?? r.fieldVerification?.pollingStation ?? ""
    });
    const setBooth = (r, field, value) => setBooths((b) => ({ ...b, [r._id]: { ...boothFor(r), [field]: value } }));

    const run = async (id, request, success) => {
        setBusy((b) => ({ ...b, [id]: true }));
        setRowErrors((e) => ({ ...e, [id]: "" }));
        setNotice(""); setError("");
        try {
            const res = await request();
            setNotice(success(res));
            await load();
        } catch (err) {
            const message = apiMessage(err, "The request failed. Nothing was changed; please try again.");
            if (err.response?.status === 409) { setError(message); await load(); }
            else setRowErrors((e) => ({ ...e, [id]: message }));
            throw err;
        } finally {
            setBusy((b) => ({ ...b, [id]: false }));
        }
    };

    const approve = async (r) => {
        const booth = boothFor(r);
        const original = r.fieldVerification || {};
        const corrected = booth.partNumber.trim() !== (original.partNumber || "") || booth.pollingStation.trim() !== (original.pollingStation || "");
        const body = corrected ? { partNumber: booth.partNumber.trim(), pollingStation: booth.pollingStation.trim() } : {};
        try {
            await run(r._id, () => api.post(`/admin/registrations/${r._id}/approve`, body),
                ({ data }) => `Approved ${r.name}. EPIC ${data.data?.epic} added to the roll for part ${booth.partNumber}.`);
        } catch { /* shown on the row */ }
    };

    const confirmReject = async (reason) => {
        const r = dialog;
        setDialogBusy(true); setDialogError("");
        try {
            await run(r._id, () => api.post(`/admin/registrations/${r._id}/reject`, { note: reason }), () => `Application from ${r.name} rejected.`);
            setDialog(null);
        } catch (err) {
            if (err.response?.status === 409) setDialog(null);
            else setDialogError(apiMessage(err, "The request failed. Nothing was changed; please try again."));
        } finally {
            setDialogBusy(false);
        }
    };

    const toggleHistory = async (r) => {
        if (history[r._id]) { setHistory((h) => { const next = { ...h }; delete next[r._id]; return next; }); return; }
        try {
            const res = await api.get(`/audit/registration/${r._id}`);
            setHistory((h) => ({ ...h, [r._id]: res.data.data?.items || [] }));
        } catch (err) {
            setRowErrors((e) => ({ ...e, [r._id]: apiMessage(err, "Could not load the history.") }));
        }
    };

    const area = assignments.map((a) => [a.jurisdiction?.constituency, a.jurisdiction?.district, a.jurisdiction?.state].filter(Boolean).join(", ")).filter(Boolean);

    return (
        <>
            <PageHead
                title="Registration decisions (Form 6)"
                lede="Applications your Booth Level Officers have verified in the field. You approve or reject them; approval adds the elector to the roll."
                crumbs={[{ label: "Electoral roll" }]}
            />
            <section className="section">
                <div className="container stack">
                    <div className="panel">
                        <p><strong>{userData?.name}</strong> · {userData?.role === "aero" ? "Assistant electoral registration officer" : "Electoral registration officer"}</p>
                        {area.length
                            ? <p className="muted">Jurisdiction: {area.join(" · ")}</p>
                            : <div className="alert alert-warn">You have no jurisdiction assignment, so no applications are shown. Ask the ECI administrator to assign you to a constituency.</div>}
                    </div>

                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}

                    <div className="panel">
                        <h2>Awaiting your decision ({verified.length})</h2>
                        {verified.length === 0 && <p className="muted">No field-verified applications are waiting.</p>}
                        {verified.length > 0 && (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr><th>Applicant</th><th>Constituency & address</th><th>BLO field verification</th><th>Booth</th><th>Decision</th></tr>
                                    </thead>
                                    <tbody>
                                        {verified.map((r) => {
                                            const fv = r.fieldVerification || {};
                                            return (
                                                <tr key={r._id}>
                                                    <td>
                                                        <strong>{r.name}</strong><br />
                                                        <small>{new Date(r.dateOfBirth).toLocaleDateString()} · {r.gender}</small><br />
                                                        <small>Submitted {new Date(r.submittedAt).toLocaleDateString()}</small>
                                                    </td>
                                                    <td>{r.assemblyConstituency}, {r.district}, {r.state}<br /><small>{r.address} {r.pinCode ? `– ${r.pinCode}` : ""}</small></td>
                                                    <td>
                                                        <strong>{fv.recommendation === "approve" ? "Recommends approval" : "Recommends rejection"}</strong><br />
                                                        <small>By {fv.by} on {fv.at ? new Date(fv.at).toLocaleString() : "—"}</small>
                                                        {fv.note && <p><small>“{fv.note}”</small></p>}
                                                        <button className="tab-btn" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => toggleHistory(r)}>
                                                            {history[r._id] ? "Hide history" : "Show history"}
                                                        </button>
                                                        {history[r._id] && (
                                                            <ol className="rows" style={{ marginTop: 6 }}>
                                                                {history[r._id].map((e) => (
                                                                    <li key={e._id}><small>{new Date(e.at).toLocaleString()} · {ACTION_TEXT[e.action] || e.action} · {e.actor?.epic} ({e.actor?.role})</small></li>
                                                                ))}
                                                            </ol>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div className="booth-assignment">
                                                            <label>Part number
                                                                <input value={boothFor(r).partNumber} onChange={(e) => setBooth(r, "partNumber", e.target.value)} inputMode="numeric" maxLength={4} disabled={Boolean(busy[r._id])} />
                                                            </label>
                                                            <label>Polling station
                                                                <input value={boothFor(r).pollingStation} onChange={(e) => setBooth(r, "pollingStation", e.target.value)} maxLength={200} disabled={Boolean(busy[r._id])} />
                                                            </label>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="row-actions">
                                                            <button className="btn-approve" onClick={() => approve(r)} disabled={Boolean(busy[r._id])}>
                                                                {busy[r._id] ? "Saving…" : "Approve & add to roll"}
                                                            </button>
                                                            <button className="btn-reject" onClick={() => { setDialogError(""); setDialog(r); }} disabled={Boolean(busy[r._id])}>Reject</button>
                                                        </div>
                                                        {rowErrors[r._id] && <p className="row-error" role="alert">{rowErrors[r._id]}</p>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="panel">
                        <h2>Waiting for BLO field verification ({awaitingBlo.length})</h2>
                        <p className="muted">These cannot be approved until the BLO has verified them. You can still reject an application that is clearly ineligible.</p>
                        {awaitingBlo.length > 0 && (
                            <ul className="rows">
                                {awaitingBlo.map((r) => (
                                    <li key={r._id}>
                                        <strong>{r.name}</strong> · {r.assemblyConstituency} · submitted {new Date(r.submittedAt).toLocaleDateString()}{" "}
                                        <button className="btn-reject" style={{ marginLeft: 8 }} onClick={() => { setDialogError(""); setDialog(r); }} disabled={Boolean(busy[r._id])}>Reject</button>
                                        {rowErrors[r._id] && <p className="row-error" role="alert">{rowErrors[r._id]}</p>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <p><Link to="/electoral-roll">Electoral roll search</Link> · <Link to="/check-request">Application status</Link></p>
                </div>
            </section>

            {dialog && (
                <ReasonDialog
                    title={`Reject application: ${dialog.name}`}
                    label="Reason for rejection (shown to the applicant)"
                    hint="The applicant sees this reason when they check their application status."
                    required
                    confirmLabel="Reject application"
                    busy={dialogBusy}
                    error={dialogError}
                    onConfirm={confirmReject}
                    onCancel={() => setDialog(null)}
                />
            )}
        </>
    );
}

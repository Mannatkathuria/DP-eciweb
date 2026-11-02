import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import ReasonDialog from "./ReasonDialog";
import { homeFor } from "../config/roles";
import { EroTasks, RollVersions } from "./EroRollAndTasks";

// Electoral Registration Officer / Assistant ERO: decides Form 6 applications that the BLO has
// verified in the field. Every request is checked again on the server for permission and for the
// officer's constituency; this page only shows what the server returns.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const DECIDING_ROLES = ["ero", "aero"];
const ACTION_TEXT = {
    "registration.field_verified": "Field verification submitted",
    "registration.approved": "Approved and added to the roll",
    "registration.rejected": "Rejected",
    "change_request.field_verified": "Field verification submitted",
    "change_request.approved": "Approved and roll corrected",
    "change_request.rejected": "Rejected"
};
const FIELD_LABEL = { name: "Name", dateOfBirth: "Date of birth", age: "Age", gender: "Gender", state: "State/UT", district: "District",
    assemblyConstituency: "Constituency", address: "Address", pinCode: "PIN code" };
const show = (k, v) => (k === "dateOfBirth" && v ? String(v).slice(0, 10) : String(v ?? "—"));
// The two kinds of application this page decides.
const KINDS = {
    registration: { base: "/admin/registrations", audit: "registration", label: (r) => r.name },
    change: { base: "/admin/changes", audit: "change_request", label: (r) => `${r.currentRecord?.name || r.epic} (${r.epic})` }
};

export default function EroDecisions() {
    const { logged, userData } = useContext(AuthContext);
    const [verified, setVerified] = useState([]);
    const [awaitingBlo, setAwaitingBlo] = useState([]);
    const [changesVerified, setChangesVerified] = useState([]);
    const [changesAwaitingBlo, setChangesAwaitingBlo] = useState([]);
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
    // Constituencies this officer is assigned to (stable between renders, for the roll section).
    const rollAreas = useMemo(() => assignments
        .filter((a) => a.jurisdiction?.state && a.jurisdiction?.constituency)
        .map((a) => ({ state: a.jurisdiction.state, district: a.jurisdiction.district, constituency: a.jurisdiction.constituency })),
    [assignments]);

    const load = useCallback(async () => {
        setError("");
        try {
            const [v, p, cv, cp, a] = await Promise.all([
                api.get("/admin/registrations", { params: { status: "field_verified" } }),
                api.get("/admin/registrations", { params: { status: "pending" } }),
                api.get("/admin/changes", { params: { status: "field_verified" } }),
                api.get("/admin/changes", { params: { status: "pending" } }),
                api.get("/assignments/me")
            ]);
            setVerified(v.data.data?.items || []);
            setAwaitingBlo(p.data.data?.items || []);
            setChangesVerified(cv.data.data?.items || []);
            setChangesAwaitingBlo(cp.data.data?.items || []);
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

    const approve = async (r, kind = "registration") => {
        const booth = boothFor(r);
        const original = r.fieldVerification || {};
        const corrected = booth.partNumber.trim() !== (original.partNumber || "") || booth.pollingStation.trim() !== (original.pollingStation || "");
        const body = corrected && (booth.partNumber.trim() || booth.pollingStation.trim())
            ? { partNumber: booth.partNumber.trim(), pollingStation: booth.pollingStation.trim() } : {};
        const success = kind === "registration"
            ? ({ data }) => `Approved ${r.name}. EPIC ${data.data?.epic} added to the roll for part ${booth.partNumber}.`
            : () => `Approved the correction for EPIC ${r.epic}. The electoral roll has been updated.`;
        try {
            await run(r._id, () => api.post(`${KINDS[kind].base}/${r._id}/approve`, body), success);
        } catch { /* shown on the row */ }
    };

    const openReject = (item, kind) => { setDialogError(""); setDialog({ item, kind }); };

    const confirmReject = async (reason) => {
        const { item: r, kind } = dialog;
        setDialogBusy(true); setDialogError("");
        try {
            await run(r._id, () => api.post(`${KINDS[kind].base}/${r._id}/reject`, { note: reason }), () => `${kind === "registration" ? "Application" : "Correction request"} from ${KINDS[kind].label(r)} rejected.`);
            setDialog(null);
        } catch (err) {
            if (err.response?.status === 409) setDialog(null);
            else setDialogError(apiMessage(err, "The request failed. Nothing was changed; please try again."));
        } finally {
            setDialogBusy(false);
        }
    };

    const toggleHistory = async (r, kind = "registration") => {
        if (history[r._id]) { setHistory((h) => { const next = { ...h }; delete next[r._id]; return next; }); return; }
        try {
            const res = await api.get(`/audit/${KINDS[kind].audit}/${r._id}`);
            setHistory((h) => ({ ...h, [r._id]: res.data.data?.items || [] }));
        } catch (err) {
            setRowErrors((e) => ({ ...e, [r._id]: apiMessage(err, "Could not load the history.") }));
        }
    };

    const historyBlock = (r, kind) => (
        <>
            <button className="tab-btn" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => toggleHistory(r, kind)}>
                {history[r._id] ? "Hide history" : "Show history"}
            </button>
            {history[r._id] && (
                <ol className="rows" style={{ marginTop: 6 }}>
                    {history[r._id].map((e) => (
                        <li key={e._id}><small>{new Date(e.at).toLocaleString()} · {ACTION_TEXT[e.action] || e.action} · {e.actor?.epic} ({e.actor?.role})</small></li>
                    ))}
                </ol>
            )}
        </>
    );

    const area = assignments.map((a) => [a.jurisdiction?.constituency, a.jurisdiction?.district, a.jurisdiction?.state].filter(Boolean).join(", ")).filter(Boolean);

    return (
        <>
            <PageHead
                title="Electoral roll decisions"
                lede="New registrations (Form 6) and corrections or shifts (Form 8) that your Booth Level Officers have verified in the field. You approve or reject them; only an approval changes the roll."
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
                        <h2>New registrations (Form 6) awaiting your decision ({verified.length})</h2>
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
                                                        {historyBlock(r, "registration")}
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
                                                            <button className="btn-reject" onClick={() => openReject(r, "registration")} disabled={Boolean(busy[r._id])}>Reject</button>
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
                        <h2>Form 6 waiting for BLO field verification ({awaitingBlo.length})</h2>
                        <p className="muted">These cannot be approved until the BLO has verified them. You can still reject an application that is clearly ineligible.</p>
                        {awaitingBlo.length > 0 && (
                            <ul className="rows">
                                {awaitingBlo.map((r) => (
                                    <li key={r._id}>
                                        <strong>{r.name}</strong> · {r.assemblyConstituency} · submitted {new Date(r.submittedAt).toLocaleDateString()}{" "}
                                        <button className="btn-reject" style={{ marginLeft: 8 }} onClick={() => openReject(r, "registration")} disabled={Boolean(busy[r._id])}>Reject</button>
                                        {rowErrors[r._id] && <p className="row-error" role="alert">{rowErrors[r._id]}</p>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="panel">
                        <h2>Corrections and shifts (Form 8) awaiting your decision ({changesVerified.length})</h2>
                        {changesVerified.length === 0 && <p className="muted">No field-verified correction requests are waiting.</p>}
                        {changesVerified.length > 0 && (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr><th>Elector</th><th>Requested change</th><th>BLO field verification</th><th>Booth</th><th>Decision</th></tr>
                                    </thead>
                                    <tbody>
                                        {changesVerified.map((cr) => {
                                            const fv = cr.fieldVerification || {};
                                            return (
                                                <tr key={cr._id}>
                                                    <td><strong>{cr.currentRecord?.name}</strong><br /><code>{cr.epic}</code><br /><small>Submitted {new Date(cr.submittedAt).toLocaleDateString()}</small></td>
                                                    <td>
                                                        {cr.shift && <p><strong>Shift of residence</strong></p>}
                                                        {Object.entries(cr.requestedChanges || {}).filter(([k]) => k !== "age").map(([k, v]) => (
                                                            <div key={k}><small>{FIELD_LABEL[k] || k}: {show(k, cr.currentRecord?.[k])} → <strong>{show(k, v)}</strong></small></div>
                                                        ))}
                                                    </td>
                                                    <td>
                                                        <strong>{fv.recommendation === "approve" ? "Recommends approval" : "Recommends rejection"}</strong><br />
                                                        <small>By {fv.by} on {fv.at ? new Date(fv.at).toLocaleString() : "—"}</small>
                                                        {fv.note && <p><small>“{fv.note}”</small></p>}
                                                        {historyBlock(cr, "change")}
                                                    </td>
                                                    <td>
                                                        {cr.shift || fv.partNumber ? (
                                                            <div className="booth-assignment">
                                                                <label>Part number
                                                                    <input value={boothFor(cr).partNumber} onChange={(e) => setBooth(cr, "partNumber", e.target.value)} inputMode="numeric" maxLength={4} disabled={Boolean(busy[cr._id])} />
                                                                </label>
                                                                <label>Polling station
                                                                    <input value={boothFor(cr).pollingStation} onChange={(e) => setBooth(cr, "pollingStation", e.target.value)} maxLength={200} disabled={Boolean(busy[cr._id])} />
                                                                </label>
                                                            </div>
                                                        ) : <small>Unchanged: part {cr.currentRecord?.partNumber}, {cr.currentRecord?.pollingStation}</small>}
                                                    </td>
                                                    <td>
                                                        <div className="row-actions">
                                                            <button className="btn-approve" onClick={() => approve(cr, "change")} disabled={Boolean(busy[cr._id])}>
                                                                {busy[cr._id] ? "Saving…" : "Approve & correct roll"}
                                                            </button>
                                                            <button className="btn-reject" onClick={() => openReject(cr, "change")} disabled={Boolean(busy[cr._id])}>Reject</button>
                                                        </div>
                                                        {rowErrors[cr._id] && <p className="row-error" role="alert">{rowErrors[cr._id]}</p>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {changesAwaitingBlo.length > 0 && (
                            <>
                                <h3>Waiting for BLO field verification ({changesAwaitingBlo.length})</h3>
                                <ul className="rows">
                                    {changesAwaitingBlo.map((cr) => (
                                        <li key={cr._id}>
                                            <strong>{cr.currentRecord?.name}</strong> ({cr.epic}) · {Object.keys(cr.requestedChanges || {}).filter((k) => k !== "age").map((k) => FIELD_LABEL[k] || k).join(", ")}{" "}
                                            <button className="btn-reject" style={{ marginLeft: 8 }} onClick={() => openReject(cr, "change")} disabled={Boolean(busy[cr._id])}>Reject</button>
                                            {rowErrors[cr._id] && <p className="row-error" role="alert">{rowErrors[cr._id]}</p>}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>

                    <EroTasks canAssign={userData?.role === "ero"} />
                    <RollVersions areas={rollAreas} canPublish={userData?.role === "ero"} />

                    <p><Link to="/electoral-roll">Electoral roll search</Link> · <Link to="/check-request">Application status</Link></p>
                </div>
            </section>

            {dialog && (
                <ReasonDialog
                    title={`Reject ${dialog.kind === "registration" ? "application" : "correction request"}: ${KINDS[dialog.kind].label(dialog.item)}`}
                    label={`Reason for rejection (shown to the ${dialog.kind === "registration" ? "applicant" : "voter"})`}
                    hint={dialog.kind === "registration"
                        ? "The applicant sees this reason when they check their application status."
                        : "The voter sees this reason with their correction request."}
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

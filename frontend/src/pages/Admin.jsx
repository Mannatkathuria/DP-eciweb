import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import { Link, Navigate } from "react-router-dom";
import ReasonDialog from "./ReasonDialog";
import "./Admin.css";

// Mirrors the backend checks in parseBoothAssignment (admin.controllers.js).
// Returns what is wrong with the booth assignment, or "" when it can be submitted.
const assignmentProblem = ({ partNumber, pollingStation }) => {
    const part = (partNumber || "").trim();
    const station = (pollingStation || "").trim().replace(/\s+/g, " ");
    if (!part && !station) return "Enter a part number and a polling station before approving.";
    if (!part) return "Enter a part number before approving.";
    if (!/^[1-9]\d{0,3}$/.test(part)) return "Part number must be a whole number from 1 to 9999.";
    if (!station) return "Enter the polling station before approving.";
    if (station.length < 3) return "Polling station must be at least 3 characters.";
    if (station.length > 200) return "Polling station must be 200 characters or fewer.";
    return "";
};

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;

// Text for the reason dialog, per kind of decision.
const DIALOGS = {
    rejectRegistration: (r) => ({
        title: `Reject application: ${r.name}`, label: "Reason for rejection (shown to the applicant)",
        hint: "The applicant sees this reason when they check their application status.",
        required: true, confirmLabel: "Reject application"
    }),
    rejectChange: (cr) => ({
        title: `Reject correction request: ${cr.currentRecord?.name || cr.epic}`, label: "Reason for rejection (shown to the voter)",
        hint: "The voter sees this reason with their correction request.", required: true, confirmLabel: "Reject request"
    }),
    clearCase: () => ({
        title: "Clear and verify this case", label: "Approval note for the voter record",
        hint: "The voter will be marked as verified.", required: false, confirmLabel: "Clear & verify", confirmClass: "btn-approve"
    }),
    escalateCase: () => ({
        title: "Escalate this case", label: "Reason for escalating",
        hint: "The case is marked for manual field inspection.", required: false, confirmLabel: "Escalate"
    })
};

const fmt = (n, unit = "") => (n === null || n === undefined ? "—" : `${n}${unit}`);

function Admin() {
    const { logged, user, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();

    const [activeTab, setActiveTab] = useState("cases"); // "cases" | "changes" | "registrations" | "stats"
    const [caseFilter, setCaseFilter] = useState("all"); // "all" | "review_required" | "verified" | "in_progress"

    const [stats, setStats] = useState(null);
    const [cases, setCases] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [changeRequests, setChangeRequests] = useState([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    // A failed section shows its own error instead of looking like an empty list.
    const [sectionErrors, setSectionErrors] = useState({});

    // Items with a request in flight (their buttons are disabled), and per-row error messages.
    const [busyIds, setBusyIds] = useState({});
    const [rowErrors, setRowErrors] = useState({});

    // Reason dialog: { kind, item } while open.
    const [dialog, setDialog] = useState(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const [dialogError, setDialogError] = useState("");

    // Modal state for viewing document / AI review details
    const [selectedItemForModal, setSelectedItemForModal] = useState(null);

    // Part number and polling station assignments per pending registration
    const [assignments, setAssignments] = useState({});

    // Every list comes from the server, so the dashboard always shows the saved state.
    // A section that fails keeps its previous data and shows an error instead of an empty list.
    const loadData = useCallback(async () => {
        setLoading(true);
        const verificationParams = { limit: 50 };
        if (caseFilter && caseFilter !== "all") {
            verificationParams.status = caseFilter;
        }

        const [sRes, vRes, rRes, cRes] = await Promise.allSettled([
            api.get("/admin/stats"),
            api.get("/admin/verifications", { params: verificationParams }),
            api.get("/admin/registrations", { params: { status: "pending" } }),
            api.get("/admin/changes", { params: { status: "pending" } })
        ]);

        const errors = {};
        if (sRes.status === "fulfilled") setStats(sRes.value.data.data);
        else errors.stats = apiMessage(sRes.reason, "Could not load statistics.");
        if (vRes.status === "fulfilled") setCases(vRes.value.data.data?.items || []);
        else errors.cases = apiMessage(vRes.reason, "Could not load verification cases.");
        if (rRes.status === "fulfilled") setRegistrations(rRes.value.data.data?.items || []);
        else errors.registrations = apiMessage(rRes.reason, "Could not load registration applications.");
        if (cRes.status === "fulfilled") setChangeRequests(cRes.value.data.data?.items || []);
        else errors.changes = apiMessage(cRes.reason, "Could not load change requests.");

        setSectionErrors(errors);
        setLoading(false);
    }, [caseFilter]);

    useEffect(() => {
        if (logged) loadData();
    }, [logged, loadData]);

    const setBusy = (id, on) => setBusyIds((b) => ({ ...b, [id]: on }));
    const setRowError = (id, message) => setRowErrors((e) => ({ ...e, [id]: message }));
    const clearMessages = (id) => { setError(""); setNotice(""); if (id) setRowError(id, ""); };

    // Runs a decision request for one item. The item leaves its list only when the server
    // confirms, because the list is reloaded from the server afterwards.
    const runDecision = async (id, request, successMessage) => {
        setBusy(id, true);
        try {
            const result = await request();
            setNotice(successMessage(result));
            await loadData();
            return true;
        } catch (err) {
            const message = apiMessage(err, "The request failed. Nothing was changed; please try again.");
            if (err.response?.status === 409) {
                // Already decided or being decided elsewhere: show the current saved state.
                setError(message);
                await loadData();
            } else {
                setRowError(id, message);
            }
            throw err;
        } finally {
            setBusy(id, false);
        }
    };

    // Registration assignment helpers
    const assignmentFor = (r) => ({
        partNumber: assignments[r._id]?.partNumber ?? r.partNumber ?? "",
        pollingStation: assignments[r._id]?.pollingStation ?? r.pollingStation ?? ""
    });

    const updateAssignment = (r, field, value) => {
        setAssignments(a => ({ ...a, [r._id]: { ...assignmentFor(r), [field]: value } }));
        setRowError(r._id, "");
    };

    const approveRegistration = async (r) => {
        if (busyIds[r._id]) return;
        clearMessages(r._id);
        const assignment = assignmentFor(r);
        const problem = assignmentProblem(assignment);
        if (problem) { setRowError(r._id, problem); return; }
        const body = { partNumber: assignment.partNumber.trim(), pollingStation: assignment.pollingStation.trim() };
        try {
            await runDecision(r._id,
                () => api.post(`/admin/registrations/${r._id}/approve`, body),
                ({ data }) => `Approved ${r.name}. EPIC ${data.data?.epic} issued for part ${body.partNumber}, ${body.pollingStation}.`);
            setAssignments((a) => { const next = { ...a }; delete next[r._id]; return next; });
        } catch {
            // The row stays visible with the entered assignment and its error message.
        }
    };

    const approveChangeRequest = async (cr) => {
        if (busyIds[cr._id]) return;
        clearMessages(cr._id);
        try {
            await runDecision(cr._id,
                () => api.post(`/admin/changes/${cr._id}/approve`, {}),
                () => `Change request approved. The electoral roll record for EPIC ${cr.epic} has been updated.`);
        } catch {
            // Error shown on the row.
        }
    };

    // Opens the reason dialog. Nothing is sent until the BLO confirms it.
    const openDialog = (kind, item) => {
        if (busyIds[item._id]) return;
        clearMessages(item._id);
        setDialogError("");
        setDialog({ kind, item });
    };

    const closeDialog = useCallback(() => {
        setDialog(null);
        setDialogError("");
    }, []);

    const confirmDialog = async (reason) => {
        const { kind, item } = dialog;
        const requests = {
            rejectRegistration: [() => api.post(`/admin/registrations/${item._id}/reject`, { note: reason }), () => `Application from ${item.name} rejected.`],
            rejectChange: [() => api.post(`/admin/changes/${item._id}/reject`, { note: reason }), () => "Change request rejected."],
            clearCase: [() => api.patch(`/admin/verifications/${item._id}/resolve`, { decision: "cleared", note: reason }), () => "Case cleared: voter identity verified."],
            escalateCase: [() => api.patch(`/admin/verifications/${item._id}/resolve`, { decision: "escalated", note: reason }), () => "Case escalated for manual field inspection."]
        };
        const [request, success] = requests[kind];
        setDialogBusy(true);
        setDialogError("");
        try {
            await runDecision(item._id, request, success);
            closeDialog();
        } catch (err) {
            if (err.response?.status === 409) closeDialog();
            else setDialogError(apiMessage(err, "The request failed. Nothing was changed; please try again."));
        } finally {
            setDialogBusy(false);
        }
    };

    if (!logged) return <Navigate to="/blo/login" replace />;
    if (userData?.role === "blo" && userData.mustChangePassword) return <Navigate to="/blo/password" replace />;
    if (userData?.role !== "blo" && userData?.role !== "admin") {
        return <Navigate to={userData?.role === "eci" ? "/eci/dashboard" : "/dashboard"} replace />;
    }

    return (
        <main className="admin-page">
            <div className="admin-container">
                <header className="admin-header">
                    <div>
                        <p className="eyebrow">Election Commission of India · BLO Portal</p>
                        <h1>{t("admin.title") || "Booth Level Officer Dashboard"}</h1>
                        <p>{t("common.signedInAs") || "Signed in as"} <strong>{userData?.name || user}</strong> (BLO ID: {userData?.bloId || user})</p>
                    </div>
                    <div className="admin-actions">
                        <Link to="/" className="secondary-btn">{t("common.home") || "Home"}</Link>
                        <Link to="/electoral-roll" className="secondary-btn">Electoral Roll</Link>
                        <button className="back-button" onClick={logout}>{t("common.signOut") || "Sign Out"}</button>
                    </div>
                </header>

                {error && <div className="verification-error" role="alert">{error}</div>}
                {notice && <div className="admin-notice" role="status">{notice}</div>}

                {/* Navigation Tabs */}
                <div className="admin-nav-tabs">
                    <button
                        className={`tab-btn ${activeTab === "cases" ? "active" : ""}`}
                        onClick={() => setActiveTab("cases")}
                    >
                        📋 Identity Verification Cases ({cases.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "changes" ? "active" : ""}`}
                        onClick={() => setActiveTab("changes")}
                    >
                        ✎ Change Requests (Form 8) ({changeRequests.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "registrations" ? "active" : ""}`}
                        onClick={() => setActiveTab("registrations")}
                    >
                        👤 New Registrations (Form 6) ({registrations.length})
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "stats" ? "active" : ""}`}
                        onClick={() => setActiveTab("stats")}
                    >
                        📊 Statistics & Summary
                    </button>
                </div>

                {/* TAB 1: IDENTITY VERIFICATION CASES */}
                {activeTab === "cases" && (
                    <section className="admin-card">
                        <div className="admin-toolbar">
                            <div>
                                <h2>Identity Verification Cases</h2>
                                <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
                                    Persona E-KYC verifications and biometric cases with automated Gemini AI reviews.
                                </p>
                            </div>

                            {/* Sub-filters for cases */}
                            <div className="filter-pills">
                                <button
                                    className={`filter-pill ${caseFilter === "all" ? "active" : ""}`}
                                    onClick={() => setCaseFilter("all")}
                                >
                                    All Cases
                                </button>
                                <button
                                    className={`filter-pill ${caseFilter === "review_required" ? "active" : ""}`}
                                    onClick={() => setCaseFilter("review_required")}
                                >
                                    Needs Review
                                </button>
                                <button
                                    className={`filter-pill ${caseFilter === "verified" ? "active" : ""}`}
                                    onClick={() => setCaseFilter("verified")}
                                >
                                    Verified
                                </button>
                                <button
                                    className={`filter-pill ${caseFilter === "in_progress" ? "active" : ""}`}
                                    onClick={() => setCaseFilter("in_progress")}
                                >
                                    In Progress
                                </button>
                            </div>
                        </div>

                        {sectionErrors.cases && <div className="verification-error" role="alert">{sectionErrors.cases}</div>}
                        {loading && <p>{t("common.loading") || "Loading cases…"}</p>}
                        {!loading && !sectionErrors.cases && cases.length === 0 && (
                            <p style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
                                {t("admin.noCases") || "No verification cases found matching this filter."}
                            </p>
                        )}

                        {!loading && cases.length > 0 && (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>Elector & Booth</th>
                                            <th>EPIC</th>
                                            <th>Status</th>
                                            <th style={{ minWidth: "260px" }}>Gemini AI Document Review</th>
                                            <th>Action / Resolution</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cases.map((v) => {
                                            const ai = v.aiReview || v.identity?.aiReview;
                                            return (
                                                <tr key={v._id}>
                                                    <td>{new Date(v.createdAt || v.startedAt || 0).toLocaleString()}</td>
                                                    <td>
                                                        <strong>{v.elector?.name || v.identity?.extractedFields?.name || "Voter"}</strong>
                                                        <br />
                                                        <small>{v.elector?.pollingStation || "Booth: " + (v.elector?.partNumber || "Pending")}</small>
                                                    </td>
                                                    <td><code>{v.epic}</code></td>
                                                    <td>
                                                        <span className={`badge ${
                                                            v.status === "verified" ? "badge-verified" :
                                                            v.status === "review_required" ? "badge-review" :
                                                            v.status === "declined" ? "badge-rejected" : "badge-progress"
                                                        }`}>
                                                            {v.status === "verified" ? "VERIFIED" :
                                                             v.status === "review_required" ? "NEEDS REVIEW" :
                                                             v.status === "declined" ? "DECLINED" : "IN PROGRESS"}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {ai ? (
                                                            <div className={`ai-review-box ${
                                                                ai.riskLevel === "LOW" ? "ai-risk-low" :
                                                                ai.riskLevel === "HIGH" ? "ai-risk-high" : "ai-risk-medium"
                                                            }`}>
                                                                <strong>🤖 AI Risk: {ai.riskLevel} ({ai.confidenceScore || 90}%)</strong>
                                                                <div>{ai.shortAiReview}</div>
                                                                {ai.anomalies?.length > 0 && (
                                                                    <div style={{ color: "#c62828", marginTop: "4px" }}>
                                                                        ⚠ {ai.anomalies.join("; ")}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                                                                Persona identity check initiated. Awaiting final analysis.
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {v.status === "review_required" && !v.resolution?.decision ? (
                                                            <>
                                                                <div className="row-actions">
                                                                    <button
                                                                        className="btn-approve"
                                                                        onClick={() => openDialog("clearCase", v)}
                                                                        disabled={Boolean(busyIds[v._id])}
                                                                    >
                                                                        ✓ Clear & Verify
                                                                    </button>
                                                                    <button
                                                                        className="btn-reject"
                                                                        onClick={() => openDialog("escalateCase", v)}
                                                                        disabled={Boolean(busyIds[v._id])}
                                                                    >
                                                                        ⚠ Escalate
                                                                    </button>
                                                                </div>
                                                                {rowErrors[v._id] && <p className="row-error" role="alert">{rowErrors[v._id]}</p>}
                                                            </>
                                                        ) : v.resolution?.decision ? (
                                                            <span style={{ fontSize: "12px" }}>
                                                                Resolved: <strong>{v.resolution.decision.toUpperCase()}</strong> by {v.resolution.byEpic || v.resolution.by}
                                                            </span>
                                                        ) : v.status === "verified" ? (
                                                            <span style={{ color: "#2e7d32", fontSize: "12px" }}>✓ Verified Profile</span>
                                                        ) : (
                                                            <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>Awaiting flow</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* TAB 2: ELECTORAL ROLL CHANGE REQUESTS (FORM 8) */}
                {activeTab === "changes" && (
                    <section className="admin-card">
                        <div className="admin-toolbar">
                            <div>
                                <h2>Electoral Roll Change Requests (Form 8)</h2>
                                <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
                                    Review requested voter corrections with proof documents and Gemini AI anomaly checks. Approvals reflect immediately in the live electoral roll.
                                </p>
                            </div>
                        </div>

                        {sectionErrors.changes && <div className="verification-error" role="alert">{sectionErrors.changes}</div>}
                        {!sectionErrors.changes && changeRequests.length === 0 && (
                            <p style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
                                No pending change requests to review.
                            </p>
                        )}

                        {changeRequests.length > 0 && (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Submitted</th>
                                            <th>Voter & EPIC</th>
                                            <th>Current Record</th>
                                            <th>Requested Changes</th>
                                            <th>Document Proof</th>
                                            <th style={{ minWidth: "220px" }}>Gemini AI Sanity Check</th>
                                            <th>BLO Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {changeRequests.map((cr) => (
                                            <tr key={cr._id}>
                                                <td>{new Date(cr.submittedAt).toLocaleString()}</td>
                                                <td>
                                                    <strong>{cr.currentRecord?.name}</strong>
                                                    <br />
                                                    <code>{cr.epic}</code>
                                                </td>
                                                <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                                    <div><strong>Address:</strong> {cr.currentRecord?.address}</div>
                                                    <div><strong>Constituency:</strong> {cr.currentRecord?.assemblyConstituency}</div>
                                                    <div><strong>DOB:</strong> {cr.currentRecord?.dateOfBirth?.slice(0, 10)}</div>
                                                </td>
                                                <td style={{ fontSize: "12px", color: "var(--accent)" }}>
                                                    {Object.entries(cr.requestedChanges || {}).map(([k, val]) => (
                                                        <div key={k}>
                                                            <strong>{k}:</strong> {String(val)}
                                                        </div>
                                                    ))}
                                                </td>
                                                <td>
                                                    {cr.documentProof ? (
                                                        <button
                                                            className="tab-btn"
                                                            style={{ padding: "4px 8px", fontSize: "11px" }}
                                                            onClick={() => setSelectedItemForModal({ title: `Document Proof: ${cr.currentRecord?.name}`, image: cr.documentProof })}
                                                        >
                                                            🔍 View Proof Image
                                                        </button>
                                                    ) : "No proof"}
                                                </td>
                                                <td>
                                                    {cr.aiReview ? (
                                                        <div className={`ai-review-box ${
                                                            cr.aiReview.riskLevel === "LOW" ? "ai-risk-low" :
                                                            cr.aiReview.riskLevel === "HIGH" ? "ai-risk-high" : "ai-risk-medium"
                                                        }`}>
                                                            <strong>🤖 AI Risk: {cr.aiReview.riskLevel}</strong>
                                                            <div>{cr.aiReview.shortAiReview}</div>
                                                            {cr.aiReview.anomalies?.length > 0 && (
                                                                <div style={{ color: "#c62828", marginTop: "2px" }}>
                                                                    ⚠ {cr.aiReview.anomalies.join("; ")}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : "Heuristic check passed."}
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => approveChangeRequest(cr)}
                                                            disabled={Boolean(busyIds[cr._id])}
                                                        >
                                                            {busyIds[cr._id] ? "Saving…" : "✓ Approve Changes"}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => openDialog("rejectChange", cr)}
                                                            disabled={Boolean(busyIds[cr._id])}
                                                        >
                                                            ✕ Reject
                                                        </button>
                                                    </div>
                                                    {rowErrors[cr._id] && <p className="row-error" role="alert">{rowErrors[cr._id]}</p>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* TAB 3: NEW REGISTRATIONS (FORM 6) */}
                {activeTab === "registrations" && (
                    <section className="admin-card">
                        <div className="admin-toolbar">
                            <div>
                                <h2>New Voter Registration Applications (Form 6)</h2>
                                <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
                                    Assign Part Number and Polling Station to approve new voters and generate their official EPIC.
                                </p>
                            </div>
                        </div>

                        {sectionErrors.registrations && <div className="verification-error" role="alert">{sectionErrors.registrations}</div>}
                        {!sectionErrors.registrations && registrations.length === 0 && (
                            <p style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
                                {t("admin.noRequests") || "No pending registration applications found."}
                            </p>
                        )}

                        {registrations.length > 0 && (
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Submitted</th>
                                            <th>Applicant</th>
                                            <th>DOB & Gender</th>
                                            <th>Constituency & Address</th>
                                            <th style={{ minWidth: "200px" }}>Document & AI Review</th>
                                            <th>Booth Assignment *</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {registrations.map((r) => (
                                            <tr key={r._id}>
                                                <td>{new Date(r.submittedAt).toLocaleString()}</td>
                                                <td>
                                                    <strong>{r.name}</strong>
                                                </td>
                                                <td>
                                                    {new Date(r.dateOfBirth).toLocaleDateString()}
                                                    <br />
                                                    <small>{r.gender}</small>
                                                </td>
                                                <td>
                                                    {r.assemblyConstituency}, {r.district}, {r.state}
                                                    <br />
                                                    <small>{r.address} {r.pinCode ? `– ${r.pinCode}` : ""}</small>
                                                </td>
                                                <td>
                                                    {r.referenceImage && (
                                                        <button
                                                            className="tab-btn"
                                                            style={{ padding: "4px 8px", fontSize: "11px", marginBottom: "6px" }}
                                                            onClick={() => setSelectedItemForModal({ title: `Applicant Document: ${r.name}`, image: r.referenceImage })}
                                                        >
                                                            🔍 View Document
                                                        </button>
                                                    )}
                                                    {r.aiReview && (
                                                        <div className={`ai-review-box ${
                                                            r.aiReview.riskLevel === "LOW" ? "ai-risk-low" : "ai-risk-medium"
                                                        }`}>
                                                            <strong>🤖 AI Risk: {r.aiReview.riskLevel}</strong>
                                                            <div>{r.aiReview.shortAiReview}</div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="booth-assignment">
                                                        <label>
                                                            {t("register.partNumber") || "Part Number (1-9999)"}
                                                            <input
                                                                value={assignmentFor(r).partNumber}
                                                                onChange={e => updateAssignment(r, "partNumber", e.target.value)}
                                                                disabled={Boolean(busyIds[r._id])}
                                                                inputMode="numeric"
                                                                maxLength={4}
                                                                placeholder="e.g. 42"
                                                                required
                                                            />
                                                        </label>
                                                        <label>
                                                            {t("register.pollingStation") || "Polling Station Name"}
                                                            <input
                                                                value={assignmentFor(r).pollingStation}
                                                                onChange={e => updateAssignment(r, "pollingStation", e.target.value)}
                                                                disabled={Boolean(busyIds[r._id])}
                                                                maxLength={200}
                                                                placeholder="e.g. Govt Senior Secondary School"
                                                                required
                                                            />
                                                        </label>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button
                                                            className="btn-approve"
                                                            onClick={() => approveRegistration(r)}
                                                            disabled={Boolean(busyIds[r._id])}
                                                        >
                                                            {busyIds[r._id] ? "Saving…" : (t("admin.approve") || "Approve & Issue EPIC")}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => openDialog("rejectRegistration", r)}
                                                            disabled={Boolean(busyIds[r._id])}
                                                        >
                                                            {t("admin.reject") || "Reject"}
                                                        </button>
                                                    </div>
                                                    {rowErrors[r._id] && <p className="row-error" role="alert">{rowErrors[r._id]}</p>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {/* TAB 4: STATISTICS & METRICS */}
                {activeTab === "stats" && sectionErrors.stats && (
                    <div className="verification-error" role="alert">{sectionErrors.stats}</div>
                )}
                {activeTab === "stats" && stats && (
                    <section className="stat-grid">
                        <div className="stat"><span>{t("admin.total") || "Total Verifications"}</span><strong>{stats.total}</strong></div>
                        <div className="stat"><span>{t("verification.verified") || "Verified"}</span><strong>{stats.verified}</strong></div>
                        <div className="stat"><span>{t("admin.bloReview") || "Needs Review"}</span><strong>{stats.reviewRequired}</strong></div>
                        <div className="stat"><span>In Progress</span><strong>{stats.inProgress || 0}</strong></div>
                        <div className="stat"><span>{t("admin.successRate") || "Success Rate"}</span><strong>{fmt(stats.verificationSuccessRate, "%")}</strong></div>
                        <div className="stat"><span>{t("admin.manualInterventions") || "Intervention Rate"}</span><strong>{fmt(stats.manualInterventionsPer100, "%")}</strong></div>
                        <div className="stat"><span>Pending Change Requests</span><strong>{changeRequests.length}</strong></div>
                        <div className="stat"><span>Pending New Registrations</span><strong>{registrations.length}</strong></div>
                    </section>
                )}

                {dialog && (
                    <ReasonDialog
                        {...DIALOGS[dialog.kind](dialog.item)}
                        busy={dialogBusy}
                        error={dialogError}
                        onConfirm={confirmDialog}
                        onCancel={closeDialog}
                    />
                )}

                {/* Document Preview Modal */}
                {selectedItemForModal && (
                    <div className="modal-overlay" style={{
                        position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
                        background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px"
                    }}>
                        <div style={{
                            background: "var(--bg-primary, #fff)",
                            maxWidth: "700px",
                            width: "100%",
                            borderRadius: "16px",
                            padding: "24px",
                            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <h3>{selectedItemForModal.title}</h3>
                                <button
                                    onClick={() => setSelectedItemForModal(null)}
                                    style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer" }}
                                >
                                    ✕
                                </button>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <img
                                    src={selectedItemForModal.image}
                                    alt="Uploaded Document"
                                    style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: "8px", objectFit: "contain" }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

export default Admin;

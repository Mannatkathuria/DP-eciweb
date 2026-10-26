import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import { Link, Navigate } from "react-router-dom";
import "./Admin.css";

// Mirrors the backend checks in parseBoothAssignment (admin.controllers.js).
const validAssignment = ({ partNumber, pollingStation }) =>
    /^[1-9]\d{0,3}$/.test((partNumber || "").trim()) &&
    (pollingStation || "").trim().replace(/\s+/g, " ").length >= 3 &&
    (pollingStation || "").trim().length <= 200;

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

    // Modal state for viewing document / AI review details
    const [selectedItemForModal, setSelectedItemForModal] = useState(null);

    // Part number and polling station assignments per pending registration
    const [assignments, setAssignments] = useState({});

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const verificationParams = { limit: 50 };
            if (caseFilter && caseFilter !== "all") {
                verificationParams.status = caseFilter;
            }

            const [sRes, vRes, rRes, cRes] = await Promise.all([
                api.get("/admin/stats").catch(() => ({ data: { data: null } })),
                api.get("/admin/verifications", { params: verificationParams }),
                api.get("/admin/registrations", { params: { status: "pending" } }),
                api.get("/admin/changes", { params: { status: "pending" } }).catch(() => ({ data: { data: { items: [] } } }))
            ]);

            setStats(sRes.data.data);
            setCases(vRes.data.data?.items || []);
            setRegistrations(rRes.data.data?.items || []);
            setChangeRequests(cRes.data.data?.items || []);
        } catch (err) {
            console.error("Admin data load error:", err);
            setError(t("admin.loadFailed") || "Could not load administrative data.");
        } finally {
            setLoading(false);
        }
    }, [caseFilter, t]);

    useEffect(() => {
        if (logged) loadData();
    }, [logged, loadData]);

    // Resolve Persona / Identity Verification Case
    const resolveCase = async (id, decision) => {
        const note = window.prompt(decision === "cleared"
            ? "Add optional approval note for the voter record:"
            : "Reason for escalating / rejecting case:") ?? "";
        try {
            await api.patch(`/admin/verifications/${id}/resolve`, { decision, note });
            setNotice(decision === "cleared"
                ? "Case cleared: Voter identity verified successfully."
                : "Case escalated for manual field inspection.");
            loadData();
        } catch (err) {
            setError(err.response?.data?.message || t("admin.caseUpdateFailed") || "Failed to update case.");
        }
    };

    // Registration assignment helpers
    const assignmentFor = (r) => ({
        partNumber: assignments[r._id]?.partNumber ?? r.partNumber ?? "",
        pollingStation: assignments[r._id]?.pollingStation ?? r.pollingStation ?? ""
    });

    const updateAssignment = (r, field, value) =>
        setAssignments(a => ({ ...a, [r._id]: { ...assignmentFor(r), [field]: value } }));

    const decideRegistration = async (r, decision) => {
        const id = r._id;
        setError(""); setNotice("");
        let body = {};
        if (decision === "approve") {
            const assignment = assignmentFor(r);
            if (!validAssignment(assignment)) { setError(t("admin.assignmentInvalid") || "Assign both part number (1-9999) and polling station."); return; }
            body = { partNumber: assignment.partNumber.trim(), pollingStation: assignment.pollingStation.trim() };
        }
        if (decision === "reject") {
            const note = window.prompt(t("admin.rejectPrompt") || "Reason for rejecting this voter registration:") ?? "";
            body = { note };
        }
        try {
            const { data } = await api.post(`/admin/registrations/${id}/${decision}`, body);
            setNotice(decision === "approve"
                ? `Registration approved! New EPIC allocated: ${data.data?.epic}. Electoral roll updated.`
                : "Registration request rejected.");
            loadData();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to process registration request.");
        }
    };

    // Decide Change Request (Form 8)
    const decideChangeRequest = async (cr, decision) => {
        setError(""); setNotice("");
        let note = "";
        if (decision === "reject") {
            note = window.prompt("Reason for rejecting this correction request:") ?? "";
        }
        try {
            await api.post(`/admin/changes/${cr._id}/${decision}`, { note });
            setNotice(decision === "approve"
                ? `Change request approved! Changes for EPIC ${cr.epic} immediately updated in the live electoral roll.`
                : "Change request rejected.");
            loadData();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to process change request.");
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

                        {loading && <p>{t("common.loading") || "Loading cases…"}</p>}
                        {!loading && cases.length === 0 && (
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
                                                            v.status === "review_required" ? "badge-review" : "badge-progress"
                                                        }`}>
                                                            {v.status === "verified" ? "VERIFIED" :
                                                             v.status === "review_required" ? "NEEDS REVIEW" : "IN PROGRESS"}
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
                                                            <div className="row-actions">
                                                                <button
                                                                    className="btn-approve"
                                                                    onClick={() => resolveCase(v._id, "cleared")}
                                                                >
                                                                    ✓ Clear & Verify
                                                                </button>
                                                                <button
                                                                    className="btn-reject"
                                                                    onClick={() => resolveCase(v._id, "escalated")}
                                                                >
                                                                    ⚠ Escalate
                                                                </button>
                                                            </div>
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

                        {changeRequests.length === 0 && (
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
                                                            onClick={() => decideChangeRequest(cr, "approve")}
                                                        >
                                                            ✓ Approve Changes
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => decideChangeRequest(cr, "reject")}
                                                        >
                                                            ✕ Reject
                                                        </button>
                                                    </div>
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

                        {registrations.length === 0 && (
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
                                                            onClick={() => decideRegistration(r, "approve")}
                                                            disabled={!validAssignment(assignmentFor(r))}
                                                        >
                                                            {t("admin.approve") || "Approve & Issue EPIC"}
                                                        </button>
                                                        <button
                                                            className="btn-reject"
                                                            onClick={() => decideRegistration(r, "reject")}
                                                        >
                                                            {t("admin.reject") || "Reject"}
                                                        </button>
                                                    </div>
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

import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import "./Dashboard.css";

function Dashboard() {
    const { logged, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const [verification, setVerification] = useState(null);
    const [verificationError, setVerificationError] = useState("");
    const [elector, setElector] = useState(null);
    const [changeRequests, setChangeRequests] = useState([]);
    const [showChangeModal, setShowChangeModal] = useState(false);

    // Form 8 state
    const [changeForm, setChangeForm] = useState({
        name: "",
        dateOfBirth: "",
        gender: "",
        address: "",
        state: "",
        district: "",
        assemblyConstituency: "",
        pinCode: "",
        documentProof: ""
    });
    const [submittingChange, setSubmittingChange] = useState(false);
    const [changeNotice, setChangeNotice] = useState("");
    const [changeError, setChangeError] = useState("");
    const [aiFeedback, setAiFeedback] = useState(null);

    // Geography state for dependent dropdowns in correction form
    const [geography, setGeography] = useState(null);

    useEffect(() => {
        if (!logged || userData?.role !== "voter") return;
        api.get("/persona/status")
            .then(({ data }) => setVerification(data.data))
            .catch(() => setVerificationError(t("dashboard.statusUnavailable")));
    }, [logged, userData?.role, t]);

    const loadElector = () => {
        if (!logged || userData?.role !== "voter" || !userData?.epic) return;
        api.post("/electors/search", { method: "epic", epic: userData.epic })
            .then(({ data }) => {
                setElector(data.data);
                if (data.data) {
                    setChangeForm(prev => ({
                        ...prev,
                        name: data.data.name || "",
                        dateOfBirth: data.data.dateOfBirth ? data.data.dateOfBirth.slice(0, 10) : "",
                        gender: data.data.gender || "Male",
                        address: data.data.address || "",
                        state: data.data.state || "",
                        district: data.data.district || "",
                        assemblyConstituency: data.data.assemblyConstituency || "",
                        pinCode: data.data.pinCode || ""
                    }));
                }
            })
            .catch(() => setElector(null));
    };

    const loadChangeRequests = () => {
        if (!logged || userData?.role !== "voter") return;
        api.get("/changes/my")
            .then(({ data }) => setChangeRequests(data.data?.items || []))
            .catch(() => setChangeRequests([]));
    };

    useEffect(() => {
        loadElector();
        loadChangeRequests();
        api.get("/auth/geography")
            .then(({ data }) => setGeography(data.data))
            .catch(() => {});
    }, [logged, userData?.role, userData?.epic]);

    // Handle document proof image upload
    const handleDocumentUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setChangeError("Document image must be under 5 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setChangeForm(prev => ({ ...prev, documentProof: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    const submitCorrection = async (e) => {
        e.preventDefault();
        setChangeError("");
        setChangeNotice("");
        setAiFeedback(null);

        if (!changeForm.documentProof) {
            setChangeError("Please upload a supporting identity document proof (Aadhaar, Passport, Utility bill).");
            return;
        }

        setSubmittingChange(true);
        try {
            const { data } = await api.post("/changes", changeForm);
            setChangeNotice(data.message || "Change request submitted successfully.");
            if (data.data?.aiReview) {
                setAiFeedback(data.data.aiReview);
            }
            loadChangeRequests();
            setTimeout(() => {
                setShowChangeModal(false);
            }, 3000);
        } catch (err) {
            setChangeError(err.response?.data?.message || "Failed to submit change request.");
        } finally {
            setSubmittingChange(false);
        }
    };

    if (!logged) return <Navigate to="/login?role=voter" replace />;
    if (userData?.role === "eci") return <Navigate to="/eci/dashboard" replace />;
    if (userData?.role === "blo" || userData?.role === "admin") return <Navigate to="/admin" replace />;

    const verified = verification?.status === "verified" || userData?.verified;

    // Dependent geography options
    const districts = geography?.states?.[changeForm.state]?.districts || {};
    const constituencies = districts[changeForm.district]?.assemblyConstituencies || [];

    return (
        <main className="dashboard">
            <header className="voter-dashboard-header">
                <div>
                    <p className="eyebrow">{t("dashboard.voterTitle") || "Voter Services"}</p>
                    <p>{t("common.signedInAs") || "Signed in as"} <strong>{userData?.name || userData?.epic}</strong> (EPIC: {userData?.epic})</p>
                </div>
                <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>
                    {t("common.signOut") || "Sign Out"}
                </button>
            </header>

            <section className="hero">
                <p className="eyebrow">Digital Election Services · ECI</p>
                <h1>{t("dashboard.welcome") || "Welcome"}{userData?.name ? `, ${userData.name}` : ""}</h1>
                <p className="hero-description">{t("dashboard.manageRecord") || "Manage your electoral roll profile, verify your identity, and view your assigned polling booth."}</p>

                {location.state?.verifiedSuccess && (
                    <div className="voter-verification-success" style={{ animation: "fadeIn 0.5s ease" }} role="status">
                        <strong>✓ Identity Verification Successfully Completed!</strong>
                        <p>Your biometric and document check has been authenticated and linked with your EPIC record.</p>
                    </div>
                )}

                {/* Verification Status Banner */}
                {!verified && (
                    <div className="voter-verification-warning" role="status">
                        <strong>{t("dashboard.notVerified") || "Identity Not Verified"}</strong>
                        <p>
                            {verification?.status === "pending_review"
                                ? (t("dashboard.pendingReview") || "Your verification was submitted and is pending review by your Booth Level Officer.")
                                : verification?.status === "pending"
                                    ? (t("dashboard.verificationInProgress") || "Verification in progress.")
                                    : (t("dashboard.completeVerification") || "Verify your identity with our in-app verification flow.")}
                        </p>
                        {verificationError && <p>{verificationError}</p>}
                        <Link to="/verify" className="primary-btn">
                            {verification?.status === "pending" ? "Resume In-App Verification" : "Verify Identity with Persona"}
                        </Link>
                    </div>
                )}

                {verified && (
                    <div className="voter-verification-success">
                        <strong>✓ Verified Voter Profile</strong>
                        <p>Your identity has been authenticated against the Election Commission of India databases.</p>
                    </div>
                )}

                {/* Polling Booth & On-Day Voting Status */}
                {elector && (
                    <div className="notice" role="status" style={{ textAlign: "left" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                            <div>
                                <strong>Your Polling Booth & Electoral Details</strong>
                                <p><strong>Assembly Constituency:</strong> {elector.assemblyConstituency}, {elector.district}, {elector.state}</p>
                                <p><strong>{t("register.partNumber") || "Part Number"}:</strong> {elector.partNumber || "Pending BLO assignment"}</p>
                                <p><strong>{t("register.pollingStation") || "Polling Station"}:</strong> {elector.pollingStation || "Pending BLO assignment"}</p>
                            </div>

                            <div style={{ textAlign: "right" }}>
                                <p className="eyebrow" style={{ margin: "0 0 4px" }}>Election Day Status</p>
                                {elector.hasVoted ? (
                                    <span className="badge badge-success" style={{ background: "#56a581", color: "#fff", padding: "6px 14px", borderRadius: "12px", fontWeight: "700" }}>
                                        ✓ Voted on {new Date(elector.votedAt).toLocaleDateString()}
                                    </span>
                                ) : (
                                    <span className="badge" style={{ background: "var(--accent, #ff9933)", color: "#fff", padding: "6px 14px", borderRadius: "12px", fontWeight: "700" }}>
                                        Eligible to Vote
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div className="hero-actions">
                    <button
                        className="primary-btn"
                        onClick={() => setShowChangeModal(true)}
                    >
                        ✎ Request Electoral Roll Correction (Form 8)
                    </button>
                    <Link to="/verify" className="secondary-btn">
                        {verified ? "View Identity Status" : "Verify Identity"}
                    </Link>
                    <Link to="/electoral-roll" className="secondary-btn">
                        {t("dashboard.checkElectoralRoll") || "Search Electoral Roll"}
                    </Link>
                </div>
            </section>

            {/* Change Requests History Section */}
            {changeRequests.length > 0 && (
                <section className="notice" style={{ maxWidth: "1100px", margin: "32px auto", textAlign: "left" }}>
                    <h3>My Electoral Roll Correction Requests (Form 8)</h3>
                    <div className="table-wrap" style={{ marginTop: "14px", overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
                                    <th style={{ padding: "10px" }}>Date</th>
                                    <th style={{ padding: "10px" }}>Requested Changes</th>
                                    <th style={{ padding: "10px" }}>Status</th>
                                    <th style={{ padding: "10px" }}>BLO Decision / AI Review</th>
                                </tr>
                            </thead>
                            <tbody>
                                {changeRequests.map(r => (
                                    <tr key={r._id} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                                        <td style={{ padding: "10px" }}>{new Date(r.submittedAt).toLocaleDateString()}</td>
                                        <td style={{ padding: "10px" }}>
                                            {Object.entries(r.requestedChanges || {}).map(([k, v]) => (
                                                <div key={k}><strong>{k}:</strong> {String(v)}</div>
                                            ))}
                                        </td>
                                        <td style={{ padding: "10px" }}>
                                            <span style={{
                                                padding: "4px 10px",
                                                borderRadius: "10px",
                                                fontSize: "12px",
                                                fontWeight: "700",
                                                background: r.status === "approved" ? "#56a581" : r.status === "rejected" ? "#a62e35" : "#d79d4c",
                                                color: "#fff"
                                            }}>
                                                {r.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px" }}>
                                            {r.decisionNote && <div><small><strong>Note:</strong> {r.decisionNote}</small></div>}
                                            {r.aiReview?.shortAiReview && (
                                                <div style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px" }}>
                                                    🤖 <em>{r.aiReview.shortAiReview}</em>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Modal: Form 8 Correction Request */}
            {showChangeModal && (
                <div className="modal-overlay" style={{
                    position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
                    background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px"
                }}>
                    <div className="modal-content" style={{
                        background: "var(--bg-primary, #ffffff)",
                        maxWidth: "680px",
                        width: "100%",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        borderRadius: "20px",
                        padding: "30px",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <div>
                                <p className="eyebrow" style={{ margin: 0 }}>Form 8 · Application for Correction</p>
                                <h2 style={{ margin: "4px 0 0" }}>Update Electoral Roll Details</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowChangeModal(false)}
                                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "var(--text-primary)" }}
                            >
                                ✕
                            </button>
                        </div>

                        {changeNotice && <div className="notice" style={{ background: "#e8f5e9", color: "#2e7d32", marginBottom: "16px" }}>{changeNotice}</div>}
                        {changeError && <div className="notice" style={{ background: "#ffebee", color: "#c62828", marginBottom: "16px" }}>{changeError}</div>}

                        {aiFeedback && (
                            <div className="notice" style={{ background: "#e3f2fd", color: "#1565c0", marginBottom: "16px" }}>
                                <strong>Gemini AI Pre-Check Review:</strong>
                                <p>{aiFeedback.shortAiReview}</p>
                                <small>Risk Level: {aiFeedback.riskLevel} | Confidence: {aiFeedback.confidenceScore}%</small>
                            </div>
                        )}

                        <form onSubmit={submitCorrection} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div>
                                <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>Full Name</label>
                                <input
                                    type="text"
                                    value={changeForm.name}
                                    onChange={e => setChangeForm({ ...changeForm, name: e.target.value })}
                                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                    required
                                />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>Date of Birth</label>
                                    <input
                                        type="date"
                                        value={changeForm.dateOfBirth}
                                        onChange={e => setChangeForm({ ...changeForm, dateOfBirth: e.target.value })}
                                        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>Gender</label>
                                    <select
                                        value={changeForm.gender}
                                        onChange={e => setChangeForm({ ...changeForm, gender: e.target.value })}
                                        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>Residential Address</label>
                                <textarea
                                    value={changeForm.address}
                                    onChange={e => setChangeForm({ ...changeForm, address: e.target.value })}
                                    rows={2}
                                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                    required
                                />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                                <div>
                                    <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>State</label>
                                    <select
                                        value={changeForm.state}
                                        onChange={e => setChangeForm({ ...changeForm, state: e.target.value, district: "", assemblyConstituency: "" })}
                                        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                    >
                                        <option value="">Select State</option>
                                        {geography?.states && Object.keys(geography.states).map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>District</label>
                                    <select
                                        value={changeForm.district}
                                        onChange={e => setChangeForm({ ...changeForm, district: e.target.value, assemblyConstituency: "" })}
                                        disabled={!changeForm.state}
                                        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                    >
                                        <option value="">Select District</option>
                                        {Object.keys(districts).map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>PIN Code</label>
                                    <input
                                        type="text"
                                        value={changeForm.pinCode}
                                        onChange={e => setChangeForm({ ...changeForm, pinCode: e.target.value })}
                                        maxLength={6}
                                        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                        required
                                    />
                                </div>
                            </div>

                            {constituencies.length > 0 && (
                                <div>
                                    <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>Assembly Constituency</label>
                                    <select
                                        value={changeForm.assemblyConstituency}
                                        onChange={e => setChangeForm({ ...changeForm, assemblyConstituency: e.target.value })}
                                        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                    >
                                        <option value="">Select Constituency</option>
                                        {constituencies.map(ac => (
                                            <option key={ac} value={ac}>{ac}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label style={{ display: "block", fontWeight: "600", marginBottom: "4px" }}>
                                    Upload Supporting Document Proof (Aadhaar / Passport / Utility Bill) *
                                </label>
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={handleDocumentUpload}
                                    style={{ width: "100%", padding: "8px" }}
                                    required
                                />
                                {changeForm.documentProof && (
                                    <div style={{ marginTop: "8px" }}>
                                        <img src={changeForm.documentProof} alt="Proof preview" style={{ maxHeight: "120px", borderRadius: "8px" }} />
                                    </div>
                                )}
                            </div>

                            <div style={{ display: "flex", gap: "12px", marginTop: "14px", justifyContent: "flex-end" }}>
                                <button type="button" className="secondary-btn" onClick={() => setShowChangeModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="primary-btn" disabled={submittingChange}>
                                    {submittingChange ? "Analyzing Document with Gemini AI…" : "Submit Request to BLO"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <section className="info-section voter-dashboard-info">
                <div className="info-card">
                    <span className="step-number">01</span>
                    <h3>Identity & Verification</h3>
                    <p>Persona integrated identity verification with instant Gemini AI document sanity checking.</p>
                </div>
                <div className="info-card">
                    <span className="step-number">02</span>
                    <h3>Electoral Roll Sync</h3>
                    <p>Request Form 8 corrections. Once BLO approves, details reflect immediately in the live electoral roll.</p>
                </div>
                <div className="info-card">
                    <span className="step-number">03</span>
                    <h3>On-Day Polling Verification</h3>
                    <p>Polling stations verify your digital biometric token and mark official voter attendance.</p>
                </div>
            </section>
        </main>
    );
}

export default Dashboard;

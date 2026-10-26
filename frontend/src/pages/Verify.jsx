import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PersonaFlow from "./PersonaFlow";
import "./PersonaVerification.css";

const statusText = {
    unverified: "verification.notVerified", pending: "verification.inProgress",
    pending_review: "verification.awaitingDecision", review_required: "verification.needsReview",
    verified: "verification.verified", declined: "verification.notApproved",
    failed: "verification.failed", expired: "verification.expired"
};

function normalizePersonaStatus(status) {
    const statusMap = {
        not_started: "unverified",
        created: "unverified",
        approved: "verified",
        completed: "pending_review",
        marked_for_review: "review_required",
        "marked-for-review": "review_required",
        needs_review: "review_required"
    };
    return statusMap[status] || status || "unverified";
}

function Verify() {
    const { logged, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [status, setStatus] = useState("unverified");
    const [inquiryId, setInquiryId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [personaConfig, setPersonaConfig] = useState(null);
    const [isVerifyingInApp, setIsVerifyingInApp] = useState(false);
    const [aiReviewResult, setAiReviewResult] = useState(null);

    const loadStatus = useCallback(async () => {
        const { data } = await api.get("/persona/status");
        const uiStatus = normalizePersonaStatus(data.data.status);
        setStatus(uiStatus);
        setInquiryId(data.data.inquiryId);
        return data.data;
    }, []);

    useEffect(() => {
        if (!logged || userData?.role !== "voter") return;
        loadStatus().catch(() => setError(t("verification.loadFailed") || "Could not load verification status"));
    }, [logged, userData?.role, loadStatus, t]);

    /**
     * Start Persona verification integrated directly inside the app
     */
    const startInAppVerification = async () => {
        setError("");
        setNotice("");
        setLoading(true);
        try {
            const { data } = await api.post("/persona/start");
            const inquiry = data.data || data;

            if (!inquiry?.inquiryId) {
                throw new Error("Missing inquiry ID from identity verification service.");
            }

            setInquiryId(inquiry.inquiryId);
            setPersonaConfig(inquiry);
            setIsVerifyingInApp(true);
            setNotice("Embedded verification loaded within application.");
        } catch (err) {
            console.error("In-app verification start error:", err);
            setError(err.response?.data?.message || t("verification.startError") || "Could not launch verification inside app.");
        } finally {
            setLoading(false);
        }
    };

    /**
     * Handle verification completion:
     * Saves inquiry, triggers Gemini AI sanity check, saves to BLO cases,
     * and redirects directly to dashboard!
     */
    const handleVerificationComplete = async (result = {}) => {
        setLoading(true);
        setError("");
        setNotice("Processing verification and generating AI document sanity report…");
        try {
            const targetId = result.inquiryId || inquiryId || personaConfig?.inquiryId;
            const res = await api.post("/persona/complete-verification", {
                inquiryId: targetId,
                status: result.status || "completed"
            });

            const completedData = res.data?.data;
            if (completedData?.aiReview) {
                setAiReviewResult(completedData.aiReview);
            }

            setStatus("verified");
            setIsVerifyingInApp(false);
            setNotice("Verification complete! Redirecting to your voter dashboard…");

            // Redirect to dashboard after brief confirmation
            setTimeout(() => {
                navigate("/dashboard", {
                    state: {
                        verifiedSuccess: true,
                        aiReview: completedData?.aiReview
                    }
                });
            }, 1200);
        } catch (err) {
            console.error("Verification completion error:", err);
            // Even if network sync has a hiccup, redirect voter to dashboard gracefully
            navigate("/dashboard");
        } finally {
            setLoading(false);
        }
    };

    const refreshStatus = useCallback(async () => {
        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/persona/sync", { inquiryId });
            const uiStatus = normalizePersonaStatus(data.data.status);
            setStatus(uiStatus);
            setNotice(t("verification.currentStatus", {
                status: t(statusText[uiStatus] || "verification.notStarted")
            }) || `Current status: ${uiStatus}`);
            if (uiStatus === "verified") {
                setTimeout(() => navigate("/dashboard"), 1000);
            }
        } catch (err) {
            setError(t("verification.refreshError") || "Could not sync status.");
        } finally {
            setLoading(false);
        }
    }, [inquiryId, navigate, t]);

    if (!logged) return <Navigate to="/login?role=voter" replace />;
    if (userData?.role !== "voter") {
        return <Navigate to={userData?.role === "eci" ? "/eci/dashboard" : "/admin"} replace />;
    }

    return (
        <main className="persona-page">
            <header className="persona-header">
                <div>
                    <p className="eyebrow">{t("portal.voterServices") || "Voter Services"}</p>
                    <h1>{t("verification.title") || "Voter Identity Verification"}</h1>
                    <p>{t("common.signedInAs") || "Signed in as"} <strong>{userData?.name || userData?.epic}</strong> (EPIC: {userData?.epic})</p>
                </div>
                <div className="persona-header-actions">
                    <Link className="secondary-btn" to="/dashboard">{t("common.dashboard") || "Dashboard"}</Link>
                    <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>
                        {t("common.signOut") || "Sign Out"}
                    </button>
                </div>
            </header>

            {!isVerifyingInApp && (
                <section className={`persona-status-card persona-status-${status}`}>
                    <div>
                        <p className="eyebrow">{t("verification.currentStatusLabel") || "Current Status"}</p>
                        <h2>{t(statusText[status] || "verification.notStarted")}</h2>
                        <p>
                            {status === "verified"
                                ? (t("verification.approvedDescription") || "Your identity is verified. You are authenticated for online voting and electoral roll services.")
                                : status === "pending_review"
                                    ? (t("verification.pendingDescription") || "Verification submitted. Awaiting Booth Level Officer (BLO) decision.")
                                    : (t("verification.completeChecks") || "Complete digital document and face verification to activate your voter profile.")}
                        </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                        {status !== "verified" && (
                            <button
                                className="primary-btn"
                                onClick={startInAppVerification}
                                disabled={loading}
                            >
                                {loading ? (t("common.preparing") || "Preparing…") : "Start In-App Verification"}
                            </button>
                        )}
                        <button
                            type="button"
                            className="secondary-btn"
                            onClick={refreshStatus}
                            disabled={loading}
                        >
                            {t("verification.refresh") || "Check Status"}
                        </button>
                    </div>
                </section>
            )}

            {/* Embedded Persona In-App Verification Container */}
            {isVerifyingInApp && personaConfig && (
                <PersonaFlow
                    config={personaConfig}
                    onComplete={handleVerificationComplete}
                    onCancel={() => setIsVerifyingInApp(false)}
                />
            )}

            {aiReviewResult && (
                <section className="persona-status-card" style={{ marginTop: "20px", borderLeft: "4px solid #56a581" }}>
                    <div>
                        <p className="eyebrow">Gemini AI Document Sanity Review</p>
                        <h3>Risk Level: <span style={{ color: aiReviewResult.riskLevel === "LOW" ? "#56a581" : "#d79d4c" }}>{aiReviewResult.riskLevel}</span> (Confidence: {aiReviewResult.confidenceScore}%)</h3>
                        <p>{aiReviewResult.shortAiReview}</p>
                        <small>Recommendation: {aiReviewResult.recommendation}</small>
                    </div>
                </section>
            )}

            {error && <p className="persona-flow-error" role="alert" style={{ marginTop: "16px" }}>{error}</p>}
            {notice && <p className="persona-flow-notice" role="status" style={{ marginTop: "16px" }}>{notice}</p>}

            <p className="persona-footnote" style={{ marginTop: "32px" }}>
                Election Commission of India · Secure In-App E-KYC. All biometric and identity records are cryptographically verified and sent to your assigned Booth Level Officer (BLO) with automated Gemini AI anomaly analysis.
            </p>
        </main>
    );
}

export default Verify;

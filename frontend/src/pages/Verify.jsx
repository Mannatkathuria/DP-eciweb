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
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const loadStatus = useCallback(async () => {
        const { data } = await api.get("/persona/status");
        setStatus(normalizePersonaStatus(data.data.status));
        setInquiryId(data.data.inquiryId);
        return data.data;
    }, []);

    useEffect(() => {
        if (!logged || userData?.role !== "voter") return;
        loadStatus().catch((err) => setError(t("verification.loadFailed")));
    }, [logged, userData?.role, loadStatus, t]);

    const startVerification = async () => {
        setError("");
        setNotice("");
        setLoading(true);
        try {
            const { data } = await api.post("/persona/start");
            // The backend returns { success, data: {...} }; accept the older flat shape too.
            const inquiry = data.data || data;
            if (!inquiry?.inquiryId || !inquiry?.environmentId) {
                throw new Error("Persona response is missing its inquiry or environment ID.");
            }
            setInquiryId(inquiry.inquiryId);
            const uiStatus = normalizePersonaStatus(inquiry.status);
            setStatus(uiStatus);
            if (["verified", "pending_review", "review_required"].includes(uiStatus)) {
                setNotice(t("verification.currentStatus", { status: t(statusText[uiStatus] || "verification.notStarted") }));
                return;
            }
            setConfig(inquiry);
        } catch (err) {
            console.error("Failed to start Persona verification:", err.response?.data || err.message);
            setError(t("verification.startError"));
        } finally {
            setLoading(false);
        }
    };

    const refreshStatus = useCallback(async (completedInquiryId = inquiryId) => {
        setError("");
        try {
            if (completedInquiryId) {
                const { data } = await api.post("/persona/sync", { inquiryId: completedInquiryId });
                setStatus(normalizePersonaStatus(data.data.status));
                setInquiryId(data.data.inquiryId);
                const uiStatus = normalizePersonaStatus(data.data.status);
                setNotice(t("verification.currentStatus", { status: t(statusText[uiStatus] || "verification.notStarted") }));
            } else {
                const record = await loadStatus();
                const uiStatus = normalizePersonaStatus(record.status);
                setNotice(t("verification.currentStatus", { status: t(statusText[uiStatus] || "verification.notStarted") }));
            }
        } catch (err) {
            setError(t("verification.refreshError"));
        }
    }, [inquiryId, loadStatus, t]);

    const handleComplete = useCallback(async (result) => {
        await refreshStatus(result?.inquiryId || inquiryId);
        setConfig(null);
    }, [inquiryId, refreshStatus]);

    if (!logged) return <Navigate to="/login?role=voter" replace />;
    if (userData?.role !== "voter") {
        return <Navigate to={userData?.role === "eci" ? "/eci/dashboard" : "/admin"} replace />;
    }

    return (
        <main className="persona-page">
            <header className="persona-header">
                <div><p className="eyebrow">{t("portal.voterServices")}</p><h1>{t("verification.title")}</h1><p>{t("common.signedInAs")} {userData?.name || userData?.epic}</p></div>
                <div className="persona-header-actions">
                    <Link className="secondary-btn" to="/dashboard">{t("common.dashboard")}</Link>
                    <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>{t("common.signOut")}</button>
                </div>
            </header>

            <section className={`persona-status-card persona-status-${status}`}>
                <div>
                    <p className="eyebrow">{t("verification.currentStatusLabel")}</p>
                    <h2>{t(statusText[status] || "verification.notStarted")}</h2>
                    <p>{status === "verified"
                        ? t("verification.approvedDescription")
                        : status === "pending_review"
                            ? t("verification.pendingDescription")
                            : t("verification.completeChecks")}</p>
                </div>
                {status !== "verified" && <button className="primary-btn" onClick={startVerification} disabled={loading}>
                    {loading ? t("common.preparing") : status === "pending" ? t("verification.resume") : t("verification.start")}
                </button>}
                <button type="button" className="secondary-btn" onClick={() => refreshStatus()} disabled={loading}>{t("verification.refresh")}</button>
            </section>

            {error && <p className="persona-flow-error" role="alert">{error}</p>}
            {notice && <p className="persona-flow-notice" role="status">{notice}</p>}
            {config && <PersonaFlow config={config} onComplete={handleComplete} />}
            <p className="persona-footnote">{t("verification.footnote")}</p>
        </main>
    );
}

export default Verify;

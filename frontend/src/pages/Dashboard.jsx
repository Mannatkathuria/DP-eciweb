import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import "./Dashboard.css";

function Dashboard() {
    const { logged, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [verification, setVerification] = useState(null);
    const [verificationError, setVerificationError] = useState("");

    useEffect(() => {
        if (!logged || userData?.role !== "voter") return;
        api.get("/persona/status")
            .then(({ data }) => setVerification(data.data))
            .catch((error) => setVerificationError(t("dashboard.statusUnavailable")));
    }, [logged, userData?.role, t]);

    if (!logged) return <Navigate to="/login?role=voter" replace />;
    if (userData?.role === "eci") return <Navigate to="/eci/dashboard" replace />;
    if (userData?.role === "blo" || userData?.role === "admin") return <Navigate to="/admin" replace />;

    const verified = verification?.status === "verified";
    return (
        <main className="dashboard">
            <header className="voter-dashboard-header">
                <div><p className="eyebrow">{t("dashboard.voterTitle")}</p><p>{t("common.signedInAs")} <strong>{userData?.name || userData?.epic}</strong></p></div>
                <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>{t("common.signOut")}</button>
            </header>
            <section className="hero">
                <p className="eyebrow">{t("portal.voterServices")}</p>
                <h1>{t("dashboard.welcome")}{userData?.name ? `, ${userData.name}` : ""}</h1>
                <p className="hero-description">{t("dashboard.manageRecord")}</p>
                {!verified && (
                    <div className="voter-verification-warning" role="status">
                        <strong>{t("dashboard.notVerified")}</strong>
                        <p>{verification?.status === "pending_review"
                            ? t("dashboard.pendingReview")
                            : verification?.status === "pending"
                                ? t("dashboard.verificationInProgress")
                                : t("dashboard.completeVerification")}</p>
                        {verificationError && <p>{verificationError}</p>}
                        <Link to="/verify" className="primary-btn">{verification?.status === "pending" ? t("dashboard.resumeVerification") : t("dashboard.verifyWithPersona")}</Link>
                    </div>
                )}
                {verified && <div className="voter-verification-success"><strong>{t("dashboard.verificationApproved")}</strong></div>}
                <div className="hero-actions">
                    <Link to="/verify" className="secondary-btn">{verified ? t("dashboard.viewVerification") : t("dashboard.openPersona")}</Link>
                    <Link to="/electoral-roll" className="secondary-btn">{t("dashboard.checkElectoralRoll")}</Link>
                </div>
            </section>
            <section className="info-section voter-dashboard-info">
                <div className="info-card"><span className="step-number">01</span><h3>{t("dashboard.documentCheck")}</h3><p>{t("dashboard.documentCheckDescription")}</p></div>
                <div className="info-card"><span className="step-number">02</span><h3>{t("dashboard.faceCheck")}</h3><p>{t("dashboard.faceCheckDescription")}</p></div>
                <div className="info-card"><span className="step-number">03</span><h3>{t("dashboard.trackStatus")}</h3><p>{t("dashboard.trackStatusDescription")}</p></div>
            </section>
        </main>
    );
}

export default Dashboard;

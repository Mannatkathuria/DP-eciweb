import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "./Dashboard.css";

function EciDashboard() {
    const { logged, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();
    if (!logged) return <Navigate to="/eci/login" replace />;
    if (userData?.role !== "eci") return <Navigate to={userData?.role === "voter" ? "/dashboard" : "/admin"} replace />;

    return (
        <main className="dashboard">
            <header className="voter-dashboard-header">
                <div><p className="eyebrow">{t("eci.dashboardEyebrow")}</p><p>{t("common.signedInAs")} <strong>{userData?.name || userData?.epic}</strong></p></div>
                <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>{t("common.signOut")}</button>
            </header>
            <section className="hero">
                <p className="eyebrow">{t("eci.officialEyebrow")}</p>
                <h1>{t("eci.dashboardTitle")}</h1>
                <p className="hero-description">{t("eci.dashboardDescription")}</p>
                <div className="hero-actions">
                    <Link to="/eci/voting-verification" className="primary-btn">{t("eci.startVerification")}</Link>
                    <Link to="/" className="secondary-btn">{t("eci.publicPortal")}</Link>
                </div>
            </section>
            <section className="info-section voter-dashboard-info">
                <div className="info-card"><span className="step-number">01</span><h3>{t("eci.openRecord")}</h3><p>{t("eci.openRecordDescription")}</p></div>
                <div className="info-card"><span className="step-number">02</span><h3>{t("eci.verifyPersona")}</h3><p>{t("eci.verifyPersonaDescription")}</p></div>
                <div className="info-card"><span className="step-number">03</span><h3>{t("eci.recordResult")}</h3><p>{t("eci.recordResultDescription")}</p></div>
            </section>
        </main>
    );
}

export default EciDashboard;

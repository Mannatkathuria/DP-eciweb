import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import SavedApplication from "./SavedApplication";
import "./Portal.css";
import "./Register.css";

/** Voter Services → "Check your request": look up a Form 6 application by its reference ID. */
export default function CheckRequest() {
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const [referenceId, setReferenceId] = useState(params.get("ref") || "");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);

    const checkStatus = async (e) => {
        e.preventDefault();
        const id = referenceId.trim();
        setResult(null);
        setError("");
        if (!id) {
            setError("Enter the reference ID you received when you submitted Form 6.");
            return;
        }
        setChecking(true);
        try {
            const { data } = await api.get(`/auth/register/${encodeURIComponent(id)}`);
            setResult(data.data);
        } catch (err) {
            setError(err.response?.data?.message || "Could not check the request. Try again.");
        } finally {
            setChecking(false);
        }
    };

    return (
        <main className="portal-page f6-page">
            <section className="portal-card portal-wide f6-card">
                <p className="eyebrow">{t("service.voter.eyebrow")}</p>
                <h1>{t("register.checkRequest")}</h1>
                <p className="portal-muted f6-intro">Enter the reference ID shown after you submitted Form 6 to see whether your Booth Level Officer has reviewed it.</p>

                <form onSubmit={checkStatus} className="portal-form f6-status-form">
                    <label>{t("register.referenceId")}
                        <input value={referenceId} onChange={(ev) => setReferenceId(ev.target.value)} autoComplete="off" placeholder="Paste your application reference ID" />
                    </label>
                    <button disabled={checking}>{checking ? t("common.checking") : t("register.checkStatus")}</button>
                </form>

                {error && <div className="portal-error" role="alert">{error}</div>}
                {result?.status === "pending" && (
                    <div className="portal-notice" role="status">Status: <strong>PENDING REVIEW</strong>. Assigned to your constituency's Booth Level Officer.</div>
                )}
                {result?.status === "approved" && (
                    <div className="portal-success" role="status">{t("register.approvedEpic")} <strong>{result.epic}</strong>.{" "}
                        <Link to="/login?role=voter">{t("common.signIn")}</Link></div>
                )}
                {result?.status === "rejected" && (
                    <div className="portal-error" role="status">Application was rejected by BLO. Note: {result.note || "Criteria not met."}</div>
                )}
                {result?.application && <SavedApplication application={result.application} />}

                <p className="f6-hint"><Link to="/services?role=voter">← Back to Voter Services</Link></p>
            </section>
        </main>
    );
}

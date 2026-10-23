import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "../api/axios";
import "./Portal.css";

const emptyForm = {
    name: "", dateOfBirth: "", gender: "Other",
    state: "", district: "", assemblyConstituency: "", partNumber: "", pollingStation: ""
};

// Voters submit a registration REQUEST here. No account exists until a BLO approves it.
function Register() {
    const { t } = useTranslation();
    const [form, setForm] = useState(emptyForm);
    const [submitted, setSubmitted] = useState(null); // { referenceId }
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const [checkId, setCheckId] = useState("");
    const [statusResult, setStatusResult] = useState(null);
    const [statusError, setStatusError] = useState("");
    const [checking, setChecking] = useState(false);

    const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async e => {
        e.preventDefault();
        setError(""); setLoading(true);
        try {
            const { data } = await api.post("/auth/register", form);
            setSubmitted(data.data);
            setCheckId(data.data.referenceId);
            setForm(emptyForm);
        } catch (err) {
            setError(t("register.submitFailed"));
        } finally { setLoading(false); }
    };

    const checkStatus = async e => {
        e.preventDefault();
        setStatusError(""); setStatusResult(null);
        if (!checkId.trim()) { setStatusError(t("register.enterReference")); return; }
        setChecking(true);
        try {
            const { data } = await api.get(`/auth/register/${encodeURIComponent(checkId.trim())}`);
            setStatusResult(data.data);
        } catch (err) {
            setStatusError(t("register.checkFailed"));
        } finally { setChecking(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card portal-wide">
                <p className="eyebrow">{t("register.title")}</p>
                <h1>{t("register.applyTitle")}</h1>
                <p className="portal-muted">
                    {t("register.instructions")}
                </p>

                {error && <div className="portal-error">{error}</div>}

                {submitted && (
                    <div className="portal-success">
                        {t("register.submittedReference")} <strong>{submitted.referenceId}</strong>. {t("register.saveReference")}
                    </div>
                )}

                <form onSubmit={submit} className="portal-form grid-form">
                    <label>{t("register.fullName")}<input name="name" value={form.name} onChange={update} required /></label>
                    <label>{t("register.dateOfBirth")}<input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update} required /></label>
                    <label>{t("register.gender")}<select name="gender" value={form.gender} onChange={update}><option value="Male">{t("register.male")}</option><option value="Female">{t("register.female")}</option><option value="Other">{t("register.other")}</option></select></label>
                    <label>{t("register.state")}<input name="state" value={form.state} onChange={update} required /></label>
                    <label>{t("register.district")}<input name="district" value={form.district} onChange={update} required /></label>
                    <label>{t("register.constituency")}<input name="assemblyConstituency" value={form.assemblyConstituency} onChange={update} required /></label>
                    <label>{t("register.partNumber")}<input name="partNumber" value={form.partNumber} onChange={update} required /></label>
                    <label>{t("register.pollingStation")}<input name="pollingStation" value={form.pollingStation} onChange={update} required /></label>

                    <button disabled={loading}>{loading ? t("common.submitting") : t("register.submitToBlo")}</button>
                </form>

                <hr />
                <h2>{t("register.checkRequest")}</h2>
                <form onSubmit={checkStatus} className="portal-form">
                    <label>{t("register.referenceId")}<input value={checkId} onChange={e => setCheckId(e.target.value)} autoComplete="off" /></label>
                    <button disabled={checking}>{checking ? t("common.checking") : t("register.checkStatus")}</button>
                </form>
                {statusError && <div className="portal-error">{statusError}</div>}
                {statusResult?.status === "pending" && (
                    <div className="portal-muted">{t("register.pending")}</div>
                )}
                {statusResult?.status === "approved" && (
                    <div className="portal-success">
                        {t("register.approvedEpic")} <strong>{statusResult.epic}</strong>.{" "}
                        <Link to="/login?role=voter">{t("common.signIn")}</Link>
                    </div>
                )}
                {statusResult?.status === "rejected" && (
                    <div className="portal-error">
                        {t("register.rejected")}{statusResult.note ? `: ${statusResult.note}` : "."} {t("register.resubmit")}
                    </div>
                )}

                <p className="portal-footer"><Link to="/">{t("common.back")}</Link> · <Link to="/login?role=voter">{t("register.alreadyApproved")}</Link></p>
            </section>
        </main>
    );
}
export default Register;

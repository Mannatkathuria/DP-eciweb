import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "../api/axios";
import "./Portal.css";

const emptyForm = {
    name: "", dateOfBirth: "", gender: "Other",
    state: "", district: "", assemblyConstituency: "", address: "", pinCode: ""
};

// Changing a parent selection clears the selections that depend on it.
const DEPENDENTS = { state: ["district", "assemblyConstituency"], district: ["assemblyConstituency"] };

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

    const [geography, setGeography] = useState(null);
    const [geographyError, setGeographyError] = useState("");

    useEffect(() => {
        api.get("/auth/geography")
            .then(({ data }) => setGeography(data.data))
            .catch(() => setGeographyError(t("register.geographyLoadFailed")));
    }, [t]);

    const stateEntry = useMemo(() => geography?.states.find(s => s.name === form.state) || null, [geography, form.state]);
    const districtEntry = stateEntry?.districts.find(d => d.name === form.district) || null;
    const constituencyOptions = stateEntry?.constituencies === "available" ? districtEntry?.constituencies || [] : [];
    const geographyValid = Boolean(districtEntry && constituencyOptions.includes(form.assemblyConstituency));

    const update = e => {
        const { name, value } = e.target;
        setForm(f => {
            const next = { ...f, [name]: value };
            for (const dependent of DEPENDENTS[name] || []) next[dependent] = "";
            return next;
        });
    };

    const submit = async e => {
        e.preventDefault();
        if (!geographyValid) return;
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
                {geographyError && <div className="portal-error">{geographyError}</div>}

                {submitted && (
                    <div className="portal-success">
                        {t("register.submittedReference")} <strong>{submitted.referenceId}</strong>. {t("register.saveReference")}
                    </div>
                )}

                <form onSubmit={submit} className="portal-form grid-form">
                    <label>{t("register.fullName")}<input name="name" value={form.name} onChange={update} required /></label>
                    <label>{t("register.dateOfBirth")}<input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update} required /></label>
                    <label>{t("register.gender")}<select name="gender" value={form.gender} onChange={update}><option value="Male">{t("register.male")}</option><option value="Female">{t("register.female")}</option><option value="Other">{t("register.other")}</option></select></label>
                    <label>{t("register.state")}
                        <select name="state" value={form.state} onChange={update} disabled={!geography} required>
                            <option value="">{t("register.selectState")}</option>
                            {geography?.states.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                    </label>
                    <label>{t("register.district")}
                        <select name="district" value={form.district} onChange={update} disabled={!stateEntry} required>
                            <option value="">{t("register.selectDistrict")}</option>
                            {stateEntry?.districts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                        </select>
                    </label>
                    <label>{t("register.constituency")}
                        <select name="assemblyConstituency" value={form.assemblyConstituency} onChange={update} disabled={!districtEntry || constituencyOptions.length === 0} required>
                            <option value="">{t("register.selectConstituency")}</option>
                            {constituencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {stateEntry?.constituencies === "none" && <small className="portal-muted">{t("register.noAssembly")}</small>}
                        {stateEntry?.constituencies === "unavailable" && <small className="portal-muted">{t("register.constituenciesUnavailable")}</small>}
                    </label>
                    <label>{t("register.address")}<input name="address" value={form.address} onChange={update} minLength={10} maxLength={300} autoComplete="street-address" required /></label>
                    <label>{t("register.pinCode")}<input name="pinCode" value={form.pinCode} onChange={update} inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} title={t("register.pinCodeInvalid")} autoComplete="postal-code" required /></label>

                    <button disabled={loading || !geographyValid}>{loading ? t("common.submitting") : t("register.submitToBlo")}</button>
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

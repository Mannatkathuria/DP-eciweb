import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import api from "../api/axios";
import "./Portal.css";

const emptyForm = {
    name: "", dateOfBirth: "", gender: "Other",
    state: "", district: "", assemblyConstituency: "", address: "", pinCode: "",
    referenceImage: ""
};

const DEPENDENTS = { state: ["district", "assemblyConstituency"], district: ["assemblyConstituency"] };

function Register() {
    const { t } = useTranslation();
    const [form, setForm] = useState(emptyForm);
    const [submitted, setSubmitted] = useState(null); // { referenceId, aiReview }
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
            .catch(() => setGeographyError(t("register.geographyLoadFailed") || "Could not load states data"));
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

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setError("Document image must be under 5 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setForm(prev => ({ ...prev, referenceImage: reader.result }));
        };
        reader.readAsDataURL(file);
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
            setError(err.response?.data?.message || t("register.submitFailed") || "Registration submission failed.");
        } finally { setLoading(false); }
    };

    const checkStatus = async e => {
        e.preventDefault();
        setStatusError(""); setStatusResult(null);
        if (!checkId.trim()) { setStatusError(t("register.enterReference") || "Enter reference ID."); return; }
        setChecking(true);
        try {
            const { data } = await api.get(`/auth/register/${encodeURIComponent(checkId.trim())}`);
            setStatusResult(data.data);
        } catch (err) {
            setStatusError(err.response?.data?.message || t("register.checkFailed") || "Could not check status.");
        } finally { setChecking(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card portal-wide">
                <p className="eyebrow">{t("register.title") || "New Voter Registration"}</p>
                <h1>{t("register.applyTitle") || "Form 6 Application"}</h1>
                <p className="portal-muted">
                    {t("register.instructions") || "Submit your details and document proof for electoral roll enrollment. Your application is reviewed by AI and assigned to a Booth Level Officer."}
                </p>

                {error && <div className="portal-error">{error}</div>}
                {geographyError && <div className="portal-error">{geographyError}</div>}

                {submitted && (
                    <div className="portal-success" style={{ background: "#e8f5e9", borderLeft: "5px solid #56a581", padding: "16px", borderRadius: "12px", margin: "16px 0" }}>
                        <h3 style={{ margin: "0 0 6px", color: "#2e7d32" }}>✓ Application Submitted to BLO</h3>
                        <p style={{ margin: "4px 0" }}>
                            {t("register.submittedReference") || "Reference ID:"} <strong>{submitted.referenceId}</strong>
                        </p>
                        {submitted.aiReview && (
                            <div style={{ marginTop: "10px", padding: "10px", background: "rgba(0,0,0,0.03)", borderRadius: "8px" }}>
                                <strong>🤖 Gemini AI Sanity Check:</strong>
                                <div>{submitted.aiReview.shortAiReview}</div>
                                <small style={{ color: "#2e7d32" }}>Risk Level: {submitted.aiReview.riskLevel} | Confidence: {submitted.aiReview.confidenceScore}%</small>
                            </div>
                        )}
                        <p style={{ margin: "8px 0 0", fontSize: "13px" }}>
                            {t("register.saveReference") || "Save this reference ID to track your application status."}
                        </p>
                    </div>
                )}

                <form onSubmit={submit} className="portal-form grid-form">
                    <label>{t("register.fullName") || "Full Name"}<input name="name" value={form.name} onChange={update} required /></label>
                    <label>{t("register.dateOfBirth") || "Date of Birth"}<input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update} required /></label>
                    <label>{t("register.gender") || "Gender"}<select name="gender" value={form.gender} onChange={update}><option value="Male">{t("register.male") || "Male"}</option><option value="Female">{t("register.female") || "Female"}</option><option value="Other">{t("register.other") || "Other"}</option></select></label>
                    <label>{t("register.state") || "State"}
                        <select name="state" value={form.state} onChange={update} disabled={!geography} required>
                            <option value="">{t("register.selectState") || "Select State"}</option>
                            {geography?.states.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                    </label>
                    <label>{t("register.district") || "District"}
                        <select name="district" value={form.district} onChange={update} disabled={!stateEntry} required>
                            <option value="">{t("register.selectDistrict") || "Select District"}</option>
                            {stateEntry?.districts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                        </select>
                    </label>
                    <label>{t("register.constituency") || "Assembly Constituency"}
                        <select name="assemblyConstituency" value={form.assemblyConstituency} onChange={update} disabled={!districtEntry || constituencyOptions.length === 0} required>
                            <option value="">{t("register.selectConstituency") || "Select Constituency"}</option>
                            {constituencyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {stateEntry?.constituencies === "none" && <small className="portal-muted">{t("register.noAssembly")}</small>}
                        {stateEntry?.constituencies === "unavailable" && <small className="portal-muted">{t("register.constituenciesUnavailable")}</small>}
                    </label>
                    <label>{t("register.address") || "Address"}<input name="address" value={form.address} onChange={update} minLength={10} maxLength={300} autoComplete="street-address" required /></label>
                    <label>{t("register.pinCode") || "PIN Code"}<input name="pinCode" value={form.pinCode} onChange={update} inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} title={t("register.pinCodeInvalid") || "Enter valid 6-digit PIN"} autoComplete="postal-code" required /></label>

                    <label style={{ gridColumn: "1 / -1" }}>
                        Upload Identification / Address Proof Document (Aadhaar / Passport / ID)
                        <input type="file" accept="image/*,.pdf" onChange={handleImageUpload} />
                        {form.referenceImage && (
                            <div style={{ marginTop: "8px" }}>
                                <img src={form.referenceImage} alt="Document preview" style={{ maxHeight: "100px", borderRadius: "8px" }} />
                            </div>
                        )}
                    </label>

                    <button disabled={loading || !geographyValid} style={{ gridColumn: "1 / -1" }}>
                        {loading ? "Analyzing Document & Submitting…" : (t("register.submitToBlo") || "Submit Application to BLO")}
                    </button>
                </form>

                <hr style={{ margin: "30px 0" }} />
                <h2>{t("register.checkRequest") || "Check Application Status"}</h2>
                <form onSubmit={checkStatus} className="portal-form">
                    <label>{t("register.referenceId") || "Reference ID"}<input value={checkId} onChange={e => setCheckId(e.target.value)} autoComplete="off" placeholder="Paste your application reference UUID" /></label>
                    <button disabled={checking}>{checking ? (t("common.checking") || "Checking…") : (t("register.checkStatus") || "Check Status")}</button>
                </form>
                {statusError && <div className="portal-error">{statusError}</div>}
                {statusResult?.status === "pending" && (
                    <div className="portal-muted" style={{ padding: "12px", background: "rgba(0,0,0,0.03)", borderRadius: "8px" }}>
                        Status: <strong>PENDING REVIEW</strong>. Assigned to your constituency's Booth Level Officer.
                    </div>
                )}
                {statusResult?.status === "approved" && (
                    <div className="portal-success" style={{ padding: "12px", background: "#e8f5e9", color: "#2e7d32", borderRadius: "8px" }}>
                        {t("register.approvedEpic") || "Approved! Your EPIC is"} <strong>{statusResult.epic}</strong>.{" "}
                        <Link to="/login?role=voter">{t("common.signIn") || "Sign In Now"}</Link>
                    </div>
                )}
                {statusResult?.status === "rejected" && (
                    <div className="portal-error">
                        Application was rejected by BLO. Note: {statusResult.note || "Criteria not met."}
                    </div>
                )}
            </section>
        </main>
    );
}

export default Register;

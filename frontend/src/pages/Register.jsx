import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import "./Portal.css";

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const emptyForm = {
    name: "", dateOfBirth: "", gender: "Other",
    state: "", district: "", assemblyConstituency: "", partNumber: "", pollingStation: ""
};

// Voters submit a registration REQUEST here. No account exists until a BLO approves it.
function Register() {
    const [form, setForm] = useState(emptyForm);
    const [referenceImage, setReferenceImage] = useState("");
    const [submitted, setSubmitted] = useState(null); // { referenceId }
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const inputRef = useRef();

    const [checkId, setCheckId] = useState("");
    const [statusResult, setStatusResult] = useState(null);
    const [statusError, setStatusError] = useState("");
    const [checking, setChecking] = useState(false);

    const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const chooseImage = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) {
            setError("The reference image must be smaller than 4 MB.");
            e.target.value = "";
            return;
        }
        try { setReferenceImage(await fileToDataUrl(file)); setError(""); }
        catch { setError("Could not read the reference image."); }
    };

    const submit = async e => {
        e.preventDefault();
        setError(""); setLoading(true);
        try {
            const { data } = await api.post("/auth/register", { ...form, referenceImage: referenceImage || null });
            setSubmitted(data.data);
            setCheckId(data.data.referenceId);
            setForm(emptyForm);
            setReferenceImage("");
            if (inputRef.current) inputRef.current.value = "";
        } catch (err) {
            setError(err.response?.data?.message || "Could not submit the registration request.");
        } finally { setLoading(false); }
    };

    const checkStatus = async e => {
        e.preventDefault();
        setStatusError(""); setStatusResult(null);
        if (!checkId.trim()) { setStatusError("Enter your reference ID."); return; }
        setChecking(true);
        try {
            const { data } = await api.get(`/auth/register/${encodeURIComponent(checkId.trim())}`);
            setStatusResult(data.data);
        } catch (err) {
            setStatusError(err.response?.data?.message || "Could not check the request.");
        } finally { setChecking(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card portal-wide">
                <p className="eyebrow">VOTER REGISTRATION</p>
                <h1>Apply to register as a voter</h1>
                <p className="portal-muted">
                    Fill in this form to send a registration request to your Booth Level Officer (BLO).
                    Once the BLO approves it, you receive an EPIC number and can sign in with it.
                </p>

                {error && <div className="portal-error">{error}</div>}

                {submitted && (
                    <div className="portal-success">
                        Request submitted. Your reference ID is <strong>{submitted.referenceId}</strong>.
                        Save it: you need it to check whether the BLO has approved your request.
                    </div>
                )}

                <form onSubmit={submit} className="portal-form grid-form">
                    <label>Full name<input name="name" value={form.name} onChange={update} required /></label>
                    <label>Date of birth<input name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update} required /></label>
                    <label>Gender<select name="gender" value={form.gender} onChange={update}><option>Male</option><option>Female</option><option>Other</option></select></label>
                    <label>State / UT<input name="state" value={form.state} onChange={update} required /></label>
                    <label>District<input name="district" value={form.district} onChange={update} required /></label>
                    <label>Assembly constituency<input name="assemblyConstituency" value={form.assemblyConstituency} onChange={update} required /></label>
                    <label>Part number<input name="partNumber" value={form.partNumber} onChange={update} required /></label>
                    <label>Polling station<input name="pollingStation" value={form.pollingStation} onChange={update} required /></label>

                    <div className="portal-upload">
                        <strong>Reference face (recommended)</strong>
                        <p>Used for later face matching once your registration is approved. It is discarded if the request is rejected.</p>
                        <input ref={inputRef} type="file" accept="image/*" onChange={chooseImage} />
                        {referenceImage && <img className="reference-preview" src={referenceImage} alt="Reference preview" />}
                    </div>

                    <button disabled={loading}>{loading ? "Submitting…" : "Submit request to BLO"}</button>
                </form>

                <hr />
                <h2>Check your request</h2>
                <form onSubmit={checkStatus} className="portal-form">
                    <label>Reference ID<input value={checkId} onChange={e => setCheckId(e.target.value)} autoComplete="off" /></label>
                    <button disabled={checking}>{checking ? "Checking…" : "Check status"}</button>
                </form>
                {statusError && <div className="portal-error">{statusError}</div>}
                {statusResult?.status === "pending" && (
                    <div className="portal-muted">Pending: your BLO has not reviewed this request yet.</div>
                )}
                {statusResult?.status === "approved" && (
                    <div className="portal-success">
                        Approved. Your EPIC number is <strong>{statusResult.epic}</strong>.{" "}
                        <Link to="/login?role=voter">Sign in</Link>
                    </div>
                )}
                {statusResult?.status === "rejected" && (
                    <div className="portal-error">
                        Rejected{statusResult.note ? `: ${statusResult.note}` : "."} You can submit a new request with corrected details.
                    </div>
                )}

                <p className="portal-footer"><Link to="/">Back</Link> · <Link to="/login?role=voter">Already approved? Sign in</Link></p>
            </section>
        </main>
    );
}
export default Register;

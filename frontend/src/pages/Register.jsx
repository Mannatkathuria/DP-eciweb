import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function Register() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        username: "", password: "", name: "", dateOfBirth: "", gender: "Other",
        state: "", district: "", assemblyConstituency: "", partNumber: "", pollingStation: ""
    });
    const [referenceImage, setReferenceImage] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const inputRef = useRef();

    const update = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const chooseImage = async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try { setReferenceImage(await fileToDataUrl(file)); }
        catch { setError("Could not read the reference image."); }
    };

    const submit = async e => {
        e.preventDefault();
        setError(""); setStatus(""); setLoading(true);
        try {
            const { data } = await api.post("/auth/register", { ...form, referenceImage: referenceImage || null });
            setStatus(`Registration submitted. Your demo EPIC is ${data.data.epic}.`);
            setTimeout(() => navigate("/login"), 1600);
        } catch (err) {
            setError(err.response?.data?.message || "Registration failed.");
        } finally { setLoading(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card portal-wide">
                <p className="eyebrow">VOTER REGISTRATION</p>
                <h1>Create your electoral service account</h1>
                <p className="portal-muted">
                    This prototype creates a synthetic EPIC and stores the electoral record in Redis.
                </p>

                {error && <div className="portal-error">{error}</div>}
                {status && <div className="portal-success">{status}</div>}

                <form onSubmit={submit} className="portal-form grid-form">
                    <label>Username<input name="username" value={form.username} onChange={update} required /></label>
                    <label>Password<input name="password" type="password" value={form.password} onChange={update} required minLength={8} /></label>
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
                        <p>Used by the existing face-service for later matching. The image is not stored in Redis.</p>
                        <input ref={inputRef} type="file" accept="image/*" onChange={chooseImage} />
                        {referenceImage && <img className="reference-preview" src={referenceImage} alt="Reference preview" />}
                    </div>

                    <button disabled={loading}>{loading ? "Registering…" : "Submit registration"}</button>
                </form>

                <p className="portal-footer"><Link to="/">Back</Link> · <Link to="/login">Already registered? Sign in</Link></p>
            </section>
        </main>
    );
}
export default Register;

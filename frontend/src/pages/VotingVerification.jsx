import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Tesseract from "tesseract.js";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import "./Portal.css";

const parseOCR = text => {
    const compact = text.replace(/\r/g, "");
    const epic = compact.match(/\b[A-Z]{2,5}\s?\d{5,10}\b/i)?.[0]?.replace(/\s/g, "") || "";
    const dob = compact.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](19|20)\d{2}\b/)?.[0] || "";
    const nameLine = compact.split("\n").map(x => x.trim()).find(x =>
        /^[A-Za-z][A-Za-z .'-]{4,}$/.test(x) && !/election|commission|identity|card|india/i.test(x)
    ) || "";
    return { epic, name: nameLine, dateOfBirth: dob };
};

const dateToISO = value => {
    if (!value) return null;
    const m = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
};

function VotingVerification() {
    const { logged, userData, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    const [epic, setEpic] = useState("");
    const [session, setSession] = useState(null);
    const [documentFile, setDocumentFile] = useState(null);
    const [ocrText, setOcrText] = useState("");
    const [extracted, setExtracted] = useState({ epic: "", name: "", dateOfBirth: "" });
    const [challenge, setChallenge] = useState("");
    const [cameraOn, setCameraOn] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState("");
    const [error, setError] = useState("");

    useEffect(() => () => stopCamera(), []);

    useEffect(() => {
        if (!logged) navigate("/eci/login", { replace: true });
        else if (userData && userData.role !== "eci") navigate("/", { replace: true });
    }, [logged, userData, navigate]);

    const start = async e => {
        e?.preventDefault();
        setError(""); setResult(""); setBusy(true);
        try {
            const { data } = await api.post("/voting-verification/start", { epic });
            setSession(data.data);
        } catch (err) {
            setError(err.response?.data?.message || "Could not open voter verification session.");
        } finally { setBusy(false); }
    };

    const scanDocument = async () => {
        if (!documentFile || !session) return;
        setBusy(true); setError(""); setResult("");
        try {
            const { data } = await Tesseract.recognize(documentFile, "eng", { logger: () => {} });
            setOcrText(data.text);
            const parsed = parseOCR(data.text);
            setExtracted(parsed);

            const response = await api.post(`/voting-verification/${session.sessionId}/document`, {
                ...parsed,
                dateOfBirth: dateToISO(parsed.dateOfBirth),
                documentType: "scanned-electoral-document"
            });
            setSession(s => ({ ...s, status: response.data.data.status }));
            if (response.data.data.status === "review_required") {
                setResult(response.data.data.reasons.join(" "));
            }
        } catch (err) {
            setError(err.response?.data?.message || "Document scan failed.");
        } finally { setBusy(false); }
    };

    const startCamera = async () => {
        setError("");
        try {
            const { data } = await api.post(`/voting-verification/${session.sessionId}/face/challenge`);
            setChallenge(data.data.challenge);
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            setCameraOn(true);
        } catch (err) {
            setError(err.response?.data?.message || "Camera or face verification could not start.");
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    };

    const captureFrames = async () => {
        const video = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = 480; canvas.height = 360;
        const ctx = canvas.getContext("2d");
        const frames = [];
        for (let i = 0; i < 12; i++) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL("image/jpeg", 0.72));
            await new Promise(r => setTimeout(r, 180));
        }
        return frames;
    };

    const verifyFace = async () => {
        setBusy(true); setError(""); setResult("");
        try {
            const frames = await captureFrames();
            const { data } = await api.post(`/voting-verification/${session.sessionId}/face`, { frames });
            setSession(s => ({ ...s, status: data.data.status }));
            if (data.data.status === "review_required") setResult(data.data.reasons.join(" "));
            else setResult("Face and liveness passed. Proceed to fingerprint.");
            stopCamera();
        } catch (err) {
            setError(err.response?.data?.message || "Face verification failed.");
        } finally { setBusy(false); }
    };

    const resetVerification = () => {
        stopCamera();
        setSession(null);
        setDocumentFile(null);
        setOcrText("");
        setExtracted({ epic: "", name: "", dateOfBirth: "" });
        setChallenge("");
        setResult("");
        setError("");
        setEpic("");
    };

    const fingerprint = async () => {
        setBusy(true); setError(""); setResult("");
        try {
            const { data } = await api.post(`/voting-verification/${session.sessionId}/fingerprint`, {
                // Demo scanner token. Replace with certified scanner SDK output.
                scanToken: `FP-${session.voter.epic}`
            });
            setSession(s => ({ ...s, status: data.data.status }));
            setResult(data.data.message);
        } catch (err) {
            setError(err.response?.data?.message || "Fingerprint verification failed.");
        } finally { setBusy(false); }
    };

    if (!logged || !userData) {
        return <main className="portal-page"><section className="portal-card"><p className="eyebrow">ECI OFFICIAL PORTAL</p><h1>Checking authorisation…</h1><p className="portal-muted">Please wait while your official session is verified.</p></section></main>;
    }

    if (userData.role !== "eci") return null;

    return (
        <main className="portal-page">
            <section className="portal-card portal-wide">
                <div className="portal-topbar">
                    <div><p className="eyebrow">ECI OFFICIAL PORTAL</p><h1>During-voting verification</h1></div>
                    <button className="ghost-button" onClick={async () => { await logout(); navigate("/eci/login"); }}>Sign out</button>
                </div>

                <div className="workflow-strip">
                    <div className={`workflow-step ${session ? "done" : "current"}`}><span className="step-icon">👤</span>1 · Voter record</div>
                    <div className={`workflow-step ${session?.status === "document_pending" ? "current" : session ? "done" : ""}`}><span className="step-icon">📄</span>2 · Document</div>
                    <div className={`workflow-step ${session?.status === "face_pending" ? "current" : ["fingerprint_pending", "verified"].includes(session?.status) ? "done" : ""}`}><span className="step-icon">🙂</span>3 · Face + liveness</div>
                    <div className={`workflow-step ${session?.status === "fingerprint_pending" ? "current" : session?.status === "verified" ? "done" : ""}`}><span className="step-icon">☝</span>4 · Fingerprint</div>
                </div>

                {error && <div className="portal-error">{error}</div>}
                {result && <div className={session?.status === "verified" ? "portal-success" : "portal-warning"}>{result}</div>}

                {!session && (
                    <form className="portal-form" onSubmit={start}>
                        <label>Voter EPIC number<input value={epic} onChange={e => setEpic(e.target.value.toUpperCase())} placeholder="ABC1234567" required /></label>
                        <button disabled={busy}>{busy ? "Opening…" : "Open verification session"}</button>
                    </form>
                )}

                {session && (
                    <>
                        <section className="voter-identity">
                            <div className="voter-photo-wrap">
                                {session.voter.photoAvailable ? (
                                    <img
                                        className="voter-photo"
                                        src={`${import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"}${session.voter.referencePhotoUrl}`}
                                        alt={`${session.voter.name} reference`}
                                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                                    />
                                ) : (
                                    <span className="voter-initials">{session.voter.name.split(/\s+/).map(x => x[0]).slice(0,2).join("").toUpperCase()}</span>
                                )}
                            </div>
                            <div>
                                <div className="voter-name">{session.voter.name}</div>
                                <div className="voter-meta">Voter record found · EPIC {session.voter.epic}</div>
                                <div className="voter-data-grid">
                                    <div><strong>Date of birth</strong>{new Date(session.voter.dateOfBirth).toLocaleDateString("en-IN")}</div>
                                    <div><strong>Gender</strong>{session.voter.gender || "—"}</div>
                                    <div><strong>Constituency</strong>{session.voter.assemblyConstituency || "—"}</div>
                                    <div><strong>Part / Polling station</strong>{session.voter.partNumber || "—"} · {session.voter.pollingStation}</div>
                                </div>
                            </div>
                        </section>

                        <div className="next-action">
                            <div>
                                <strong>Next: scan the voter’s document</strong>
                                <span>The record above has been retrieved. Continue with document OCR to confirm the person presenting at the polling station.</span>
                            </div>
                            <span className="arrow">→</span>
                        </div>

                        {session.status === "document_pending" && (
                            <section className="verification-stage">
                                <h2>Scan voter document</h2>
                                <p>Upload a clear document image. OCR extracts EPIC, name and DOB, then the backend compares them against the electoral record.</p>
                                <input type="file" accept="image/*" onChange={e => setDocumentFile(e.target.files?.[0] || null)} />
                                <button onClick={scanDocument} disabled={!documentFile || busy}>{busy ? "Reading document…" : "Scan & verify document"}</button>
                                {ocrText && <details><summary>OCR output</summary><pre>{ocrText}</pre></details>}
                                {extracted.epic && <div className="ocr-fields"><span>EPIC: {extracted.epic}</span><span>Name: {extracted.name || "Not detected"}</span><span>DOB: {extracted.dateOfBirth || "Not detected"}</span></div>}
                            </section>
                        )}

                        {session.status === "face_pending" && (
                            <section className="verification-stage">
                                <h2>Face + liveness</h2>
                                <p>Challenge: <strong>{challenge || "start the camera"}</strong></p>
                                {!cameraOn ? (
                                    <button onClick={startCamera}>Start camera & liveness challenge</button>
                                ) : (
                                    <>
                                        <video ref={videoRef} autoPlay playsInline muted className="portal-video" />
                                        <p>Follow the challenge shown above. Keep one face visible.</p>
                                        <button onClick={verifyFace} disabled={busy}>{busy ? "Checking…" : "Capture & verify face"}</button>
                                    </>
                                )}
                            </section>
                        )}

                        {session.status === "fingerprint_pending" && (
                            <section className="verification-stage fingerprint-stage">
                                <div className="fingerprint-icon">☝</div>
                                <h2>Fingerprint verification</h2>
                                <p>Connect the authorised fingerprint scanner and place the voter’s finger on the sensor.</p>
                                <button onClick={fingerprint} disabled={busy}>{busy ? "Reading fingerprint…" : "Scan fingerprint"}</button>
                                <small>Prototype mode: the button uses a one-time demo scanner token. Production must use a certified fingerprint device/API.</small>
                            </section>
                        )}

                        {session.status === "verified" && (
                            <section className="verification-stage verified-stage">
                                <div className="success-mark">✓</div>
                                <h2>Voter identity verified</h2>
                                <p>Document, face/liveness and fingerprint stages have passed.</p>
                                <button onClick={resetVerification}>Start another voter verification</button>
                            </section>
                        )}

                        {session.status === "review_required" && (
                            <section className="verification-stage">
                                <h2>Manual review required</h2>
                                <p>This voter cannot be automatically cleared by the prototype. Follow the applicable officer workflow.</p>
                                <button onClick={resetVerification}>Verify another voter</button>
                            </section>
                        )}
                    </>
                )}

                <p className="portal-footer"><Link to="/">Public portal</Link> · <Link to="/admin">BLO / officer dashboard</Link></p>
            </section>
        </main>
    );
}

export default VotingVerification;

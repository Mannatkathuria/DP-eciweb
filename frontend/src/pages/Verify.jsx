import { useEffect, useRef, useState } from "react";
import "./Verify.css";
import api from "../api/axios";

/* -------------------------------------------------------
Helpers
------------------------------------------------------- */

const normalizeValue = (value) =>
String(value ?? "")
.trim()
.toLowerCase()
.replace(/[.,\s-]+/g, "");

function getDocumentComparisonRows(documentData, elector) {
if (!documentData || !elector) return [];

const fields = [
    {
        label: "Name",
        documentKeys: ["name", "fullName", "full_name"],
        electorKeys: ["name", "fullName", "full_name"],
        normalize: (value) =>
            String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
    },
    {
        label: "Date of birth",
        documentKeys: ["dateOfBirth", "dob", "date_of_birth"],
        electorKeys: ["dateOfBirth", "dob", "date_of_birth"],
        normalize: normalizeValue
    },
    {
        label: "EPIC number",
        documentKeys: ["epic", "epicNumber", "epic_number"],
        electorKeys: ["epic", "epicNumber", "epic_number"],
        normalize: normalizeValue
    }
];

const rows = fields.map((field) => {
    const docKey = field.documentKeys.find(
        (key) =>
            documentData[key] !== undefined &&
            documentData[key] !== null &&
            String(documentData[key]).trim() !== ""
    );

    const electorKey = field.electorKeys.find(
        (key) =>
            elector[key] !== undefined &&
            elector[key] !== null &&
            String(elector[key]).trim() !== ""
    );

    const documentValue = docKey ? documentData[docKey] : null;
    const electoralValue = electorKey ? elector[electorKey] : null;

    let status = "unknown";

    if (documentValue != null && electoralValue != null) {
        status =
            field.normalize(documentValue) ===
            field.normalize(electoralValue)
                ? "match"
                : "mismatch";
    }

    return {
        label: field.label,
        documentValue,
        electoralValue,
        status
    };
});

const knownKeys = new Set(
    fields.flatMap((field) => field.documentKeys)
);

for (const [key, value] of Object.entries(documentData)) {
    if (
        !knownKeys.has(key) &&
        value !== null &&
        value !== undefined &&
        typeof value !== "object" &&
        String(value).trim() !== ""
    ) {
        rows.push({
            label: key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (character) => character.toUpperCase()),
            documentValue: value,
            electoralValue: null,
            status: "unknown"
        });
    }
}

return rows;

}

/* -------------------------------------------------------
Result card
------------------------------------------------------- */

function OutcomeCard({ result, onReset }) {
if (!result) return null;

const ok = result.status === "verified";

return (
    <section className="verify-card">
        <p className="step-label">RESULT</p>

        <div className={ok ? "success-box" : "record-warning"}>
            <strong>
                {ok
                    ? "Verification Successful"
                    : "Manual / BLO Review Required"}
            </strong>

            {ok ? (
                <p>
                    Your verification checks were completed successfully.
                    The result is intended to assist authorised election
                    officials and does not independently determine voting
                    eligibility.
                </p>
            ) : (
                <>
                    <p>
                        This does <b>not</b> affect your right to vote.
                        A Booth Level Officer or authorised official can
                        review the case. You can also complete the normal
                        verification process at the polling station.
                    </p>

                    {Array.isArray(result.reasons) &&
                        result.reasons.length > 0 && (
                            <ul>
                                {result.reasons.map((reason, index) => (
                                    <li key={`${reason}-${index}`}>
                                        {reason}
                                    </li>
                                ))}
                            </ul>
                        )}
                </>
            )}

            {Array.isArray(result.notes) && result.notes.length > 0 && (
                <p>
                    <em>{result.notes.join(" ")}</em>
                </p>
            )}
        </div>

        <div className="record-warning">
            <strong>Prototype notice</strong>
            <p>
                Automated results assist election officials. They must not
                be used independently to determine eligibility or deny a
                person the right to vote.
            </p>
        </div>

        <button
            type="button"
            className="verify-button"
            onClick={onReset}
        >
            Start New Verification
        </button>
    </section>
);


}

/* -------------------------------------------------------
Main component
------------------------------------------------------- */

function Verify() {
// Step 1: Find record
// Step 2: Confirm record
// Step 3: Upload identity document
// Step 4: Review document and prepare face check
// Step 5: Perform face/liveness check

const [step, setStep] = useState(1);
const [method, setMethod] = useState("epic");

const [formData, setFormData] = useState({
    epic: "",
    name: "",
    state: "",
    district: "",
    constituency: "",
    mobile: ""
});

const [elector, setElector] = useState(null);
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

// OTP
const [pendingElector, setPendingElector] = useState(null);
const [otpPending, setOtpPending] = useState(false);
const [otp, setOtp] = useState("");
const [otpLoading, setOtpLoading] = useState(false);

// Document verification
const [identityMethod, setIdentityMethod] = useState(null);
const [identityResult, setIdentityResult] = useState(null);
const [verificationId, setVerificationId] = useState(null);
const [documentFile, setDocumentFile] = useState(null);
const [documentPreview, setDocumentPreview] = useState("");
const [documentData, setDocumentData] = useState(null);
const [showDocumentComparison, setShowDocumentComparison] =
    useState(false);

// Camera and face verification
const [cameraStream, setCameraStream] = useState(null);
const [documentCameraOpen, setDocumentCameraOpen] = useState(false);
const [cameraReady, setCameraReady] = useState(false);
const [faceResult, setFaceResult] = useState(null);
const [faceLoading, setFaceLoading] = useState(false);
const [challenge, setChallenge] = useState(null);
const [prompt, setPrompt] = useState("");

const videoRef = useRef(null);

// Calculate only after both state values and the helper are available.
const comparisonRows = getDocumentComparisonRows(documentData, elector);

const CHALLENGE_TEXT = {
    blink: "Blink your eyes naturally a couple of times.",
    left: "Slowly turn your head to YOUR left, then look back.",
    right: "Slowly turn your head to YOUR right, then look back."
};

/* ---------------------------------------------------
   Camera lifecycle
--------------------------------------------------- */

useEffect(() => {
    const video = videoRef.current;

    if (!video || !cameraStream || step !== 5) {
        setCameraReady(false);
        return;
    }

    let cancelled = false;

    const markReady = async () => {
        try {
            if (video.srcObject !== cameraStream) {
                video.srcObject = cameraStream;
            }

            await video.play();

            if (
                !cancelled &&
                video.videoWidth > 0 &&
                video.videoHeight > 0
            ) {
                setCameraReady(true);
            }
        } catch (err) {
            console.error("Could not start video playback:", err);

            if (!cancelled) {
                setCameraReady(false);
                setError(
                    "Could not start the camera preview. Please allow camera access."
                );
            }
        }
    };

    const handleVideoReady = () => {
        markReady();
    };

    video.srcObject = cameraStream;
    video.addEventListener("loadedmetadata", handleVideoReady);
    video.addEventListener("canplay", handleVideoReady);

    if (video.readyState >= 2) {
        markReady();
    }

    return () => {
        cancelled = true;
        video.removeEventListener("loadedmetadata", handleVideoReady);
        video.removeEventListener("canplay", handleVideoReady);
    };
}, [cameraStream, step]);

// Attach the stream to whichever video element is currently rendered.
useEffect(() => {
    if (videoRef.current && cameraStream) {
        videoRef.current.srcObject = cameraStream;
    }
}, [cameraStream, documentCameraOpen, step]);

// Release camera resources when this page unmounts.
useEffect(() => {
    return () => {
        cameraStream?.getTracks().forEach((track) => track.stop());
    };
}, [cameraStream]);

const stopCamera = () => {
    if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
    }

    setCameraStream(null);
    setCameraReady(false);
    setDocumentCameraOpen(false);
};

/* ---------------------------------------------------
   Form helpers
--------------------------------------------------- */

const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
        ...previous,
        [name]: value
    }));
};

/* ---------------------------------------------------
   Step 1: Search and OTP
--------------------------------------------------- */

const handleSearch = async (event) => {
    event.preventDefault();
    setError("");

    if (method === "epic" && !formData.epic.trim()) {
        setError("Please enter your EPIC number.");
        return;
    }

    if (method === "details") {
        if (!formData.name.trim() || !formData.state) {
            setError("Please enter your name and select your state.");
            return;
        }
    }

    if (method === "mobile" && !formData.mobile.trim()) {
        setError("Please enter your registered mobile number.");
        return;
    }

    try {
        setLoading(true);

        const response = await api.post("/electors/search", {
            method,
            epic: formData.epic.trim().toUpperCase(),
            name: formData.name.trim(),
            state: formData.state,
            district: formData.district.trim(),
            assemblyConstituency: formData.constituency.trim(),
            mobile: formData.mobile.trim()
        });

        const foundElector = response.data?.data;

        if (!foundElector?.epic) {
            throw new Error(
                "The returned electoral record has no EPIC number."
            );
        }

        // Generate a demo OTP on the backend before revealing the record.
        await api.post("/verification/otp/send", {
            electorId: foundElector.epic
        });

        setPendingElector(foundElector);
        setOtp("");
        setOtpPending(true);
    } catch (err) {
        console.error("Elector search failed:", err);

        setError(
            err.response?.data?.message ||
                err.message ||
                "Unable to search the electoral record."
        );
    } finally {
        setLoading(false);
    }
};

const handleOtpVerify = async (event) => {
    event.preventDefault();
    setError("");

    if (!pendingElector?.epic) {
        setError("Search for your electoral record again.");
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        setError("Enter the six-digit OTP.");
        return;
    }

    try {
        setOtpLoading(true);

        await api.post("/verification/otp/verify", {
            electorId: pendingElector.epic,
            otp
        });

        setElector(pendingElector);
        setPendingElector(null);
        setOtpPending(false);
        setOtp("");
        setStep(2);
    } catch (err) {
        setError(
            err.response?.data?.message || "OTP verification failed."
        );
    } finally {
        setOtpLoading(false);
    }
};

const handleResendOtp = async () => {
    if (!pendingElector?.epic) {
        setError("Search for your electoral record again.");
        return;
    }

    try {
        setError("");
        setOtpLoading(true);
        setOtp("");

        await api.post("/verification/otp/send", {
            electorId: pendingElector.epic
        });
    } catch (err) {
        setError(
            err.response?.data?.message ||
                "Could not generate a new OTP."
        );
    } finally {
        setOtpLoading(false);
    }
};

/* ---------------------------------------------------
   Step 2: Confirm record
--------------------------------------------------- */

const confirmRecord = () => {
    if (!elector) {
        setError("No electoral record is available for confirmation.");
        return;
    }

    setError("");
    setStep(3);
};

const goBack = () => {
    setError("");
    setStep((previous) => Math.max(1, previous - 1));
};

/* ---------------------------------------------------
   Step 3: Document camera
--------------------------------------------------- */

const startDocumentCamera = async () => {
    try {
        setError("");

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "Camera access requires HTTPS or localhost in a supported browser."
            );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" }
            },
            audio: false
        });

        setCameraStream(stream);
        setDocumentCameraOpen(true);
    } catch (err) {
        console.error("Document camera error:", err);

        setError(
            err.name === "NotAllowedError"
                ? "Camera permission was denied. Please allow camera access."
                : err.message ||
                      "Unable to access the camera. Check your camera permissions."
        );
    }
};

const captureDocumentPhoto = () => {
    const video = videoRef.current;

    if (!video?.videoWidth || !video?.videoHeight) {
        setError("Camera is not ready yet. Please try again.");
        return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
        setError("Unable to capture the document image.");
        return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
        (blob) => {
            if (!blob) {
                setError("Could not capture the document photo.");
                return;
            }

            const file = new File(
                [blob],
                `identity-${Date.now()}.jpg`,
                { type: "image/jpeg" }
            );

            setDocumentFile(file);

            setDocumentPreview((previous) => {
                if (previous) URL.revokeObjectURL(previous);
                return URL.createObjectURL(file);
            });

            setError("");
            stopCamera();
        },
        "image/jpeg",
        0.92
    );
};

const handleDocumentFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setError("");

    if (documentPreview) {
        URL.revokeObjectURL(documentPreview);
        setDocumentPreview("");
    }

    setDocumentFile(null);

    if (!file) return;

    const supportedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!supportedTypes.includes(file.type)) {
        setError("Choose a JPEG, PNG, or WebP image.");
        event.target.value = "";
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        setError("The image must be smaller than 8 MB.");
        event.target.value = "";
        return;
    }

    setDocumentFile(file);
    setDocumentPreview(URL.createObjectURL(file));
};

/* ---------------------------------------------------
   Step 3: Decode and verify identity document
--------------------------------------------------- */

const handleIdentityVerification = async (selectedMethod) => {
    if (!elector?.epic) {
        setError("Electoral record is missing. Please start again.");
        return;
    }

    if (!documentFile) {
        setError("Please upload an identity document first.");
        return;
    }

    setError("");
    setIdentityMethod(selectedMethod);
    setLoading(true);

    try {
        
        const uploadData = new FormData();
        uploadData.append("document", documentFile, documentFile.name);
        uploadData.append("method", selectedMethod);

        console.log("Uploading document:", {
            name: documentFile.name,
            type: documentFile.type,
            size: documentFile.size,
            isFormData: uploadData instanceof FormData,
        });

        const decodeResponse = await api.post(
            "/verification/document/decode",
            uploadData,
            {
                // Let the browser/Axios generate the multipart boundary.
                headers: {
                    "Content-Type": undefined,
                },
            }
        );

        const extractedData =
            decodeResponse.data?.data?.documentData;

        if (
            !extractedData ||
            typeof extractedData !== "object" ||
            Array.isArray(extractedData)
        ) {
            throw new Error(
                "The document decoder returned invalid data."
            );
        }

        const identityResponse = await api.post(
            "/verification/identity",
            {
                electorId: elector.epic,
                method: selectedMethod,
                documentData: extractedData
            }
        );

        const result = identityResponse.data?.data;

        if (!result?.verificationId) {
            throw new Error(
                "The backend did not return a verification session ID."
            );
        }

        setDocumentData(extractedData);
        setVerificationId(result.verificationId);
        setIdentityResult(result.identity ?? result);
        setFaceResult(null);
        setChallenge(null);
        setPrompt("");
        setShowDocumentComparison(true);
        setStep(4);
    } catch (err) {
        console.error("Document/identity verification failed:", err);

        setError(
            err.response?.data?.message ||
                err.message ||
                "Document verification could not be completed."
        );
    } finally {
        setLoading(false);
    }
};

/* ---------------------------------------------------
   Step 5: Face and liveness verification
--------------------------------------------------- */

const startCamera = async () => {
    try {
        setError("");
        setCameraReady(false);

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "Camera access is unavailable. Use HTTPS or localhost in a supported browser."
            );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        setCameraStream(stream);
    } catch (err) {
        console.error("Face camera start failed:", err);

        setError(
            err.name === "NotAllowedError"
                ? "Camera permission was denied. Allow camera access in your browser settings."
                : err.message || "Unable to access the camera."
        );
    }
};

const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const captureFrames = async () => {
    const video = videoRef.current;

    if (!video?.videoWidth || !video?.videoHeight) {
        throw new Error("Camera preview is not ready.");
    }

    const scale = Math.min(1, 480 / video.videoWidth);
    const canvas = document.createElement("canvas");

    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Unable to capture camera frames.");
    }

    const frames = [];
    const endTime = Date.now() + 3500;

    while (Date.now() < endTime && frames.length < 36) {
        context.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        frames.push(canvas.toDataURL("image/jpeg", 0.6));
        await sleep(100);
    }

    return frames;
};

const runFaceVerification = async () => {
    if (!verificationId) {
        setError(
            "Verification session is missing. Please repeat document verification."
        );
        return;
    }

    if (!videoRef.current?.videoWidth || !cameraReady) {
        setError(
            "Camera is not ready yet. Please wait a moment and try again."
        );
        return;
    }

    try {
        setFaceLoading(true);
        setError("");
        setFaceResult(null);

        let currentChallenge = challenge;

        if (!currentChallenge) {
            const challengeResponse = await api.post(
                `/verification/${verificationId}/challenge`
            );

            currentChallenge =
                challengeResponse.data?.data?.challenge;

            if (!CHALLENGE_TEXT[currentChallenge]) {
                throw new Error(
                    "The server returned an unsupported liveness challenge."
                );
            }

            setChallenge(currentChallenge);
        }

        setPrompt(CHALLENGE_TEXT[currentChallenge]);

        await sleep(1500);

        setPrompt(`Recording… ${CHALLENGE_TEXT[currentChallenge]}`);

        const frames = await captureFrames();

        setPrompt("Processing verification…");

        const response = await api.post(
            `/verification/${verificationId}/face`,
            { frames }
        );

        const result = response.data?.data;

        if (!result) {
            throw new Error(
                "The face verification service returned an empty response."
            );
        }

        if (result.status === "retry") {
            setChallenge(result.challenge ?? null);

            const reasons = Array.isArray(result.reasons)
                ? result.reasons.join(" ")
                : "The liveness check could not be completed.";

            setError(
                `${reasons} Please follow the new instruction and try again.`
            );
        } else {
            setFaceResult(result);
            stopCamera();
        }
    } catch (err) {
        console.error("Face verification failed:", err);

        setError(
            err.response?.data?.message ||
                err.message ||
                "Face verification service unavailable."
        );
    } finally {
        setPrompt("");
        setFaceLoading(false);
    }
};

/* ---------------------------------------------------
   Reset
--------------------------------------------------- */

const resetAll = () => {
    stopCamera();

    if (documentPreview) {
        URL.revokeObjectURL(documentPreview);
    }

    setStep(1);
    setMethod("epic");

    setFormData({
        epic: "",
        name: "",
        state: "",
        district: "",
        constituency: "",
        mobile: ""
    });

    setElector(null);
    setPendingElector(null);
    setOtpPending(false);
    setOtp("");
    setOtpLoading(false);

    setIdentityMethod(null);
    setIdentityResult(null);
    setVerificationId(null);

    setDocumentFile(null);
    setDocumentPreview("");
    setDocumentData(null);
    setShowDocumentComparison(false);

    setFaceResult(null);
    setChallenge(null);
    setPrompt("");
    setCameraReady(false);

    setError("");
    setLoading(false);
    setFaceLoading(false);
};

/* ---------------------------------------------------
   Render
--------------------------------------------------- */

return (
    <main className="verify-page">
        <div className="verify-container">
            <header className="verify-header">
                <p className="eyebrow">
                    PRE-ELECTION VERIFICATION
                </p>

                <h1>Verify your electoral record</h1>

                <p>
                    Confirm your electoral record before proceeding to
                    identity verification.
                </p>
            </header>

            {/* Progress indicator */}

            <div className="progress">
                {[
                    { number: 1, label: "Electoral Record" },
                    { number: 2, label: "Confirm" },
                    { number: 3, label: "Identity" },
                    { number: 4, label: "Document Review" },
                    { number: 5, label: "Face & Liveness" }
                ].map((item, index, items) => (
                    <div
                        className="progress-item"
                        key={item.number}
                        style={{
                            display: "contents"
                        }}
                    >
                        <div
                            className={`progress-step ${
                                step >= item.number ? "active" : ""
                            }`}
                        >
                            <span>{item.number}</span>
                            <p>{item.label}</p>
                        </div>

                        {index < items.length - 1 && (
                            <div className="progress-line" />
                        )}
                    </div>
                ))}
            </div>

            {/* STEP 1: Search / OTP */}

            {step === 1 && (
                <section className="verify-card">
                    <h2>
                        {otpPending
                            ? "Verify your registered record"
                            : "Find your electoral record"}
                    </h2>

                    <p className="card-description">
                        {otpPending
                            ? "Enter the six-digit demo OTP to continue."
                            : "Select an available method to locate your electoral record."}
                    </p>

                    {error && (
                        <div className="verification-error" role="alert">
                            {error}
                        </div>
                    )}

                    {otpPending ? (
                        <form
                            onSubmit={handleOtpVerify}
                            className="otp-form"
                        >
                            <p className="record-warning">
                                Demo OTP generated. Check the backend
                                terminal where your Express server is
                                running.
                            </p>

                            <label htmlFor="demo-otp">
                                Six-digit OTP
                            </label>

                            <input
                                id="demo-otp"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={otp}
                                onChange={(event) =>
                                    setOtp(
                                        event.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 6)
                                    )
                                }
                                placeholder="Enter OTP"
                                required
                            />

                            <button
                                type="submit"
                                className="verify-button"
                                disabled={
                                    otpLoading || otp.length !== 6
                                }
                            >
                                {otpLoading
                                    ? "Verifying..."
                                    : "Verify OTP"}
                            </button>

                            <button
                                type="button"
                                className="back-button"
                                onClick={handleResendOtp}
                                disabled={otpLoading}
                            >
                                Generate New OTP
                            </button>

                            <button
                                type="button"
                                className="back-button"
                                onClick={() => {
                                    setOtpPending(false);
                                    setPendingElector(null);
                                    setOtp("");
                                    setError("");
                                }}
                                disabled={otpLoading}
                            >
                                Back to Search
                            </button>

                            <p className="card-description">
                                Demo only: the OTP is logged by the
                                backend. No SMS is sent.
                            </p>
                        </form>
                    ) : (
                        <>
                            <div className="method-tabs">
                                <button
                                    type="button"
                                    className={
                                        method === "epic" ? "active" : ""
                                    }
                                    onClick={() => {
                                        setMethod("epic");
                                        setError("");
                                    }}
                                >
                                    EPIC Number
                                </button>

                                <button
                                    type="button"
                                    className={
                                        method === "details" ? "active" : ""
                                    }
                                    onClick={() => {
                                        setMethod("details");
                                        setError("");
                                    }}
                                >
                                    Personal Details
                                </button>

                                <button
                                    type="button"
                                    className={
                                        method === "mobile" ? "active" : ""
                                    }
                                    onClick={() => {
                                        setMethod("mobile");
                                        setError("");
                                    }}
                                >
                                    Mobile Number
                                </button>
                            </div>

                            <form onSubmit={handleSearch}>
                                {method === "epic" && (
                                    <div className="form-group">
                                        <label htmlFor="epic">
                                            EPIC Number
                                        </label>

                                        <input
                                            id="epic"
                                            name="epic"
                                            type="text"
                                            value={formData.epic}
                                            onChange={(event) =>
                                                setFormData((previous) => ({
                                                    ...previous,
                                                    epic: event.target.value.toUpperCase()
                                                }))
                                            }
                                            placeholder="Enter your EPIC number"
                                            autoComplete="off"
                                            required
                                        />

                                        <span>
                                            Enter the EPIC number printed
                                            on your Elector Photo Identity
                                            Card.
                                        </span>
                                    </div>
                                )}

                                {method === "details" && (
                                    <div className="form-section">
                                        <div className="form-group">
                                            <label htmlFor="name">
                                                Name
                                            </label>

                                            <input
                                                id="name"
                                                name="name"
                                                type="text"
                                                value={formData.name}
                                                onChange={handleChange}
                                                placeholder="Enter name"
                                                required
                                            />
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label htmlFor="state">
                                                    State / UT
                                                </label>

                                                <select
                                                    id="state"
                                                    name="state"
                                                    value={formData.state}
                                                    onChange={handleChange}
                                                    required
                                                >
                                                    <option value="">
                                                        Select State / UT
                                                    </option>
                                                    <option value="Punjab">
                                                        Punjab
                                                    </option>
                                                    <option value="Himachal Pradesh">
                                                        Himachal Pradesh
                                                    </option>
                                                    <option value="Haryana">
                                                        Haryana
                                                    </option>
                                                    <option value="Delhi">
                                                        Delhi
                                                    </option>
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label htmlFor="district">
                                                    District
                                                </label>

                                                <input
                                                    id="district"
                                                    name="district"
                                                    type="text"
                                                    value={formData.district}
                                                    onChange={handleChange}
                                                    placeholder="Enter district"
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label htmlFor="constituency">
                                                Assembly Constituency
                                            </label>

                                            <input
                                                id="constituency"
                                                name="constituency"
                                                type="text"
                                                value={formData.constituency}
                                                onChange={handleChange}
                                                placeholder="Enter constituency"
                                            />
                                        </div>
                                    </div>
                                )}

                                {method === "mobile" && (
                                    <div className="form-group">
                                        <label htmlFor="mobile">
                                            Registered Mobile Number
                                        </label>

                                        <input
                                            id="mobile"
                                            name="mobile"
                                            type="tel"
                                            value={formData.mobile}
                                            onChange={handleChange}
                                            placeholder="Enter registered mobile number"
                                            autoComplete="tel"
                                            required
                                        />

                                        <span>
                                            This method is available only
                                            if supported by your backend's
                                            electoral search service.
                                        </span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="verify-button"
                                    disabled={loading}
                                >
                                    {loading
                                        ? "Searching..."
                                        : "Find Record & Generate OTP"}
                                </button>
                            </form>
                        </>
                    )}
                </section>
            )}

            {/* STEP 2: Confirm electoral record */}

            {step === 2 && elector && (
                <section className="verify-card">
                    <div className="step-heading">
                        <div>
                            <p className="step-label">STEP 2</p>
                            <h2>Confirm electoral record</h2>
                        </div>

                        <span className="record-status">
                            Record Located
                        </span>
                    </div>

                    <p className="card-description">
                        Review the electoral information before continuing.
                    </p>

                    <div className="record-box">
                        {[
                            ["Name", elector.name],
                            ["EPIC Number", elector.epic],
                            ["State", elector.state],
                            ["District", elector.district],
                            [
                                "Assembly Constituency",
                                elector.assemblyConstituency
                            ],
                            ["Part Number", elector.partNumber],
                            ["Polling Station", elector.pollingStation]
                        ].map(([label, value]) => (
                            <div className="record-row" key={label}>
                                <span>{label}</span>
                                <strong>{value || "—"}</strong>
                            </div>
                        ))}
                    </div>

                    <div className="record-warning">
                        <strong>Important</strong>
                        <p>
                            Ensure that this record belongs to you before
                            proceeding. If any information appears
                            incorrect, request assistance from an
                            authorised official.
                        </p>
                    </div>

                    {error && (
                        <div className="verification-error" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="step-actions">
                        <button
                            type="button"
                            className="back-button"
                            onClick={goBack}
                        >
                            Back
                        </button>

                        <button
                            type="button"
                            className="verify-button"
                            onClick={confirmRecord}
                        >
                            Confirm & Continue
                        </button>
                    </div>
                </section>
            )}

            {/* STEP 3: Upload document */}

            {step === 3 && (
                <section className="verify-card">
                    <p className="step-label">STEP 3</p>
                    <h2>Verify your identity</h2>

                    <p className="card-description">
                        Upload a clear image of your identity document.
                        The prototype will extract supported fields and
                        compare them with your electoral record.
                    </p>

                    {error && (
                        <div className="verification-error" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="document-upload">
                        <label htmlFor="identity-document">
                            Upload identity document
                        </label>

                        <input
                            id="identity-document"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleDocumentFileChange}
                            disabled={loading}
                        />

                        {documentFile && (
                            <p className="selected-file">
                                Selected: {documentFile.name}
                            </p>
                        )}

                        <div className="document-camera-actions">
                            <button
                                type="button"
                                className="back-button"
                                onClick={startDocumentCamera}
                                disabled={loading || !!cameraStream}
                            >
                                Take Photo with Camera
                            </button>
                        </div>

                        {documentCameraOpen && cameraStream && (
                            <div className="document-camera-panel">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="camera-preview"
                                />

                                <div className="step-actions">
                                    <button
                                        type="button"
                                        className="verify-button"
                                        onClick={captureDocumentPhoto}
                                    >
                                        Capture Photo
                                    </button>

                                    <button
                                        type="button"
                                        className="back-button"
                                        onClick={stopCamera}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {documentPreview && (
                            <img
                                src={documentPreview}
                                alt="Selected identity document preview"
                                className="document-preview"
                            />
                        )}
                    </div>

                    <p className="card-description">
                        Choose the document type supported by your backend:
                    </p>

                    <div className="identity-options">
                        {[
                            {
                                method: "aadhaar",
                                title: "Aadhaar",
                                description:
                                    "Upload an image supported by your Aadhaar decoder."
                            },
                            {
                                method: "digilocker",
                                title: "DigiLocker",
                                description:
                                    "Select an issued document saved as an image."
                            },
                            {
                                method: "pan",
                                title: "PAN",
                                description:
                                    "Upload a clear PAN card image."
                            },
                            {
                                method: "dl",
                                title: "Driving Licence",
                                description:
                                    "Upload a clear driving licence image."
                            }
                        ].map((item) => (
                            <button
                                key={item.method}
                                type="button"
                                className="identity-option"
                                onClick={() =>
                                    handleIdentityVerification(item.method)
                                }
                                disabled={loading || !documentFile}
                            >
                                <strong>{item.title}</strong>
                                <span>{item.description}</span>
                            </button>
                        ))}
                    </div>

                    {!documentFile && (
                        <p className="card-description">
                            Upload a document image before choosing a
                            verification method.
                        </p>
                    )}

                    {identityMethod && (
                        <p className="card-description">
                            Selected method: {identityMethod}
                        </p>
                    )}

                    {loading && (
                        <div
                            className="verification-loading"
                            role="status"
                        >
                            Decoding document and verifying identity...
                        </div>
                    )}

                    <div className="step-actions">
                        <button
                            type="button"
                            className="back-button"
                            onClick={goBack}
                            disabled={loading}
                        >
                            Back
                        </button>
                    </div>
                </section>
            )}

            {/* STEP 4A: Document comparison */}

            {step === 4 &&
                !faceResult &&
                showDocumentComparison && (
                    <section className="verify-card">
                        <p className="step-label">
                            STEP 4 — DOCUMENT REVIEW
                        </p>

                        <h2>
                            Compare document with electoral record
                        </h2>

                        <p className="card-description">
                            Review the extracted fields. Colour coding is
                            an indication for review, not a decision about
                            voting eligibility or document authenticity.
                        </p>

                        <div className="comparison-legend">
                            <span className="comparison-match">
                                Green: Match
                            </span>
                            <span className="comparison-mismatch">
                                Red: Mismatch
                            </span>
                            <span className="comparison-unknown">
                                Grey: Not comparable
                            </span>
                        </div>

                        <div className="document-comparison">
                            <div className="comparison-header">
                                <strong>Field</strong>
                                <strong>Document</strong>
                                <strong>Electoral record</strong>
                            </div>

                            {comparisonRows.length > 0 ? (
                                comparisonRows.map((row, index) => (
                                    <div
                                        className={`comparison-row comparison-${row.status}`}
                                        key={`${row.label}-${index}`}
                                    >
                                        <strong>{row.label}</strong>
                                        <span>
                                            {row.documentValue ?? "Not available"}
                                        </span>
                                        <span>
                                            {row.electoralValue ?? "Not available"}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <p className="card-description">
                                    No comparable document fields were
                                    returned by the decoder.
                                </p>
                            )}
                        </div>

                        {identityResult?.reviewRequired && (
                            <div className="record-warning">
                                <strong>Further review may be needed</strong>
                                <p>
                                    Extracted document data alone does not
                                    establish authenticity. Mismatches or
                                    unavailable fields should be reviewed
                                    by an authorised official.
                                </p>
                            </div>
                        )}

                        <div className="record-warning">
                            <strong>Important</strong>
                            <p>
                                A field mismatch is not, by itself, proof
                                of fraud or a reason to deny voting rights.
                                It should be resolved through the
                                appropriate review process.
                            </p>
                        </div>

                        <div className="step-actions">
                            <button
                                type="button"
                                className="back-button"
                                onClick={() => {
                                    setShowDocumentComparison(false);
                                    setStep(3);
                                }}
                            >
                                Back
                            </button>

                            <button
                                type="button"
                                className="verify-button"
                                onClick={() =>
                                    setShowDocumentComparison(false)
                                }
                            >
                                Continue to Face Verification
                            </button>
                        </div>
                    </section>
                )}

            {/* STEP 4B: Face verification introduction */}

            {step === 4 &&
                !faceResult &&
                !showDocumentComparison && (
                    <section className="verify-card">
                        <p className="step-label">STEP 4</p>

                        <h2>Face & Liveness Verification</h2>

                        <p className="card-description">
                            Complete the prototype's face and liveness
                            check. If the result is inconclusive, an
                            authorised official should review it.
                        </p>

                        <div className="liveness-box">
                            <div className="liveness-icon">✓</div>

                            <h3>Ready for verification</h3>

                            <p>
                                Your document review has been recorded.
                                Proceed to the camera check when you are
                                ready.
                            </p>

                            <p>
                                The document comparison alone does not
                                establish the authenticity of the document
                                or determine voting eligibility.
                            </p>
                        </div>

                        <div className="record-warning">
                            <strong>Privacy notice</strong>
                            <p>
                                Camera access is requested only when you
                                start the liveness check. This is a
                                demonstration, not an official ECI identity
                                verification service.
                            </p>
                        </div>

                        <div className="step-actions">
                            <button
                                type="button"
                                className="back-button"
                                onClick={() => {
                                    setShowDocumentComparison(true);
                                    setError("");
                                }}
                            >
                                Back to Document Review
                            </button>

                            <button
                                type="button"
                                className="verify-button"
                                onClick={() => {
                                    setError("");
                                    setStep(5);
                                }}
                                disabled={!verificationId}
                            >
                                Start Face Verification
                            </button>
                        </div>
                    </section>
                )}

            {/* STEP 5: Camera and liveness */}

            {step === 5 && !faceResult && (
                <section className="verify-card">
                    <p className="step-label">STEP 5</p>

                    <h2>Face & Liveness Check</h2>

                    <p className="card-description">
                        Enable your camera and follow the instruction
                        displayed by the verification system.
                    </p>

                    {error && (
                        <div className="verification-error" role="alert">
                            {error}
                        </div>
                    )}

                    {!cameraStream && (
                        <div className="face-start">
                            <div className="record-warning">
                                <strong>Before you continue</strong>
                                <p>
                                    Ensure your face is clearly visible,
                                    your camera is enabled, and the
                                    environment is well lit.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="verify-button"
                                onClick={startCamera}
                            >
                                Enable Camera
                            </button>
                        </div>
                    )}

                    {cameraStream && (
                        <div className="face-verification">
                            <div className="camera-container">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="camera-preview"
                                />
                            </div>

                            <div className="record-warning">
                                <strong>
                                    {prompt
                                        ? "Follow this instruction"
                                        : "Position yourself correctly"}
                                </strong>

                                <p>
                                    {prompt ||
                                        "Keep your face centred and clearly visible."}
                                </p>
                            </div>

                            <div className="step-actions">
                                <button
                                    type="button"
                                    className="back-button"
                                    onClick={stopCamera}
                                    disabled={faceLoading}
                                >
                                    Stop Camera
                                </button>

                                <button
                                    type="button"
                                    className="verify-button"
                                    onClick={runFaceVerification}
                                    disabled={!cameraReady || faceLoading}
                                >
                                    {faceLoading
                                        ? "Processing..."
                                        : "Run Liveness Check"}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="step-actions">
                        <button
                            type="button"
                            className="back-button"
                            onClick={() => {
                                if (faceLoading) return;
                                stopCamera();
                                setError("");
                                setStep(4);
                                setShowDocumentComparison(false);
                            }}
                            disabled={faceLoading}
                        >
                            Back
                        </button>
                    </div>
                </section>
            )}

            {/* Final result */}

            {step === 5 && faceResult && (
                <OutcomeCard result={faceResult} onReset={resetAll} />
            )}

            <div className="verification-note">
                <strong>About this verification</strong>

                <p>
                    This prototype assists with pre-election verification
                    and identifying cases that may need further review.
                    It does not independently determine an elector's
                    eligibility to vote. Demo OTPs are logged by the
                    backend; no SMS is sent by this implementation.
                </p>
            </div>
        </div>
    </main>
);

}

export default Verify;

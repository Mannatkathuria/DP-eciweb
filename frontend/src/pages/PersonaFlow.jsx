import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

const PERSONA_SDK = "https://cdn.withpersona.com/dist/persona-v5.8.0.js";

function loadPersonaSdk() {
    if (window.Persona?.Client) return Promise.resolve();
    if (window.__personaSdkPromise) return window.__personaSdkPromise;

    window.__personaSdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = PERSONA_SDK;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => window.Persona?.Client
            ? resolve()
            : reject(new Error("Persona SDK loaded without Client API."));
        script.onerror = () => reject(new Error("Could not load Persona's embedded verification flow."));
        document.head.appendChild(script);
    });
    return window.__personaSdkPromise;
}

export default function PersonaFlow({ config, onComplete, onCancel }) {
    const { t } = useTranslation();
    const [error, setError] = useState("");
    const [notice, setNotice] = useState(t("persona.loading") || "Initializing embedded verification flow…");
    const [sdkReady, setSdkReady] = useState(false);
    const clientRef = useRef(null);

    useEffect(() => {
        if (!config?.inquiryId) return undefined;
        let disposed = false;

        loadPersonaSdk().then(() => {
            if (disposed) return;
            try {
                const client = new window.Persona.Client({
                    inquiryId: config.inquiryId,
                    environmentId: config.environmentId,
                    ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
                    onReady: () => {
                        if (disposed) return;
                        setNotice("");
                        setSdkReady(true);
                        client.open();
                    },
                    onComplete: async (result) => {
                        setNotice(t("persona.completed") || "Verification complete! Redirecting to dashboard…");
                        await onComplete?.(result || { inquiryId: config.inquiryId });
                    },
                    onCancel: () => {
                        setNotice(t("persona.cancelled") || "Verification was closed.");
                        onCancel?.();
                    },
                    onError: (personaError) => {
                        console.error("Persona embedded flow error:", personaError);
                        setError(personaError?.message || t("persona.flowError") || "Verification flow encountered an issue.");
                    }
                });
                clientRef.current = client;
            } catch (err) {
                console.error("Failed to initialize Persona Client:", err);
                setError("Unable to launch verification modal inside app.");
            }
        }).catch((err) => {
            if (!disposed) {
                console.error("SDK load error:", err);
                setError("Could not load Persona embedded SDK.");
            }
        });

        return () => {
            disposed = true;
            try { clientRef.current?.destroy(); } catch {}
        };
    }, [config?.inquiryId, config?.environmentId, config?.sessionToken, onComplete, onCancel, t]);

    return (
        <section className="persona-flow-card" aria-live="polite">
            <div className="persona-flow-header">
                <span className="eci-badge">Election Commission of India · E-KYC</span>
                <h2>{t("persona.title") || "In-App Identity Verification"}</h2>
                <p>{t("persona.description") || "Identity verification is running securely inside this application. Complete the steps to continue."}</p>
            </div>

            {notice && <p className="persona-flow-notice" role="status">ℹ {notice}</p>}
            {error && <p className="persona-flow-error" role="alert">⚠ {error}</p>}

            {config?.verificationUrl && (
                <div className="persona-inline-wrapper" style={{ marginTop: "16px" }}>
                    <div className="persona-frame-container" style={{
                        borderRadius: "16px",
                        overflow: "hidden",
                        border: "2px solid var(--accent, #ff9933)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                        background: "#ffffff"
                    }}>
                        <iframe
                            src={config.verificationUrl}
                            title="Persona Verification"
                            allow="camera; microphone; geolocation"
                            style={{
                                width: "100%",
                                height: "650px",
                                border: "none"
                            }}
                        />
                    </div>
                </div>
            )}

            <div className="persona-flow-footer" style={{ marginTop: "18px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                    type="button"
                    className="primary-btn"
                    onClick={() => onComplete?.({ inquiryId: config.inquiryId, status: "completed" })}
                >
                    ✓ I Have Completed Verification
                </button>
                {onCancel && (
                    <button type="button" className="secondary-btn" onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
        </section>
    );
}

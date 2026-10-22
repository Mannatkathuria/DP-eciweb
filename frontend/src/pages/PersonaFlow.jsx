import { useEffect, useState } from "react";
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
            : reject(new Error("Persona SDK loaded without its Client API."));
        script.onerror = () => reject(new Error("Could not load Persona's embedded verification flow."));
        document.head.appendChild(script);
    });
    return window.__personaSdkPromise;
}

export default function PersonaFlow({ config, onComplete }) {
    const { t } = useTranslation();
    const [error, setError] = useState("");
    const [notice, setNotice] = useState(t("persona.loading"));

    useEffect(() => {
        if (!config?.inquiryId || !config?.environmentId) return undefined;
        let disposed = false;
        let client;

        loadPersonaSdk().then(() => {
            if (disposed) return;
            client = new window.Persona.Client({
                inquiryId: config.inquiryId,
                environmentId: config.environmentId,
                ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
                onReady: () => {
                    setNotice("");
                    client?.open();
                },
                onComplete: async (result) => {
                    setNotice(t("persona.completed"));
                    await onComplete?.(result);
                },
                onCancel: () => setNotice(t("persona.cancelled")),
                onError: (personaError) => {
                    console.error("Persona embedded flow error:", personaError);
                    setError(t("persona.flowError"));
                }
            });
        }).catch(() => {
            if (!disposed) setError(t("persona.startError"));
        });

        return () => {
            disposed = true;
            try { client?.destroy(); } catch {}
        };
    }, [config?.inquiryId, config?.environmentId, config?.sessionToken, onComplete, t]);

    return (
        <section className="persona-flow-card" aria-live="polite">
            <h2>{t("persona.title")}</h2>
            <p>{t("persona.description")}</p>
            {notice && <p className="persona-flow-notice" role="status">{notice}</p>}
            {error && <p className="persona-flow-error" role="alert">{error}</p>}
            {error && <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>{t("persona.retry")}</button>}
        </section>
    );
}

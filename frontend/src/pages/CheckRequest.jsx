import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import SavedApplication from "./SavedApplication";


/** Voter Services → "Check your request": look up a Form 6 application by its reference ID. */
const TIMELINE_TEXT = {
    submitted: "Application submitted",
    field_verified: "Verified in the field by your Booth Level Officer",
    approved: "Approved by the Electoral Registration Officer and added to the roll",
    rejected: "Rejected by the Electoral Registration Officer",
    information_requested: "The Electoral Registration Officer asked you for more information",
    information_provided: "You sent the information requested",
    reverification_requested: "Sent back to your Booth Level Officer to verify again"
};

export default function CheckRequest() {
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const [referenceId, setReferenceId] = useState(params.get("ref") || "");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [checking, setChecking] = useState(false);
    const [reply, setReply] = useState({ dateOfBirth: "", response: "" });
    const [replyState, setReplyState] = useState({ busy: false, error: "", done: "" });

    const sendReply = async (e) => {
        e.preventDefault();
        setReplyState({ busy: true, error: "", done: "" });
        try {
            const { data } = await api.post(`/auth/register/${encodeURIComponent(referenceId.trim())}/information`, reply);
            setReplyState({ busy: false, error: "", done: data.message });
            setReply({ dateOfBirth: "", response: "" });
            const fresh = await api.get(`/auth/register/${encodeURIComponent(referenceId.trim())}`);
            setResult(fresh.data.data);
        } catch (err) {
            setReplyState({ busy: false, error: err.response?.data?.message || "Could not send your answer. Try again.", done: "" });
        }
    };

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
        <>
            <div className="container"><p className="crumb-line"><Link to="/home">Home</Link> / <Link to="/voters">Voters</Link> / <span>Track Form 6 Request</span></p></div>
            <main className="portal-page f6-page">
                <section className="portal-card portal-wide f6-card">
                    <p className="eyebrow">{t("service.voter.eyebrow")}</p>
                    <h1>{t("register.checkRequest")}</h1>
                    <p className="portal-muted f6-intro">Enter the reference ID shown after you submitted Form 6 to see where it is: field verification by your Booth Level Officer, then a decision by the Electoral Registration Officer.</p>

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
                    {replyState.done && <div className="portal-success" role="status">{replyState.done}</div>}
                    {result?.status === "information_required" && (
                        <div className="portal-notice" role="status">
                            <p>Status: <strong>MORE INFORMATION NEEDED</strong>. The Electoral Registration Officer asked: “{result.informationRequest?.note}”</p>
                            <form className="portal-form" onSubmit={sendReply}>
                                <label>Your date of birth (to confirm it's you)
                                    <input type="date" value={reply.dateOfBirth} onChange={(ev) => setReply({ ...reply, dateOfBirth: ev.target.value })} required />
                                </label>
                                <label>Your answer
                                    <textarea rows={3} maxLength={1000} value={reply.response} onChange={(ev) => setReply({ ...reply, response: ev.target.value })} required minLength={5} />
                                </label>
                                {replyState.error && <div className="portal-error" role="alert">{replyState.error}</div>}
                                <button disabled={replyState.busy}>{replyState.busy ? "Sending…" : "Send answer"}</button>
                            </form>
                        </div>
                    )}
                    {result?.status === "field_verified" && (
                        <div className="portal-notice" role="status">Status: <strong>FIELD VERIFIED</strong>. Your Booth Level Officer has verified your application. The Electoral Registration Officer will now decide.</div>
                    )}
                    {result?.status === "approved" && (
                        <div className="portal-success" role="status">{t("register.approvedEpic")} <strong>{result.epic}</strong>.{" "}
                            <Link to="/signin/voter">{t("common.signIn")}</Link></div>
                    )}
                    {result?.status === "rejected" && (
                        <div className="portal-error" role="status">Application was rejected by the Electoral Registration Officer. Note: {result.note || "Criteria not met."}</div>
                    )}
                    {result?.timeline?.length > 0 && (
                        <ol className="rows" aria-label="Application history">
                            {result.timeline.map((s) => (
                                <li key={`${s.step}-${s.at}`}><small>{new Date(s.at).toLocaleString()} · {TIMELINE_TEXT[s.step] || s.step}</small></li>
                            ))}
                        </ol>
                    )}
                    {result?.application && <SavedApplication application={result.application} />}

                    <p className="f6-hint"><Link to="/voters">← Back to forms and services</Link></p>
                </section>
            </main>
            </>
    );
}

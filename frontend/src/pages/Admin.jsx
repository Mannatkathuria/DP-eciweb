import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import { Link, Navigate } from "react-router-dom";
import "./Admin.css";

const fmt = (n, unit = "") => (n === null || n === undefined ? "—" : `${n}${unit}`);

function Admin() {
    const { logged, user, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();

    const [stats, setStats] = useState(null);
    const [items, setItems] = useState([]);
    const [filter, setFilter] = useState("review_required");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [registrations, setRegistrations] = useState([]);
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [s, v, r] = await Promise.all([
                api.get("/admin/stats"),
                api.get("/admin/verifications", {
                    params: { status: filter || undefined, limit: 50 }
                }),
                api.get("/admin/registrations", { params: { status: "pending" } })
            ]);
            setRegistrations(r.data.data.items);
            setStats(s.data.data);
            setItems(v.data.data.items);
        } catch (err) {
            setError(t("admin.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [filter, t]);

    useEffect(() => {
        if (logged) load();
    }, [logged, load]);

    const resolve = async (id, decision) => {
        const note = window.prompt(t("admin.optionalNote")) ?? "";
        try {
            await api.patch(`/admin/verifications/${id}/resolve`, { decision, note });
            load();
        } catch (err) {
            setError(t("admin.caseUpdateFailed"));
        }
    };

    const decideRegistration = async (id, decision) => {
        setError(""); setNotice("");
        let body = {};
        if (decision === "reject") {
            const note = window.prompt(t("admin.rejectPrompt"));
            if (note === null) return;
            body = { note };
        }
        try {
            const { data } = await api.post(`/admin/registrations/${id}/${decision}`, body);
            setNotice(decision === "approve"
                ? t("admin.approvedNotice", { epic: data.data.epic })
                : t("admin.rejectedNotice"));
            load();
        } catch (err) {
            setError(t("admin.requestUpdateFailed"));
        }
    };

    if (!logged) return <Navigate to="/login?role=blo" replace />;
    if (userData?.role !== "blo" && userData?.role !== "admin") {
        return <Navigate to={userData?.role === "eci" ? "/eci/dashboard" : "/dashboard"} replace />;
    }

    return (
        <main className="admin-page">
            <div className="admin-container">
                <header className="admin-header">
                    <div>
                        <p className="eyebrow">{t("admin.official")}</p>
                        <h1>{t("admin.title")}</h1>
                        <p>{t("admin.description")}</p>
                        <p>{t("common.signedInAs")} <strong>{user}</strong></p>
                    </div>
                    <div className="admin-actions">
                        <Link to="/" className="secondary-btn">{t("common.home")}</Link>
                        <button className="back-button" onClick={logout}>{t("common.signOut")}</button>
                    </div>
                </header>

                {error && <div className="verification-error" role="alert">{error}</div>}

                {notice && <div className="admin-notice" role="status">{notice}</div>}

                <section className="admin-card">
                    <div className="admin-toolbar">
                        <h2>{t("admin.registrationRequests")} ({registrations.length} {t("admin.pending")})</h2>
                    </div>
                    {registrations.length === 0 && <p>{t("admin.noRequests")}</p>}
                    {registrations.length > 0 && (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>{t("admin.submitted")}</th><th>{t("admin.applicant")}</th><th>{t("register.dateOfBirth")}</th>
                                        <th>{t("admin.constituencyPart")}</th><th>{t("register.pollingStation")}</th><th>{t("admin.action")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registrations.map((r) => (
                                        <tr key={r._id}>
                                            <td>{new Date(r.submittedAt).toLocaleString()}</td>
                                            <td>{r.name}<br /><small>{r.gender ? t(`register.${r.gender.toLowerCase()}`, { defaultValue: r.gender }) : "—"}</small></td>
                                            <td>{new Date(r.dateOfBirth).toLocaleDateString()}</td>
                                            <td>{r.assemblyConstituency}, {r.district}, {r.state}<br /><small>{t("register.partNumber")} {r.partNumber}</small></td>
                                            <td>{r.pollingStation}</td>
                                            <td>
                                                <div className="row-actions">
                                                    <button onClick={() => decideRegistration(r._id, "approve")}>{t("admin.approve")}</button>
                                                    <button onClick={() => decideRegistration(r._id, "reject")}>{t("admin.reject")}</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {stats && (
                    <section className="stat-grid">
                        <div className="stat"><span>{t("admin.total")}</span><strong>{stats.total}</strong></div>
                        <div className="stat"><span>{t("verification.verified")}</span><strong>{stats.verified}</strong></div>
                        <div className="stat"><span>{t("admin.bloReview")}</span><strong>{stats.reviewRequired}</strong></div>
                        <div className="stat"><span>{t("admin.successRate")}</span><strong>{fmt(stats.verificationSuccessRate, "%")}</strong></div>
                        <div className="stat"><span>{t("admin.manualInterventions")}</span><strong>{fmt(stats.manualInterventionsPer100)}</strong></div>
                        <div className="stat"><span>{t("admin.meanTime")}</span><strong>{fmt(stats.processingSeconds.mean, " s")}</strong></div>
                        <div className="stat"><span>{t("admin.medianTime")}</span><strong>{fmt(stats.processingSeconds.median, " s")}</strong></div>
                        <div className="stat"><span>{t("admin.percentile")}</span><strong>{fmt(stats.processingSeconds.p95, " s")}</strong></div>
                    </section>
                )}

                <section className="admin-card">
                    <div className="admin-toolbar">
                        <h2>{t("admin.cases")}</h2>
                        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                            <option value="review_required">{t("verification.needsReview")}</option>
                            <option value="verified">{t("verification.verified")}</option>
                            <option value="in_progress">{t("verification.inProgress")}</option>
                            <option value="">{t("admin.all")}</option>
                        </select>
                    </div>

                    {loading && <p>{t("common.loading")}</p>}
                    {!loading && items.length === 0 && <p>{t("admin.noCases")}</p>}

                    <div className="table-wrap">
                        {items.length > 0 && (
                            <table>
                                <thead>
                                    <tr>
                                        <th>{t("admin.when")}</th><th>{t("admin.elector")}</th><th>{t("login.epicLabel")}</th>
                                        <th>{t("admin.identity")}</th><th>{t("common.status")}</th><th>{t("admin.reasons")}</th><th>{t("admin.action")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((v) => (
                                        <tr key={v._id}>
                                            <td>{new Date(v.createdAt).toLocaleString()}</td>
                                            <td>{v.elector?.name || "—"}<br /><small>{v.elector?.pollingStation}</small></td>
                                            <td>{v.epic}</td>
                                            <td>{t(`admin.methods.${v.identity?.method}`, { defaultValue: v.identity?.method || "—" })} · {t(`admin.status.${v.identity?.status}`, { defaultValue: v.identity?.status?.replace(/_/g, " ") || "—" })}</td>
                                            <td>{t(`admin.status.${v.status}`, { defaultValue: v.status.replace(/_/g, " ") })}</td>
                                            <td>
                                                {(v.reasons || []).map((r) => <div key={r}>{t(`admin.reason.${r}`, { defaultValue: r })}</div>)}
                                            </td>
                                            <td>
                                                {v.status === "review_required" && !v.resolution?.decision ? (
                                                    <div className="row-actions">
                                                        <button onClick={() => resolve(v._id, "cleared")}>{t("admin.clear")}</button>
                                                        <button onClick={() => resolve(v._id, "escalated")}>{t("admin.escalate")}</button>
                                                    </div>
                                                ) : v.resolution?.decision ? (
                                                    <span>{t(`admin.decision.${v.resolution.decision}`, { defaultValue: v.resolution.decision })} {t("admin.by")} {v.resolution.byEpic || v.resolution.by}</span>
                                                ) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}

export default Admin;

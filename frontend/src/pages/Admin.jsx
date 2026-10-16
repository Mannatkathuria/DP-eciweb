import { useCallback, useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import { Link, Navigate } from "react-router-dom";
import "./Admin.css";

const fmt = (n, unit = "") => (n === null || n === undefined ? "—" : `${n}${unit}`);

function Admin() {
    const { logged, user, userData, logout } = useContext(AuthContext);

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
            setError(err.response?.data?.message || "Unable to load data.");
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        if (logged) load();
    }, [logged, load]);

    const resolve = async (id, decision) => {
        const note = window.prompt("Optional note for the record:") ?? "";
        try {
            await api.patch(`/admin/verifications/${id}/resolve`, { decision, note });
            load();
        } catch (err) {
            setError(err.response?.data?.message || "Could not update the case.");
        }
    };

    const decideRegistration = async (id, decision) => {
        setError(""); setNotice("");
        let body = {};
        if (decision === "reject") {
            const note = window.prompt("Reason for rejection (shown to the applicant):");
            if (note === null) return;
            body = { note };
        }
        try {
            const { data } = await api.post(`/admin/registrations/${id}/${decision}`, body);
            setNotice(decision === "approve"
                ? `Approved. The voter's EPIC number is ${data.data.epic}. They can now sign in.`
                : "Request rejected.");
            load();
        } catch (err) {
            setError(err.response?.data?.message || "Could not update the request.");
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
                        <p className="eyebrow">ELECTION OFFICIAL</p>
                        <h1>BLO dashboard</h1>
                        <p>Registration requests and voter verification cases</p>
                        <p>Signed in as <strong>{user}</strong></p>
                    </div>
                    <div className="admin-actions">
                        <Link to="/" className="secondary-btn">Home</Link>
                        <button className="back-button" onClick={logout}>Sign out</button>
                    </div>
                </header>

                {error && <div className="verification-error" role="alert">{error}</div>}

                {notice && <div className="admin-notice" role="status">{notice}</div>}

                <section className="admin-card">
                    <div className="admin-toolbar">
                        <h2>Voter registration requests ({registrations.length} pending)</h2>
                    </div>
                    {registrations.length === 0 && <p>No pending requests.</p>}
                    {registrations.length > 0 && (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Submitted</th><th>Applicant</th><th>Date of birth</th>
                                        <th>Constituency / Part</th><th>Polling station</th><th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registrations.map((r) => (
                                        <tr key={r._id}>
                                            <td>{new Date(r.submittedAt).toLocaleString()}</td>
                                            <td>{r.name}<br /><small>{r.gender}</small></td>
                                            <td>{new Date(r.dateOfBirth).toLocaleDateString()}</td>
                                            <td>{r.assemblyConstituency}, {r.district}, {r.state}<br /><small>Part {r.partNumber}</small></td>
                                            <td>{r.pollingStation}</td>
                                            <td>
                                                <div className="row-actions">
                                                    <button onClick={() => decideRegistration(r._id, "approve")}>Approve</button>
                                                    <button onClick={() => decideRegistration(r._id, "reject")}>Reject</button>
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
                        <div className="stat"><span>Total</span><strong>{stats.total}</strong></div>
                        <div className="stat"><span>Verified</span><strong>{stats.verified}</strong></div>
                        <div className="stat"><span>BLO review</span><strong>{stats.reviewRequired}</strong></div>
                        <div className="stat"><span>Success rate</span><strong>{fmt(stats.verificationSuccessRate, "%")}</strong></div>
                        <div className="stat"><span>Manual interventions / 100</span><strong>{fmt(stats.manualInterventionsPer100)}</strong></div>
                        <div className="stat"><span>Mean time</span><strong>{fmt(stats.processingSeconds.mean, " s")}</strong></div>
                        <div className="stat"><span>Median time</span><strong>{fmt(stats.processingSeconds.median, " s")}</strong></div>
                        <div className="stat"><span>95th percentile</span><strong>{fmt(stats.processingSeconds.p95, " s")}</strong></div>
                    </section>
                )}

                <section className="admin-card">
                    <div className="admin-toolbar">
                        <h2>Cases</h2>
                        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                            <option value="review_required">Needs review</option>
                            <option value="verified">Verified</option>
                            <option value="in_progress">In progress</option>
                            <option value="">All</option>
                        </select>
                    </div>

                    {loading && <p>Loading…</p>}
                    {!loading && items.length === 0 && <p>No cases found.</p>}

                    <div className="table-wrap">
                        {items.length > 0 && (
                            <table>
                                <thead>
                                    <tr>
                                        <th>When</th><th>Elector</th><th>EPIC</th>
                                        <th>Identity</th><th>Status</th><th>Reasons</th><th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((v) => (
                                        <tr key={v._id}>
                                            <td>{new Date(v.createdAt).toLocaleString()}</td>
                                            <td>{v.elector?.name || "—"}<br /><small>{v.elector?.pollingStation}</small></td>
                                            <td>{v.epic}</td>
                                            <td>{v.identity?.method} · {v.identity?.status?.replace(/_/g, " ")}</td>
                                            <td>{v.status.replace(/_/g, " ")}</td>
                                            <td>
                                                {(v.reasons || []).map((r) => <div key={r}>{r}</div>)}
                                            </td>
                                            <td>
                                                {v.status === "review_required" && !v.resolution?.decision ? (
                                                    <div className="row-actions">
                                                        <button onClick={() => resolve(v._id, "cleared")}>Clear</button>
                                                        <button onClick={() => resolve(v._id, "escalated")}>Escalate</button>
                                                    </div>
                                                ) : v.resolution?.decision ? (
                                                    <span>{v.resolution.decision} by {v.resolution.byEpic || v.resolution.by}</span>
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

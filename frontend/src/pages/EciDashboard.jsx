import { useContext, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import "./Dashboard.css";
import "./Admin.css";

function EciDashboard() {
    const { logged, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [bloList, setBloList] = useState([]);
    const [loadingBlo, setLoadingBlo] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    // Form for assigning BLO role
    const [assignForm, setAssignForm] = useState({
        epic: "",
        state: "UP",
        mobile: ""
    });
    const [assigning, setAssigning] = useState(false);
    const [newBloCredentials, setNewBloCredentials] = useState(null);

    // Voter search for quick promotion / verification
    const [voterQuery, setVoterQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    const loadBlos = useCallback(async () => {
        setLoadingBlo(true);
        try {
            const { data } = await api.get("/eci/blo-list");
            setBloList(data.data?.items || []);
        } catch (err) {
            console.error("Failed to load BLOs:", err);
        } finally {
            setLoadingBlo(false);
        }
    }, []);

    useEffect(() => {
        if (logged && userData?.role === "eci") {
            loadBlos();
        }
    }, [logged, userData?.role, loadBlos]);

    const handleSearchVoters = async (e) => {
        e?.preventDefault();
        if (!voterQuery.trim()) return;
        setSearching(true);
        try {
            const { data } = await api.get("/eci/voters", { params: { q: voterQuery.trim() } });
            setSearchResults(data.data?.items || []);
        } catch (err) {
            console.error("Voter search error:", err);
        } finally {
            setSearching(false);
        }
    };

    const handleAssignBlo = async (e) => {
        e.preventDefault();
        setError("");
        setNotice("");
        setNewBloCredentials(null);

        const epic = assignForm.epic.trim().toUpperCase();
        if (!/^[A-Z]{3}\d{7}$/.test(epic)) {
            setError("Enter a valid 10-character EPIC (e.g. ABC1234567).");
            return;
        }

        setAssigning(true);
        try {
            const { data } = await api.post("/eci/blo/assign", {
                epic,
                state: assignForm.state,
                mobile: assignForm.mobile
            });

            setNotice(data.message || "BLO role assigned successfully.");
            setNewBloCredentials(data.data);
            setAssignForm({ epic: "", state: "UP", mobile: "" });
            loadBlos();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to assign BLO role.");
        } finally {
            setAssigning(false);
        }
    };

    const handleRemoveBlo = async (identifier) => {
        if (!window.confirm(`Are you sure you want to revoke BLO role for ${identifier}? They will be reverted to a normal voter.`)) {
            return;
        }
        setError("");
        setNotice("");
        try {
            const { data } = await api.post("/eci/blo/remove", { epic: identifier });
            setNotice(data.message || "BLO role revoked.");
            loadBlos();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to remove BLO role.");
        }
    };

    if (!logged) return <Navigate to="/eci/login" replace />;
    if (userData?.role !== "eci") return <Navigate to={userData?.role === "voter" ? "/dashboard" : "/admin"} replace />;

    return (
        <main className="dashboard" style={{ padding: "40px 6%" }}>
            <header className="voter-dashboard-header">
                <div>
                    <p className="eyebrow">Election Commission of India · Official Control Portal</p>
                    <p>{t("common.signedInAs") || "Signed in as"} <strong>{userData?.name || userData?.epic}</strong> (ECI Officer)</p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <Link to="/eci/voting-verification" className="primary-btn">
                        🗳 On-Day Voting Verification
                    </Link>
                    <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>
                        {t("common.signOut") || "Sign Out"}
                    </button>
                </div>
            </header>

            <section className="hero" style={{ padding: "25px 10px 40px" }}>
                <p className="eyebrow">National Electoral Management System</p>
                <h1>ECI Central Administration</h1>
                <p className="hero-description">
                    Manage Booth Level Officer (BLO) appointments across parliamentary and assembly constituencies, perform on-day polling station voting verification, and oversee the electoral roll.
                </p>
            </section>

            {error && <div className="verification-error" role="alert" style={{ maxWidth: "1100px", margin: "0 auto 20px" }}>{error}</div>}
            {notice && <div className="admin-notice" role="status" style={{ maxWidth: "1100px", margin: "0 auto 20px" }}>{notice}</div>}

            {/* Generated BLO Credentials Banner */}
            {newBloCredentials && (
                <div className="admin-notice" style={{ maxWidth: "1100px", margin: "0 auto 24px", background: "#e8f5e9", borderLeft: "4px solid #56a581" }}>
                    <h3 style={{ margin: "0 0 6px", color: "#2e7d32" }}>✓ BLO Account Successfully Created / Promoted</h3>
                    <p style={{ margin: "4px 0" }}><strong>BLO ID:</strong> <code>{newBloCredentials.bloId}</code></p>
                    <p style={{ margin: "4px 0" }}><strong>Temporary Password:</strong> <code>{newBloCredentials.temporaryPassword}</code></p>
                    <p style={{ margin: "4px 0" }}><strong>Linked Voter EPIC:</strong> {newBloCredentials.epic} ({newBloCredentials.name})</p>
                    <small style={{ color: "var(--text-secondary)" }}>
                        Share these credentials with the officer. They can now sign in at the <strong>/blo/login</strong> portal.
                    </small>
                </div>
            )}

            {/* BLO Management Section */}
            <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
                {/* Form: Add / Assign BLO */}
                <section className="admin-card">
                    <h2>Assign BLO Role</h2>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                        Promote any registered voter EPIC to a Booth Level Officer (BLO).
                    </p>

                    <form onSubmit={handleAssignBlo} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>
                                Voter EPIC Number *
                            </label>
                            <input
                                type="text"
                                value={assignForm.epic}
                                onChange={e => setAssignForm({ ...assignForm, epic: e.target.value.toUpperCase() })}
                                placeholder="e.g. DEF7654321"
                                maxLength={10}
                                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>
                                State / UT Jurisdiction *
                            </label>
                            <select
                                value={assignForm.state}
                                onChange={e => setAssignForm({ ...assignForm, state: e.target.value })}
                                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                            >
                                <option value="PB">Punjab (PB)</option>
                                <option value="UP">Uttar Pradesh (UP)</option>
                                <option value="DL">Delhi (DL)</option>
                                <option value="HR">Haryana (HR)</option>
                                <option value="MH">Maharashtra (MH)</option>
                                <option value="KA">Karnataka (KA)</option>
                                <option value="TN">Tamil Nadu (TN)</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "13px", fontWeight: "700", marginBottom: "4px" }}>
                                Officer Mobile Number
                            </label>
                            <input
                                type="tel"
                                value={assignForm.mobile}
                                onChange={e => setAssignForm({ ...assignForm, mobile: e.target.value })}
                                placeholder="10-digit mobile (e.g. 9876543210)"
                                maxLength={10}
                                style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                            />
                        </div>

                        <button type="submit" className="primary-btn" disabled={assigning} style={{ marginTop: "8px" }}>
                            {assigning ? "Assigning Role…" : "Promote to BLO"}
                        </button>
                    </form>
                </section>

                {/* Table: Active BLOs */}
                <section className="admin-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <div>
                            <h2 style={{ margin: 0 }}>Active Booth Level Officers ({bloList.length})</h2>
                            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                                Officers authorised to review voter registrations, Form 8 corrections, and verification cases.
                            </p>
                        </div>
                        <button className="tab-btn" onClick={loadBlos} disabled={loadingBlo}>
                            🔄 Refresh
                        </button>
                    </div>

                    {loadingBlo && <p>Loading BLO list…</p>}
                    {!loadingBlo && bloList.length === 0 && (
                        <p style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)" }}>
                            No BLO officers found. Use the form on the left to assign BLO role to a voter.
                        </p>
                    )}

                    {!loadingBlo && bloList.length > 0 && (
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>BLO ID</th>
                                        <th>Officer Name</th>
                                        <th>Linked EPIC</th>
                                        <th>Jurisdiction</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bloList.map(b => (
                                        <tr key={b._id}>
                                            <td><code>{b.bloId}</code></td>
                                            <td>
                                                <strong>{b.name}</strong>
                                                <br />
                                                <small style={{ color: "var(--text-secondary)" }}>📱 {b.mobile}</small>
                                            </td>
                                            <td>{b.epic}</td>
                                            <td>{b.state} ({b.assignedStation})</td>
                                            <td>
                                                <button
                                                    className="row-actions btn-reject"
                                                    style={{ padding: "5px 10px", fontSize: "12px" }}
                                                    onClick={() => handleRemoveBlo(b.epic || b.bloId)}
                                                >
                                                    Revoke BLO Role
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            {/* Voter Search Section */}
            <section className="admin-card" style={{ maxWidth: "1100px", margin: "24px auto 0" }}>
                <h2>Search Electoral Roll & Check Voting Status</h2>
                <form onSubmit={handleSearchVoters} style={{ display: "flex", gap: "12px", margin: "14px 0" }}>
                    <input
                        type="text"
                        value={voterQuery}
                        onChange={e => setVoterQuery(e.target.value)}
                        placeholder="Search by EPIC number or voter name…"
                        style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid #ccc" }}
                    />
                    <button type="submit" className="primary-btn" disabled={searching}>
                        {searching ? "Searching…" : "Search"}
                    </button>
                </form>

                {searchResults.length > 0 && (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>EPIC</th>
                                    <th>Name</th>
                                    <th>Constituency</th>
                                    <th>Role</th>
                                    <th>Election Day Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {searchResults.map(v => (
                                    <tr key={v.epic}>
                                        <td><code>{v.epic}</code></td>
                                        <td><strong>{v.name}</strong></td>
                                        <td>{v.assemblyConstituency}, {v.district}</td>
                                        <td>
                                            <span className={`badge ${v.role === "blo" ? "badge-review" : "badge-verified"}`}>
                                                {v.role.toUpperCase()}
                                            </span>
                                        </td>
                                        <td>
                                            {v.hasVoted ? (
                                                <span style={{ color: "#2e7d32", fontWeight: "700", fontSize: "12px" }}>
                                                    ✓ Voted ({new Date(v.votedAt).toLocaleTimeString()})
                                                </span>
                                            ) : (
                                                <span style={{ color: "var(--accent)", fontSize: "12px" }}>
                                                    Eligible to Vote
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {v.role !== "blo" ? (
                                                <button
                                                    className="tab-btn"
                                                    style={{ padding: "4px 8px", fontSize: "11px" }}
                                                    onClick={() => setAssignForm(prev => ({ ...prev, epic: v.epic }))}
                                                >
                                                    Select for BLO
                                                </button>
                                            ) : (
                                                <button
                                                    className="tab-btn"
                                                    style={{ padding: "4px 8px", fontSize: "11px", color: "#c62828" }}
                                                    onClick={() => handleRemoveBlo(v.epic)}
                                                >
                                                    Revoke BLO
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}

export default EciDashboard;

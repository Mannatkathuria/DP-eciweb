import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";

// ERO/AERO: new-voter tasks in the constituency (with routing of unassigned ones) and published
// electoral-roll versions. Every action is checked again on the server.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const STAGE = {
    open: "Open", form6_submitted: "Form 6 filed", declined: "Declined", not_found: "Not found", ineligible: "Not eligible",
    application_pending: "Form 6 with the BLO", application_field_verified: "Form 6 awaiting your decision",
    registered: "Registered", application_rejected: "Form 6 rejected"
};

export function EroTasks({ canAssign }) {
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const [assignTo, setAssignTo] = useState({});
    const [rowErrors, setRowErrors] = useState({});

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/registration-tasks", { params: { status: "all" } });
            setItems(data.data?.items || []);
        } catch (err) { setError(apiMessage(err, "Could not load registration tasks.")); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const assign = async (t) => {
        setRowErrors((e) => ({ ...e, [t._id]: "" }));
        try {
            await api.post(`/registration-tasks/${t._id}/assign`, { epic: (assignTo[t._id] || "").trim() });
            await load();
        } catch (err) { setRowErrors((e) => ({ ...e, [t._id]: apiMessage(err, "Could not assign.") })); }
    };

    const open = items.filter((t) => t.status === "open").length;
    const registered = items.filter((t) => t.stage === "registered").length;

    return (
        <div className="panel">
            <h2>New voter registration tasks</h2>
            <p className="muted">People in your constituency who have reached, or will soon reach, a qualifying date, from approved data sources. {open} open · {registered} registered · {items.length} in total.</p>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {items.length > 0 && (
                <div className="table-wrap">
                    <table>
                        <thead><tr><th>Person</th><th>Qualifying date</th><th>BLO</th><th>Stage</th></tr></thead>
                        <tbody>
                            {items.map((t) => (
                                <tr key={t._id}>
                                    <td><strong>{t.person.name}</strong><br /><small>{t.caseId}</small></td>
                                    <td>{t.eligibility.qualifyingDate}<br /><small>{t.eligibility.status === "ADVANCE" ? "Advance application" : "Eligible now"}</small></td>
                                    <td>
                                        {t.assignedTo ? t.assignedTo.epic : (canAssign && t.status === "open" ? (
                                            <div className="booth-assignment">
                                                <label>Assign to BLO ID
                                                    <input value={assignTo[t._id] || ""} onChange={(e) => setAssignTo((a) => ({ ...a, [t._id]: e.target.value }))} placeholder="BLO1000001" />
                                                </label>
                                                <button className="btn-approve" onClick={() => assign(t)}>Assign</button>
                                            </div>
                                        ) : <em>Unassigned</em>)}
                                        {rowErrors[t._id] && <p className="row-error" role="alert">{rowErrors[t._id]}</p>}
                                    </td>
                                    <td>{STAGE[t.stage] || t.stage}{t.application?.epic && <><br /><small>EPIC {t.application.epic}</small></>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export function RollVersions({ areas, canPublish }) {
    const [versions, setVersions] = useState({});
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [opened, setOpened] = useState(null); // one version opened for inspection
    const keyOf = (a) => `${a.state}|${a.constituency}`;

    const load = useCallback(async () => {
        try {
            const entries = await Promise.all(areas.map(async (a) => [keyOf(a), (await api.get("/roll-versions", { params: a })).data.data?.items || []]));
            setVersions(Object.fromEntries(entries));
        } catch (err) { setError(apiMessage(err, "Could not load roll versions.")); }
    }, [areas]);
    useEffect(() => { if (areas.length) load(); }, [areas, load]);

    const publish = async (a) => {
        setBusy(true); setError(""); setNotice("");
        try {
            const { data } = await api.post("/roll-versions", a);
            setNotice(data.message);
            await load();
        } catch (err) { setError(apiMessage(err, "Could not publish.")); }
        finally { setBusy(false); }
    };

    const openVersion = async (id) => {
        if (opened?._id === id) { setOpened(null); return; }
        setError("");
        try { setOpened((await api.get(`/roll-versions/${id}`)).data.data); } catch (err) { setError(err?.response?.data?.message || "The version could not be opened."); }
    };
    if (!areas.length) return null;
    return (
        <div className="panel">
            <h2>Published electoral roll versions</h2>
            <p className="muted">Each version is a fixed snapshot of the constituency's roll with a content hash. Later corrections appear in the next version and never change a published one.</p>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-ok" role="status">{notice}</div>}
            {areas.map((a) => (
                <div key={keyOf(a)} style={{ marginTop: 12 }}>
                    <h3>{a.constituency}, {a.state}</h3>
                    {canPublish && <button className="btn-approve" onClick={() => publish(a)} disabled={busy}>{busy ? "Publishing…" : "Publish current roll as new version"}</button>}
                    <ul className="rows">
                        {(versions[keyOf(a)] || []).map((v) => (
                            <li key={v._id}><small>
                                Version {v.version} · {new Date(v.publishedAt).toLocaleString()} · {v.entryCount} electors ·
                                {" "}+{v.changes.added} / −{v.changes.removed} / {v.changes.modified} changed · by {v.publishedBy} · hash {v.hash.slice(0, 12)}…
                            </small>{" "}<button className="btn btn-quiet btn-small" onClick={() => openVersion(v._id)}>{opened?._id === v._id ? "Hide" : "Open and verify"}</button>
                            {opened?._id === v._id && (
                                <div style={{ marginTop: 6 }}>
                                    <p className={`alert ${opened.integrity === "verified" ? "alert-ok" : "alert-error"}`} role="status">Content hash {opened.integrity === "verified" ? "verified: this snapshot is unchanged since it was published" : "DOES NOT MATCH: the snapshot was altered"}.</p>
                                    <div className="table-wrap"><table><thead><tr><th>Part</th><th>EPIC</th><th>Name</th><th>Gender</th><th>Age</th><th>Status</th></tr></thead>
                                        <tbody>{opened.entries.slice(0, 200).map((e) => <tr key={e.epic}><td>{e.partNumber ?? "–"}</td><td>{e.epic}</td><td>{e.name}</td><td>{e.gender}</td><td>{e.age}</td><td>{e.isActive === false ? "Deleted" : "On roll"}</td></tr>)}</tbody></table></div>
                                    {opened.entries.length > 200 && <small className="muted">First 200 of {opened.entries.length} entries.</small>}
                                </div>
                            )}</li>
                        ))}
                        {(versions[keyOf(a)] || []).length === 0 && <li><small>No version published yet.</small></li>}
                    </ul>
                </div>
            ))}
        </div>
    );
}

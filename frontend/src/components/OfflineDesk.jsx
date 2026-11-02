import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { apiMessage } from "../config/elections";
import { db } from "../offline/db";
import { PackageError, openPackage, verifyPackage } from "../offline/crypto";
import { outboxItems, queueMark, refreshCounts, syncOutbox } from "../offline/outbox";
import ReasonDialog from "../pages/ReasonDialog";

// Offline poll day on a registered device: download the station package (checked and stored
// encrypted), mark electors from it while the connection is down, and send the outbox when it
// returns. The server re-checks every record; clashes go to the presiding officer.

const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const STATUS = { pending: ["Waiting to send", "badge-progress"], accepted: ["Recorded", "badge-ok"], conflict: ["Conflict: presiding officer decides", "badge-bad"], rejected: ["Not recorded", "badge-bad"] };
const DECISIONS = { duplicate_confirmed: "Same voter recorded twice: first record stands", tendered_vote: "Someone else voted in this name: tendered vote", referred: "Refer to the Returning Officer" };

export default function OfflineDesk({ station, device, role }) {
    const [pkg, setPkg] = useState(null);          // { manifest, body }
    const [voted, setVoted] = useState(new Set());
    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState({ pending: 0 });
    const [online, setOnline] = useState(navigator.onLine);
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState(null);
    const [doc, setDoc] = useState("epic");
    const [checks, setChecks] = useState({ photoMatches: false, inkApplied: false });
    const [msg, setMsg] = useState({ error: "", notice: "" });
    const [busy, setBusy] = useState(false);
    const [conflicts, setConflicts] = useState([]);
    const [deciding, setDeciding] = useState(null); // { conflict, decision }
    const headers = useMemo(() => ({ "X-Device-Id": device.id, "X-Device-Token": device.secret }), [device]);

    const refresh = useCallback(async () => {
        setItems(await outboxItems(station._id));
        setCounts(await refreshCounts(station._id, { packageVersion: pkg?.manifest.version ?? null }));
    }, [station._id, pkg]);

    // Open the stored package (if any) on load.
    useEffect(() => {
        (async () => {
            const stored = await db.packages.get(station._id);
            if (!stored || stored.manifest.deviceId !== device.id) return;
            try {
                const body = await openPackage(stored, device.secret);
                const local = (await outboxItems(station._id)).filter((i) => i.status !== "rejected").map((i) => i.record.epic);
                setPkg({ manifest: stored.manifest, body }); setVoted(new Set([...body.voted, ...local]));
            } catch { setMsg({ error: "The saved station package could not be opened on this device. Download it again.", notice: "" }); }
        })();
        refresh();
    }, [station._id, device]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadConflicts = useCallback(async () => {
        if (role !== "presiding_officer" || !navigator.onLine) return;
        try { setConflicts((await api.get("/poll-day/sync-conflicts", { params: { stationId: station._id } })).data.data.items); } catch { /* offline */ }
    }, [role, station._id]);

    const sync = useCallback(async (quiet = false) => {
        try {
            const r = await syncOutbox(station._id, headers, pkg?.manifest.version);
            if (r.voted) setVoted((v) => new Set([...v, ...r.voted]));
            if (!quiet && r.sent) setMsg({ error: "", notice: `${r.sent} record(s) answered by the server.` });
            await loadConflicts();
        } catch (err) { if (!quiet) setMsg({ error: apiMessage(err, "Could not reach the server. The records stay on this device."), notice: "" }); }
        await refresh();
    }, [station._id, headers, pkg, refresh, loadConflicts]);

    useEffect(() => {
        const up = () => { setOnline(true); sync(true); };
        const down = () => setOnline(false);
        const fromWorker = (e) => { if (e.data?.type === "sync-outbox") sync(true); };
        window.addEventListener("online", up); window.addEventListener("offline", down);
        navigator.serviceWorker?.addEventListener("message", fromWorker);
        const t = setInterval(() => navigator.onLine && sync(true), 30000);
        loadConflicts();
        return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); navigator.serviceWorker?.removeEventListener("message", fromWorker); clearInterval(t); };
    }, [sync, loadConflicts]);

    const download = async () => {
        setBusy(true); setMsg({ error: "", notice: "" });
        try {
            const [{ data: k }, { data: p }] = await Promise.all([api.get("/poll-day/package/public-key", { params: { stationId: station._id } }), api.get("/poll-day/package", { headers })]);
            const sealed = p.data;
            await verifyPackage(sealed, k.data, { stationId: station._id, deviceId: device.id });
            const body = await openPackage(sealed, device.secret);
            await db.packages.put({ stationId: station._id, ...sealed, savedAt: new Date().toISOString() });
            const local = (await outboxItems(station._id)).filter((i) => i.status === "pending").map((i) => i.record.epic);
            setPkg({ manifest: sealed.manifest, body }); setVoted(new Set([...body.voted, ...local]));
            setMsg({ error: "", notice: `Station package saved: ${body.electors.length} electors, signature checked.` });
        } catch (err) {
            setMsg({ error: err instanceof PackageError ? err.message : apiMessage(err, "Could not download the station package."), notice: "" });
        } finally { setBusy(false); await refresh(); }
    };

    const matches = useMemo(() => {
        if (!pkg || !q.trim()) return [];
        const t = norm(q);
        return pkg.body.electors.filter((e) => String(e.serial) === t || norm(e.epic) === t || norm(e.name).includes(t) || norm(e.relativeName).includes(t) || norm(e.houseNumber) === t).slice(0, 20);
    }, [pkg, q]);

    const mark = async () => {
        if (!picked) return;
        setBusy(true);
        try {
            await queueMark(station._id, { epic: picked.epic, idDocument: doc, checks });
            setVoted((v) => new Set([...v, picked.epic]));
            setMsg({ error: "", notice: `${picked.name} (serial ${picked.serial}) saved on this device${navigator.onLine ? "; sending now" : "; it will be sent when the connection returns"}.` });
            setPicked(null); setQ(""); setChecks({ photoMatches: false, inkApplied: false });
            navigator.serviceWorker?.ready.then((r) => r.sync?.register("eciweb-outbox")).catch(() => {});
            if (navigator.onLine) await sync(true);
        } finally { setBusy(false); await refresh(); }
    };

    const resolve = async (note) => {
        const { conflict: c, decision } = deciding;
        setBusy(true);
        try { await api.post(`/poll-day/sync-conflicts/${c._id}/resolve`, { decision, note, stationId: station._id }); await loadConflicts(); setDeciding(null); setMsg({ error: "", notice: "Decision recorded." }); }
        catch (err) { setMsg({ error: apiMessage(err, "Could not record the decision."), notice: "" }); }
        finally { setBusy(false); }
    };

    const expired = pkg && Date.parse(pkg.manifest.expiresAt) < Date.now();
    return (
        <div className="stack" style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>Offline working</h3>
            <p style={{ margin: 0 }}>
                Connection: <span className={`badge ${online ? "badge-ok" : "badge-bad"}`}>{online ? "online" : "offline"}</span>{" "}
                Station package: {pkg ? <><strong>version {pkg.manifest.version}</strong>, {pkg.body.electors.length} electors, issued {new Date(pkg.manifest.issuedAt).toLocaleString()}{expired && <> <span className="badge badge-bad">expired</span></>}</> : <em>not downloaded</em>}
                {" "}· Waiting to send: <strong>{counts.pending ?? 0}</strong>{counts.conflict ? <> · <span className="badge badge-bad">{counts.conflict} conflict(s)</span></> : null}{counts.rejected ? <> · <span className="badge badge-warn">{counts.rejected} not recorded</span></> : null}
            </p>
            <div>
                <button className="btn btn-quiet btn-small" disabled={busy || !online} onClick={download}>{pkg ? "Update station package" : "Download station package"}</button>{" "}
                <button className="btn btn-quiet btn-small" disabled={busy || !online || !counts.pending} onClick={() => sync(false)}>Send now</button>
            </div>
            {msg.error && <div className="alert alert-error" role="alert">{msg.error}</div>}
            {msg.notice && <div className="alert alert-ok" role="status">{msg.notice}</div>}

            {pkg && !expired && ["presiding_officer", "polling_officer"].includes(role) && (
                <details open={!online}>
                    <summary><strong>Mark from the station package</strong> (use when the connection is down)</summary>
                    <div className="field" style={{ marginTop: 8 }}><label htmlFor="off-q">Name, serial, EPIC, relative or house number</label>
                        <input id="off-q" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} autoComplete="off" /></div>
                    <ul className="rows">{matches.map((e) => (
                        <li key={e.epic}>
                            <strong>{e.serial}. {e.name}</strong> <small>{e.relationType ? `${e.relationType} ` : ""}{e.relativeName ?? ""}{e.houseNumber ? `, house ${e.houseNumber}` : ""}, {e.age ?? "?"} {e.gender ?? ""} · {e.epic}</small>{" "}
                            {voted.has(e.epic) ? <span className="badge">Already marked</span>
                                : pkg.body.blocked.includes(e.epic) ? <span className="badge badge-warn">Presiding officer must decide</span>
                                    : <button className="btn btn-quiet btn-small" onClick={() => setPicked(e)}>Verify</button>}
                        </li>
                    ))}</ul>
                    {picked && (
                        <div className="panel" style={{ borderColor: "var(--brand)" }}>
                            <h4 style={{ marginTop: 0 }}>Verify {picked.name} (serial {picked.serial})</h4>
                            <div className="field"><label htmlFor="off-doc">Identity document shown</label>
                                <select id="off-doc" value={doc} onChange={(e) => setDoc(e.target.value)}>{Object.entries(pkg.body.idDocuments).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                            <label className="check"><input type="checkbox" checked={checks.photoMatches} onChange={(e) => setChecks({ ...checks, photoMatches: e.target.checked })} /> The person matches the photograph</label>
                            <label className="check"><input type="checkbox" checked={checks.inkApplied} onChange={(e) => setChecks({ ...checks, inkApplied: e.target.checked })} /> Indelible ink applied</label>
                            <button className="btn btn-primary" disabled={busy || !checks.photoMatches || !checks.inkApplied} onClick={mark}>Mark as voted (save on this device)</button>{" "}
                            <button className="btn btn-quiet" onClick={() => setPicked(null)}>Cancel</button>
                        </div>
                    )}
                </details>
            )}

            {items.length > 0 && (
                <details>
                    <summary>Records made on this device ({items.length})</summary>
                    <ul className="rows">{items.slice(0, 50).map((i) => (
                        <li key={i.id}><small>{new Date(i.record.actedAt).toLocaleTimeString()}</small> {i.record.epic} <span className={`badge ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span>{i.result?.serial ? ` serial ${i.result.serial} in the register` : ""}{i.result?.message && i.status !== "accepted" ? <><br /><small>{i.result.message}</small></> : null}</li>
                    ))}</ul>
                </details>
            )}

            {role === "presiding_officer" && conflicts.some((c) => c.status === "open") && (
                <div className="panel" style={{ borderColor: "var(--bad, #b42318)" }}>
                    <h4 style={{ marginTop: 0 }}>Offline records that clash with the register</h4>
                    <p><small>The register was not changed. Check with the officers involved and record your decision.</small></p>
                    <ul className="rows">{conflicts.filter((c) => c.status === "open").map((c) => (
                        <li key={c._id}>
                            <strong>{c.epic}</strong>: marked offline at {new Date(c.offline.actedAt).toLocaleTimeString()} on {c.offline.deviceLabel} by {c.offline.by}; {c.existing?.serial ? `already in the register at serial ${c.existing.serial} (${c.existing.by})` : c.message}
                            <div style={{ marginTop: 4 }}>{Object.entries(DECISIONS).map(([k, v]) => <button key={k} className="btn btn-quiet btn-small" style={{ marginRight: 6 }} onClick={() => setDeciding({ conflict: c, decision: k })}>{v}</button>)}</div>
                        </li>
                    ))}</ul>
                </div>
            )}
            {deciding && <ReasonDialog title={DECISIONS[deciding.decision]} label="What did you find? (required)" required confirmLabel="Record decision" confirmClass="btn-approve" busy={busy} error={msg.error}
                onCancel={() => setDeciding(null)} onConfirm={resolve} />}
        </div>
    );
}

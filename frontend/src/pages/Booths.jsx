import { useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import useGeography from "../hooks/useGeography";

// Public: find a polling station by EPIC number or by area. Only stations approved by the
// Election Commission are listed. The EPIC lookup returns the part and station, nothing personal.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const FACILITIES = [["ramp", "Ramp"], ["wheelchair", "Wheelchair"], ["drinkingWater", "Drinking water"], ["toilet", "Toilet"], ["shade", "Shade"], ["signage", "Signage"]];

/** Poll day: the queue at the station, from the polling party's latest count and the recent pace. */
function QueueNow({ id }) {
    const { t } = useTranslation();
    const [q, setQ] = useState(null);
    const [err, setErr] = useState("");
    const check = async () => { setErr(""); try { setQ((await api.get(`/public/stations/${id}/queue`)).data.data); } catch (e) { setErr(apiMessage(e, t("voterExtra.queue.failed"))); } };
    const e = q?.estimate;
    return (
        <p style={{ margin: "8px 0 0" }}>
            <button className="btn btn-quiet btn-small" onClick={check}>{q ? t("voterExtra.queue.again") : t("voterExtra.queue.check")}</button>{" "}
            {q && <span aria-live="polite"><strong>{t(`voterExtra.queue.${e.status}`, { waiting: e.waiting, minutes: e.minutes, defaultValue: e.status })}</strong>{e.reportedAt && <small className="muted"> ({t("voterExtra.queue.reported", { time: new Date(e.reportedAt).toLocaleTimeString() })})</small>}<br /><small className="muted">{t("voterExtra.queue.note")}</small></span>}
            {err && <small className="muted">{err}</small>}
        </p>
    );
}

export function StationCard({ s }) {
    return (
        <li className="panel" style={{ listStyle: "none", marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>{s.name}</h3>
            <p style={{ margin: "4px 0" }}>{s.address}</p>
            <p className="muted" style={{ margin: "4px 0" }}>Part {s.partNumber}, {s.constituency}, {s.district}, {s.state} · {s.stationCode}</p>
            {s.relocationNotice && (
                <div className="alert alert-warn" role="note">
                    <strong>This polling station has moved</strong>
                    It was at {s.relocationNotice.from} ({s.relocationNotice.fromAddress}). Reason: {s.relocationNotice.reason}
                </div>
            )}
            <p style={{ margin: "8px 0 0" }}>
                {FACILITIES.map(([k, label]) => (
                    <span key={k} className={`badge ${s.accessibility?.[k] ? "badge-ok" : ""}`} style={{ marginRight: 6 }}>
                        {s.accessibility?.[k] ? "✓" : "✗"} {label}
                    </span>
                ))}
            </p>
            {s.location && <p style={{ margin: "8px 0 0" }}><a href={`https://www.openstreetmap.org/?mlat=${s.location.lat}&mlon=${s.location.lng}#map=17/${s.location.lat}/${s.location.lng}`} target="_blank" rel="noreferrer">Open the map</a></p>}
            {s._id && <QueueNow id={s._id} />}
            <p className="muted" style={{ margin: "8px 0 0" }}><small>Version {s.version ?? "–"}{s.verifiedAt ? `, approved ${new Date(s.verifiedAt).toLocaleDateString()}` : ""}</small></p>
        </li>
    );
}

export default function Booths() {
    const { states, districtsOf, constituenciesOf } = useGeography();
    const [epic, setEpic] = useState("");
    const [area, setArea] = useState({ state: "", district: "", constituency: "" });
    const [byEpic, setByEpic] = useState(null);
    const [items, setItems] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const run = async (fn) => { setBusy(true); setError(""); try { await fn(); } catch (err) { setError(apiMessage(err, "The search failed. Please try again.")); } finally { setBusy(false); } };
    const findByEpic = (e) => { e.preventDefault(); setItems(null); run(async () => setByEpic((await api.get(`/public/stations/epic/${epic.trim().toUpperCase()}`)).data.data)); };
    const findByArea = (e) => { e.preventDefault(); setByEpic(null); run(async () => setItems((await api.get("/public/stations", { params: area })).data.data.items)); };
    const setField = (k) => (e) => setArea((a) => ({ ...a, [k]: e.target.value, ...(k === "state" ? { district: "", constituency: "" } : {}), ...(k === "district" ? { constituency: "" } : {}) }));

    return (
        <>
            <PageHead title="Find your polling station" crumbs={[{ label: "Voters" }, { label: "Find your polling station" }]}
                lede="Look up where you vote by EPIC number, or browse the polling stations of a constituency. Only stations approved by the Election Commission are shown." />
            <section className="section">
                <div className="container split">
                    <form className="panel portal-form" onSubmit={findByEpic}>
                        <h2>By EPIC number</h2>
                        <div className="field">
                            <label htmlFor="b-epic">EPIC number</label>
                            <input id="b-epic" value={epic} onChange={(e) => setEpic(e.target.value)} placeholder="ABC1234567" maxLength={10} required />
                        </div>
                        <button className="btn btn-primary" type="submit" disabled={busy}>Find my station</button>
                    </form>
                    <form className="panel portal-form" onSubmit={findByArea}>
                        <h2>By area</h2>
                        <div className="field">
                            <label htmlFor="b-state">State or Union Territory</label>
                            <select id="b-state" value={area.state} onChange={setField("state")} required>
                                <option value="">Choose</option>
                                {states.map((s) => <option key={s.name}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label htmlFor="b-district">District (optional)</label>
                            <select id="b-district" value={area.district} onChange={setField("district")}>
                                <option value="">All districts</option>
                                {districtsOf(area.state).map((d) => <option key={d.name}>{d.name}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label htmlFor="b-ac">Constituency (optional)</label>
                            <select id="b-ac" value={area.constituency} onChange={setField("constituency")}>
                                <option value="">All constituencies</option>
                                {constituenciesOf(area.state, area.district).map((c) => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-primary" type="submit" disabled={busy}>Show stations</button>
                    </form>
                </div>
                <div className="container" style={{ marginTop: 24 }}>
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {byEpic && (
                        <div role="status">
                            <h2>Your polling station</h2>
                            <p>{byEpic.constituency}{byEpic.partNumber ? `, part ${byEpic.partNumber}` : ""}</p>
                            {byEpic.station ? <ul style={{ padding: 0 }}><StationCard s={byEpic.station} /></ul>
                                : <p>{byEpic.pollingStation || "No polling station is recorded yet."} <span className="muted">(Station details have not been published for this part yet.)</span></p>}
                        </div>
                    )}
                    {items && (
                        <div role="status">
                            <h2>{items.length} polling station{items.length === 1 ? "" : "s"}</h2>
                            <ul style={{ padding: 0 }}>{items.map((s) => <StationCard key={s._id} s={s} />)}</ul>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}

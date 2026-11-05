// Electoral roll field work and quality: PSE/DSE flags and deaths (ERONET), the BLO App's
// facility survey, house-to-house register and EPIC delivery, and the Record Officer's
// service-voter desk.
import { useState } from "react";
import api from "../../api/axios";
import { Badge, Empty, Field, Kpis, Panel, Status, Table, day, fileToDataUrl, label, useAction, useLoad, useMyArea, when } from "./kit";

const FLAG_STEPS = ["open", "field_check", "field_reported", "notice_issued", "notice_delivered", "decided"];
const FLAG_TONE = { open: "warn", field_check: "info", field_reported: "info", notice_issued: "info", notice_delivered: "warn", decided: "ok" };
const today = () => new Date().toISOString().slice(0, 10);

/** ERO/AERO: scan, send for field check, notice, decide. BLO: field findings, notice delivery, death reports. */
export function RollQualityPanel() {
    const area = useMyArea("constituency");
    const [filter, setFilter] = useState("");
    const { data, error, loading, reload } = useLoad("/roll-quality", filter ? { status: filter } : {});
    const [run, st] = useAction(reload);
    const [f, setF] = useState({});
    const v = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    const [death, setDeath] = useState({ epic: "", registrationNumber: "", dateOfDeath: "", file: null });
    const can = data?.can ?? {};
    return (
        <Panel title="Roll quality: similar entries and deaths" intro="PSE (same photograph) and DSE (same name, relative and date of birth) flags are reasons to look, not proof. An entry is deleted only after notice, delivery and a hearing."
            actions={can.scan && area.constituency ? <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/roll-quality/scan", area))}>Scan the roll of {area.constituency}</button> : null}>
            {data && <Kpis items={[{ label: "Awaiting the ERO", value: (data.counts.open ?? 0) + (data.counts.field_reported ?? 0), tone: data.counts.open ? "warn" : undefined }, { label: "With the BLO", value: (data.counts.field_check ?? 0) + (data.counts.notice_issued ?? 0) },
                { label: "Hearing due", value: data.counts.notice_delivered ?? 0 }, { label: "Decided", value: data.counts.decided ?? 0, tone: "ok" },
                { label: "PSE / DSE / deaths", value: `${data.byType.pse ?? 0} / ${data.byType.dse ?? 0} / ${data.byType.death ?? 0}` }]} />}
            <div className="row-actions" style={{ margin: "12px 0" }}>
                {[["", "All"], ["open", "New"], ["field_check", "Field check"], ["notice_delivered", "Hearing due"], ["decided", "Decided"]].map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
            </div>
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {can.field && (
                <details className="desk-item">
                    <summary><strong>Report a death found in the field</strong></summary>
                    <div className="desk-form" style={{ marginTop: 10 }}>
                        <Field id="d-epic" text="EPIC of the deceased"><input id="d-epic" value={death.epic} onChange={(e) => setDeath({ ...death, epic: e.target.value.toUpperCase() })} /></Field>
                        <Field id="d-reg" text="Death registration number"><input id="d-reg" value={death.registrationNumber} onChange={(e) => setDeath({ ...death, registrationNumber: e.target.value })} /></Field>
                        <Field id="d-date" text="Date of death"><input id="d-date" type="date" max={today()} value={death.dateOfDeath} onChange={(e) => setDeath({ ...death, dateOfDeath: e.target.value })} /></Field>
                        <Field id="d-copy" text="Certificate copy (optional)"><input id="d-copy" type="file" accept="image/*,application/pdf" onChange={(e) => setDeath({ ...death, file: e.target.files[0] })} /></Field>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(async () => api.post("/roll-quality/death-report", { ...death, file: undefined, copy: await fileToDataUrl(death.file) }))}>Report the death</button></div>
                    </div>
                </details>
            )}
            {data && (data.items.length ? data.items.map((x) => (
                <div className="desk-item" key={x._id}>
                    <h4>{x.typeText} <Badge tone={FLAG_TONE[x.status]}>{x.statusText}</Badge>{x.crossConstituency && <> <Badge tone="info">across constituencies</Badge></>}</h4>
                    <div className="steps-line">{FLAG_STEPS.map((s) => <span key={s} className={FLAG_STEPS.indexOf(s) <= FLAG_STEPS.indexOf(x.status) ? "on" : ""}>{label(s)}</span>)}</div>
                    <Table head={["EPIC", "Name", "Relative", "Born", "Part / serial", "House"]} rows={x.entries.map((e) => (
                        <tr key={e.epic}><td>{e.epic}</td><td>{e.name}</td><td>{e.relativeName ?? "—"}</td><td>{e.dateOfBirth ?? "—"}</td><td>{e.constituency !== x.jurisdiction.constituency ? `${e.constituency}, ` : ""}{e.partNumber ?? "—"} / {e.serialNumber ?? "—"}</td><td>{e.houseNumber ?? "—"}</td></tr>))} />
                    {x.certificate && <p className="meta">Death registration {x.certificate.registrationNumber}, died {day(x.certificate.dateOfDeath)}{x.hasCertificateCopy ? " · copy uploaded" : ""}</p>}
                    {x.fieldReport && <p className="meta">BLO: <strong>{data.findings[x.fieldReport.finding]}</strong> — {x.fieldReport.note} ({when(x.fieldReport.at)})</p>}
                    {x.notice && <p className="meta">Notice {x.notice.number} to {x.notice.epic}; hearing {day(x.notice.hearingOn)}{x.notice.delivered ? ` · delivered ${day(x.notice.delivered.on)} (${label(x.notice.delivered.mode)})` : " · not yet delivered"}</p>}
                    {x.decision && <p className="meta">Order: <strong>{x.decision.outcome === "keep_all" ? "all entries kept" : `entry ${x.decision.deleted} deleted`}</strong> — {x.decision.reason}</p>}
                    {can.decide && ["open", "field_reported"].includes(x.status) && (
                        <div className="desk-actions">
                            {x.status === "open" && <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/roll-quality/${x._id}/field-check`, {}), "Sent to the BLO.")}>Ask the BLO to check</button>}
                            <select aria-label="Entry to notify" value={v(x._id, "epic")} onChange={set(x._id, "epic")}><option value="">Notice to…</option>{x.entries.map((e) => <option key={e.epic} value={e.epic}>{e.epic}</option>)}</select>
                            <input type="date" aria-label="Hearing date" min={today()} value={v(x._id, "hearingOn")} onChange={set(x._id, "hearingOn")} />
                            <button className="btn btn-primary btn-small" disabled={!v(x._id, "epic") || !v(x._id, "hearingOn") || st.busy} onClick={() => run(() => api.post(`/roll-quality/${x._id}/notice`, { epic: v(x._id, "epic"), hearingOn: v(x._id, "hearingOn") }))}>Issue notice</button>
                            <button className="btn btn-quiet btn-small" disabled={st.busy || v(x._id, "reason").length < 10} onClick={() => run(() => api.post(`/roll-quality/${x._id}/decide`, { outcome: "keep_all", reason: v(x._id, "reason") }))}>Keep all entries</button>
                            <input aria-label="Reasons" placeholder="Reasons for the order (10+ characters)" value={v(x._id, "reason")} onChange={set(x._id, "reason")} style={{ flex: "1 1 240px" }} />
                        </div>
                    )}
                    {can.decide && x.status === "notice_delivered" && (
                        <div className="desk-actions">
                            <input aria-label="Reasons" placeholder="Reasons for the order, after hearing the elector" value={v(x._id, "reason")} onChange={set(x._id, "reason")} style={{ flex: "1 1 280px" }} />
                            <button className="btn btn-primary btn-small" disabled={st.busy || v(x._id, "reason").length < 10} onClick={() => run(() => api.post(`/roll-quality/${x._id}/decide`, { outcome: "delete_entry", reason: v(x._id, "reason") }))}>Delete {x.notice.epic}</button>
                            <button className="btn btn-quiet btn-small" disabled={st.busy || v(x._id, "reason").length < 10} onClick={() => run(() => api.post(`/roll-quality/${x._id}/decide`, { outcome: "keep_all", reason: v(x._id, "reason") }))}>Keep all</button>
                        </div>
                    )}
                    {can.field && x.status === "field_check" && (
                        <div className="desk-actions">
                            <select aria-label="Finding" value={v(x._id, "finding")} onChange={set(x._id, "finding")}><option value="">What you found…</option>{Object.entries(data.findings).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                            <input aria-label="Details" placeholder="Details" value={v(x._id, "note")} onChange={set(x._id, "note")} style={{ flex: "1 1 240px" }} />
                            <button className="btn btn-primary btn-small" disabled={!v(x._id, "finding") || st.busy} onClick={() => run(() => api.post(`/roll-quality/${x._id}/field-finding`, { finding: v(x._id, "finding"), note: v(x._id, "note") }))}>Send finding</button>
                        </div>
                    )}
                    {can.field && x.status === "notice_issued" && (
                        <div className="desk-actions">
                            <select aria-label="Delivery" value={v(x._id, "mode") || "in_person"} onChange={set(x._id, "mode")}>{["in_person", "family_member", "affixed", "post"].map((m) => <option key={m} value={m}>{label(m)}</option>)}</select>
                            <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/roll-quality/${x._id}/notice-delivered`, { mode: v(x._id, "mode") || "in_person" }))}>Notice delivered</button>
                        </div>
                    )}
                </div>
            )) : <Empty>No flags.</Empty>)}
        </Panel>
    );
}

/** BLO / sector officer: survey a polling station. DEO and others: the latest survey of each station. */
export function FieldSurveyPanel({ canSurvey = false }) {
    const lists = useLoad("/field/lists");
    const surveys = useLoad("/field/surveys");
    const stations = useLoad(canSurvey ? "/polling-stations" : null);
    const [run, st] = useAction(surveys.reload);
    const [form, setForm] = useState({ stationId: "", amf: {}, emf: {}, distances: {}, gps: null, photo: null, remarks: "" });
    const [gpsMsg, setGpsMsg] = useState("");
    const L = lists.data;
    const myStations = (stations.data?.items ?? stations.data ?? []).filter?.((s) => s.status === "ACTIVE") ?? [];
    const locate = () => {
        if (!navigator.geolocation) { setGpsMsg("This device cannot give a position."); return; }
        setGpsMsg("Finding your position…");
        navigator.geolocation.getCurrentPosition((p) => { setForm((x) => ({ ...x, gps: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) } })); setGpsMsg(`Position captured (±${Math.round(p.coords.accuracy)} m).`); },
            () => setGpsMsg("Position not available; allow location access or enter it on the map later."), { enableHighAccuracy: true, timeout: 10000 });
    };
    const toggle = (group, k) => setForm({ ...form, [group]: { ...form[group], [k]: !form[group][k] } });
    const s = surveys.data;
    return (
        <Panel title="Polling-station facilities (AMF / EMF)" intro="Assured and essential minimum facilities, the GPS position, a photograph and distances to nearby services. A survey never moves a station; a position far from the record is flagged for the DEO.">
            {s && <Kpis items={[{ label: "Stations surveyed", value: s.summary.stations }, { label: "All AMF in place", value: s.summary.fullAmf, tone: "ok" }, { label: "Average AMF", value: s.summary.avgAmf === null ? "—" : `${s.summary.avgAmf}%` },
                { label: "GPS to check", value: s.summary.gpsFlags, tone: s.summary.gpsFlags ? "warn" : undefined }]} />}
            <Status loading={surveys.loading} error={surveys.error || st.error} notice={st.notice} />
            {canSurvey && L && (
                <details className="desk-item" open>
                    <summary><strong>New survey</strong></summary>
                    <div className="desk-form" style={{ marginTop: 10 }}>
                        <Field id="sv-st" text="Polling station" wide><select id="sv-st" value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })}><option value="">Choose…</option>{myStations.map((x) => <option key={x._id} value={x._id}>{x.constituency} · part {x.partNumber} · {x.name}</option>)}</select></Field>
                    </div>
                    <h4 className="subhead">Assured minimum facilities</h4>
                    <div className="check-grid">{Object.entries(L.amf).map(([k, t]) => <label key={k} className="check"><input type="checkbox" checked={Boolean(form.amf[k])} onChange={() => toggle("amf", k)} /> {t}</label>)}</div>
                    <h4 className="subhead">Essential minimum facilities</h4>
                    <div className="check-grid">{Object.entries(L.emf).map(([k, t]) => <label key={k} className="check"><input type="checkbox" checked={Boolean(form.emf[k])} onChange={() => toggle("emf", k)} /> {t}</label>)}</div>
                    <h4 className="subhead">Distance to (km)</h4>
                    <div className="desk-form">{Object.entries(L.nearby).map(([k, t]) => <Field key={k} id={`sv-d-${k}`} text={t}><input id={`sv-d-${k}`} inputMode="decimal" value={form.distances[k] ?? ""} onChange={(e) => setForm({ ...form, distances: { ...form.distances, [k]: e.target.value } })} /></Field>)}</div>
                    <div className="desk-form" style={{ marginTop: 12 }}>
                        <div><button type="button" className="btn btn-quiet btn-small" onClick={locate}>Capture GPS position</button> <small className="muted">{gpsMsg || (form.gps ? `${form.gps.lat.toFixed(5)}, ${form.gps.lng.toFixed(5)}` : "")}</small></div>
                        <Field id="sv-photo" text="Photograph of the station"><input id="sv-photo" type="file" accept="image/*" capture="environment" onChange={async (e) => { try { setForm({ ...form, photo: await fileToDataUrl(e.target.files[0]) }); } catch (err) { setGpsMsg(err.message); } }} /></Field>
                        <Field id="sv-rem" text="Remarks" wide><textarea id="sv-rem" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={!form.stationId || st.busy} onClick={() => run(() => api.post(`/field/stations/${form.stationId}/survey`, { ...form, stationId: undefined }))}>Save survey</button></div>
                    </div>
                </details>
            )}
            {s && <Table head={["Station", "Part", "#AMF", "Missing", "GPS", "Nearest hospital (km)", "Surveyed"]} empty="No surveys yet." rows={s.latest.map((x) => (
                <tr key={x._id}><td>{x.stationName}<br /><small className="muted">{x.jurisdiction.constituency}</small></td><td>{x.partNumber}</td><td className="num"><Badge tone={x.amfScore === 100 ? "ok" : x.amfScore >= 75 ? "warn" : "bad"}>{x.amfScore}%</Badge></td>
                    <td>{x.missing.length ? x.missing.slice(0, 3).join(", ") + (x.missing.length > 3 ? ` +${x.missing.length - 3}` : "") : "None"}</td><td>{x.gpsFlag ? <Badge tone="warn">check ({x.gpsOffsetM} m)</Badge> : x.gps ? "OK" : "—"}</td>
                    <td className="num">{x.distances?.hospital ?? "—"}</td><td>{day(x.createdAt)}<br /><small className="muted">{x.by.epic}</small></td></tr>))} />}
        </Panel>
    );
}

/** BLO register (house-to-house) and EPIC delivery. */
export function BloRegisterPanel() {
    const reg = useLoad("/field/register");
    const del = useLoad("/field/epic-deliveries");
    const [run, st] = useAction(async () => { await reg.reload(); await del.reload(); });
    const [f, setF] = useState({ epic: "", finding: "present", houseNumber: "", nationalHouseNumber: "", note: "" });
    const [d, setD] = useState({ epic: "", kind: "new", receivedBy: "self" });
    const findings = reg.data?.findings ?? {};
    return (
        <Panel title="House-to-house register and EPIC delivery" intro="Record what you found at each entry's address. You report; the ERO decides any change to the roll.">
            {reg.data && <Kpis items={Object.entries(findings).map(([k, t]) => ({ label: t, value: reg.data.counts[k] ?? 0, tone: ["dead", "duplicate", "not_found"].includes(k) && reg.data.counts[k] ? "warn" : undefined }))} />}
            <Status loading={reg.loading} error={reg.error || st.error} notice={st.notice} />
            <div className="two-col" style={{ marginTop: 12 }}>
                <div className="desk-item">
                    <h4>Register a visit</h4>
                    <div className="desk-form">
                        <Field id="r-epic" text="EPIC"><input id="r-epic" value={f.epic} onChange={(e) => setF({ ...f, epic: e.target.value.toUpperCase() })} /></Field>
                        <Field id="r-find" text="Finding"><select id="r-find" value={f.finding} onChange={(e) => setF({ ...f, finding: e.target.value })}>{Object.entries(findings).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="r-hn" text="House number"><input id="r-hn" value={f.houseNumber} onChange={(e) => setF({ ...f, houseNumber: e.target.value })} /></Field>
                        <Field id="r-nhn" text="National House Number"><input id="r-nhn" value={f.nationalHouseNumber} onChange={(e) => setF({ ...f, nationalHouseNumber: e.target.value })} /></Field>
                        <Field id="r-note" text="Note" wide><input id="r-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={!f.epic || st.busy} onClick={() => run(() => api.post("/field/register", f))}>Save</button></div>
                    </div>
                </div>
                <div className="desk-item">
                    <h4>EPIC handed over</h4>
                    <div className="desk-form">
                        <Field id="e-epic" text="EPIC"><input id="e-epic" value={d.epic} onChange={(e) => setD({ ...d, epic: e.target.value.toUpperCase() })} /></Field>
                        <Field id="e-kind" text="Card"><select id="e-kind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}><option value="new">New</option><option value="replacement">Replacement</option></select></Field>
                        <Field id="e-by" text="Received by"><select id="e-by" value={d.receivedBy} onChange={(e) => setD({ ...d, receivedBy: e.target.value })}><option value="self">The elector</option><option value="family_member">A family member</option></select></Field>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={!d.epic || st.busy} onClick={() => run(() => api.post("/field/epic-deliveries", d))}>Record delivery</button></div>
                    </div>
                    {del.data && <p className="meta">{del.data.total} EPIC(s) delivered in your area.</p>}
                </div>
            </div>
            {reg.data && <><h4 className="subhead">Recent visits</h4><Table head={["EPIC", "Name", "Part", "House / NHN", "Finding", "Visited"]} rows={reg.data.items.slice(0, 40).map((r) => (
                <tr key={r._id}><td>{r.epic}</td><td>{r.name}</td><td>{r.partNumber}</td><td>{r.houseNumber ?? "—"}<br /><small className="muted">{r.nationalHouseNumber ?? ""}</small></td><td><Badge tone={r.finding === "present" ? "ok" : "warn"}>{findings[r.finding]}</Badge>{r.note ? <><br /><small className="muted">{r.note}</small></> : null}</td><td>{day(r.visitedOn)}</td></tr>))} /></>}
        </Panel>
    );
}

/** Record Officer: service-voter applications, verification of service particulars, postal-ballot PINs. */
export function RecordOfficerPanel() {
    const en = useLoad("/etpb/record-officer/enrolments");
    const pins = useLoad("/etpb/record-officer/pins");
    const [run, st] = useAction(async () => { await en.reload(); await pins.reload(); });
    const [f, setF] = useState({});
    const v = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    return (
        <Panel title="Service voters" intro="Check the service particulars on Forms 2, 2A and 3 before the ERO decides, and pass each postal-ballot PIN to the voter by a separate channel. New applications are filed through the electoral forms (Form 2 / 2A / 3).">
            {en.data && <Kpis items={[{ label: "Service voters enrolled", value: en.data.enrolled }, { label: "Applications", value: en.data.applications.length }, { label: "PINs to pass on", value: (pins.data?.items ?? []).filter((p) => !p.pinCollected).length, tone: "warn" }]} />}
            <Status loading={en.loading} error={en.error || pins.error || st.error} notice={st.notice} />
            <h4 className="subhead">Applications</h4>
            {en.data && <Table head={["Reference", "Form", "Name", "Constituency", "Status", "Service particulars"]} empty="No service-voter applications." rows={en.data.applications.map((a) => (
                <tr key={a._id}><td>{a.referenceId}</td><td>{a.formCode.replace("FORM_", "Form ")}</td><td>{a.name ?? "—"}</td><td>{a.constituency}</td><td>{label(a.status)}{a.decision?.epic ? ` · ${a.decision.epic}` : ""}</td>
                    <td>{a.verifiedByRecordOfficer ? <Badge tone={a.verifiedByRecordOfficer.verified ? "ok" : "bad"}>{a.verifiedByRecordOfficer.verified ? "verified" : "flagged"}</Badge> : !a.decision ? (
                        <span className="desk-actions" style={{ marginTop: 0 }}><input aria-label="Service number" placeholder="Service no." value={v(a._id, "sn")} onChange={set(a._id, "sn")} style={{ width: 110 }} />
                            <button className="btn btn-primary btn-small" disabled={!v(a._id, "sn") || st.busy} onClick={() => run(() => api.post(`/etpb/record-officer/verify/${a._id}`, { verified: true, serviceNumber: v(a._id, "sn") }))}>Verify</button>
                            <button className="btn btn-quiet btn-small" disabled={!v(a._id, "sn") || st.busy} onClick={() => run(() => api.post(`/etpb/record-officer/verify/${a._id}`, { verified: false, serviceNumber: v(a._id, "sn") }))}>Flag</button></span>) : "—"}</td></tr>))} />}
            <h4 className="subhead">Postal-ballot PINs</h4>
            {pins.data && <Table head={["Ballot", "Voter", "Constituency", "Status", "PIN"]} empty="No ballots transmitted yet." rows={pins.data.items.map((p) => (
                <tr key={p.ballotId}><td>{p.ballotId}</td><td>{p.name}<br /><small className="muted">{p.elector}</small></td><td>{p.constituency}</td><td>{p.statusText}</td>
                    <td>{p.pinCollected ? <Badge tone="ok">passed on</Badge> : <><code>{p.pin ?? "expired"}</code> <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/etpb/record-officer/pins/${p.ballotId}/collected`, {}))}>Passed on</button></>}</td></tr>))} />}
        </Panel>
    );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import useGeography from "../hooks/useGeography";
import { apiMessage } from "../config/elections";
import "../styles/desk.css";

// Model Code of Conduct complaints (cVIGIL). Reports go to the district control room, which sends
// a flying squad; the Returning Officer disposes of the complaint. Follow it by reference.

const CATEGORIES = [
    ["cash", "Distribution of cash or bribery"], ["liquor", "Distribution of liquor, drugs or freebies"], ["loudspeaker", "Loudspeakers beyond permitted hours"],
    ["hate_speech", "Hate speech or communal appeals"], ["defacement", "Unauthorised banners or defacement of property"], ["intimidation", "Firearms or voter intimidation"],
    ["paid_news", "Paid news or uncertified advertisements"], ["government_misuse", "Misuse of government vehicles or premises"], ["other", "Other violation"]
];
const STEPS = ["received", "assigned", "field_reported", "disposed"];
const STEP_LABEL = { received: "Received", assigned: "Flying squad sent", field_reported: "Squad reported", disposed: "Disposed", dropped: "Dropped" };

function Clock({ dueAt, closed }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { if (closed) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [closed]);
    if (closed) return null;
    const left = Math.max(0, Math.round((Date.parse(dueAt) - now) / 1000));
    return <><p className="muted">Time left for the response team to act</p><p className="countdown">{Math.floor(left / 60)} min {String(left % 60).padStart(2, "0")} s</p></>;
}

function Status({ c }) {
    const done = c.status === "dropped" ? 1 : STEPS.indexOf(c.status) + 1;
    return (
        <div className="panel" role="status">
            <h2>{c.referenceId}: {c.statusText}</h2>
            <p>{c.categoryLabel} · {c.constituency} · received {new Date(c.receivedAt).toLocaleString("en-IN")}</p>
            <ol className="steps-line">{(c.status === "dropped" ? ["received", "dropped"] : STEPS).map((s, i) => <li key={s} className={i < done - 1 ? "done" : i === done - 1 ? "now" : ""}>{STEP_LABEL[s]}</li>)}</ol>
            {c.disposal && <p style={{ marginTop: 12 }}><strong>{c.disposal.outcomeText}.</strong> {c.disposal.note}</p>}
            {c.clock?.closedWithinSla !== null && c.clock?.closedWithinSla !== undefined && <p className="muted">{c.clock.closedWithinSla ? "Closed within 100 minutes." : "Closed after the 100-minute target."}</p>}
            <Clock dueAt={c.clock?.dueAt} closed={["disposed", "dropped"].includes(c.status)} />
        </div>
    );
}

export default function ReportViolation() {
    const [tab, setTab] = useState("report");
    const { states, districtsOf, constituenciesOf } = useGeography();
    const [f, setF] = useState({ state: "", district: "", constituency: "", category: "cash", description: "", place: "", anonymous: false, mobile: "" });
    const [where, setWhere] = useState(null);
    const [photo, setPhoto] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [filed, setFiled] = useState(null);
    const [ref, setRef] = useState("");
    const [tracked, setTracked] = useState(null);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === "state" ? { district: "", constituency: "" } : k === "district" ? { constituency: "" } : {}) });

    const locate = () => navigator.geolocation?.getCurrentPosition((p) => setWhere({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }), () => setError("Your location could not be read. Describe the place instead."));
    const choosePhoto = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Attach a JPEG, PNG or WebP photo of up to 4 MB."); return; }
        const r = new FileReader(); r.onload = () => setPhoto(r.result); r.readAsDataURL(file);
    };
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError("");
        try {
            const { data } = await api.post("/complaints", { ...f, ...(where ?? {}), photo });
            setFiled(data.data);
        } catch (err) { setError(apiMessage(err, "The report could not be sent.")); }
        finally { setBusy(false); }
    };
    const track = async (e) => {
        e.preventDefault(); setTracked(null); setError("");
        try { setTracked((await api.get(`/complaints/track/${encodeURIComponent(ref.trim())}`)).data.data); }
        catch (err) { setError(apiMessage(err, "No report was found with that reference.")); }
    };

    return (
        <>
            <PageHead title="Report a violation" crumbs={[{ label: "Elections" }, { label: "Report a violation" }]}
                lede="Saw cash, liquor, weapons, hate speech or another Model Code of Conduct violation? Report it with a photo and the place. The district control room sends a flying squad; the target is action within 100 minutes." />
            <section className="section">
                <div className="container">
                    <Tabs label="Violation reports" active={tab} onChange={(t) => { setTab(t); setError(""); }} tabs={[{ id: "report", label: "Report a violation" }, { id: "track", label: "Follow a report" }]} />
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {tab === "report" && (filed ? (
                        <>
                            <Status c={filed} />
                            <p><strong>Keep your reference: {filed.referenceId}</strong> · <button type="button" className="btn btn-quiet btn-small" onClick={() => { setFiled(null); setPhoto(null); setF({ ...f, description: "", place: "" }); }}>File another report</button></p>
                        </>
                    ) : (
                        <form className="panel portal-form" onSubmit={submit} style={{ maxWidth: 760 }}>
                            <div className="form-row">
                                <div className="field"><label htmlFor="v-st">State/UT</label><select id="v-st" value={f.state} onChange={set("state")} required><option value="">Choose…</option>{states.map((s) => <option key={s.name}>{s.name}</option>)}</select></div>
                                <div className="field"><label htmlFor="v-d">District</label><select id="v-d" value={f.district} onChange={set("district")} required><option value="">Choose…</option>{districtsOf(f.state).map((d) => <option key={d.name}>{d.name}</option>)}</select></div>
                                <div className="field"><label htmlFor="v-ac">Assembly constituency</label><select id="v-ac" value={f.constituency} onChange={set("constituency")} required><option value="">Choose…</option>{constituenciesOf(f.state, f.district).map((c) => <option key={c}>{c}</option>)}</select></div>
                            </div>
                            <div className="field"><label htmlFor="v-cat">What did you see?</label>
                                <select id="v-cat" value={f.category} onChange={set("category")}>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
                            <div className="field"><label htmlFor="v-desc">Describe it</label>
                                <textarea id="v-desc" value={f.description} onChange={set("description")} required minLength={10} placeholder="What happened, who was involved, when." /></div>
                            <div className="field"><label htmlFor="v-place">Where (landmark)</label><input id="v-place" value={f.place} onChange={set("place")} /></div>
                            <div className="row-actions">
                                <button type="button" className="btn btn-quiet btn-small" onClick={locate}>{where ? `Location added (${where.lat}, ${where.lng})` : "Add my current location"}</button>
                                <label className="btn btn-quiet btn-small" htmlFor="v-photo">{photo ? "Photo attached ✓" : "Attach a photo"}</label>
                                <input id="v-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="sr-only" />
                            </div>
                            <label className="check"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /> Keep me anonymous (you can still follow the report by its reference)</label>
                            {!f.anonymous && <div className="field"><label htmlFor="v-mob">Mobile number (optional, for the squad to reach you)</label><input id="v-mob" inputMode="numeric" maxLength={10} value={f.mobile} onChange={set("mobile")} /></div>}
                            <button type="submit" className="btn btn-primary" disabled={busy || !f.description.trim()}>{busy ? "Sending…" : "Submit report"}</button>
                        </form>
                    ))}
                    {tab === "track" && (
                        <>
                            <form className="panel portal-form" onSubmit={track} style={{ maxWidth: 520 }}>
                                <div className="field"><label htmlFor="v-ref">Reference</label><input id="v-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="CV2026…" required /></div>
                                <button className="btn btn-primary">Show status</button>
                            </form>
                            {tracked && <Status c={tracked} />}
                        </>
                    )}
                    <p className="muted" style={{ marginTop: 20 }}>Officials work these reports from their desks: the control room dispatches, the flying squad reports, the Returning Officer disposes. <Link to="/signin">Sign in</Link></p>
                </div>
            </section>
        </>
    );
}

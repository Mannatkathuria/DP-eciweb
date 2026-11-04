import { useState } from "react";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import { apiMessage } from "../config/elections";

// Appeals against an ERO's order on the roll (RP Act 1950, s. 24): first appeal to the district
// appellate authority within 15 days, second appeal to the Chief Electoral Officer within 30 days.

function Result({ a, onSecond }) {
    const [grounds, setGrounds] = useState("");
    return (
        <div className="panel" role="status">
            <h2>{a.referenceId}: {a.statusText}</h2>
            <p>Against: {a.order.title} ({a.order.reference}), {a.order.constituency}. Filed {new Date(a.filedAt).toLocaleDateString("en-IN")}.</p>
            {a.first && <p><strong>First appeal:</strong> {a.first.outcomeText}. {a.first.reason}</p>}
            {a.second && <p><strong>Second appeal:</strong> {a.second.outcomeText}. {a.second.reason}</p>}
            {a.implementation && <p><strong>Implemented by the ERO:</strong> {a.implementation.note}</p>}
            {a.status === "first_decided" && (
                <form className="portal-form" onSubmit={(e) => { e.preventDefault(); onSecond(grounds); }}>
                    <div className="field"><label htmlFor="ap2">Grounds for a second appeal to the CEO (within 30 days)</label><textarea id="ap2" rows={3} value={grounds} onChange={(e) => setGrounds(e.target.value)} required minLength={20} /></div>
                    <button className="btn btn-primary">File second appeal</button>
                </form>
            )}
        </div>
    );
}

export default function Appeal() {
    const [tab, setTab] = useState("file");
    const [f, setF] = useState({ reference: "", dateOfBirth: "", name: "", mobile: "", grounds: "" });
    const [ref, setRef] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
    const go = async (fn) => { setBusy(true); setError(""); try { setResult((await fn()).data.data); } catch (e) { setError(apiMessage(e, "That did not work.")); } finally { setBusy(false); } };
    return (
        <>
            <PageHead title="Appeal an ERO's decision" crumbs={[{ label: "Voters" }, { label: "Appeal" }]}
                lede="If the Electoral Registration Officer allowed or rejected a claim or objection and you disagree, appeal within 15 days to the district appellate authority. Its order can be taken to the Chief Electoral Officer within 30 days. The appellate authority orders; the ERO then changes the roll." />
            <section className="section">
                <div className="container">
                    <Tabs label="Appeals" active={tab} onChange={(t) => { setTab(t); setResult(null); setError(""); }} tabs={[{ id: "file", label: "File a first appeal" }, { id: "track", label: "Follow an appeal" }]} />
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {tab === "file" && !result && (
                        <form className="panel portal-form" style={{ maxWidth: 720 }} onSubmit={(e) => { e.preventDefault(); go(() => api.post("/appeals", f)); }}>
                            <div className="form-row">
                                <div className="field"><label htmlFor="ap-ref">Reference of the application decided</label><input id="ap-ref" value={f.reference} onChange={set("reference")} required placeholder="Form 6 reference, or EF…" /></div>
                                <div className="field"><label htmlFor="ap-dob">Applicant's date of birth</label><input id="ap-dob" type="date" value={f.dateOfBirth} onChange={set("dateOfBirth")} /></div>
                            </div>
                            <div className="form-row">
                                <div className="field"><label htmlFor="ap-name">Your name</label><input id="ap-name" value={f.name} onChange={set("name")} required /></div>
                                <div className="field"><label htmlFor="ap-mob">Mobile (optional)</label><input id="ap-mob" inputMode="numeric" maxLength={10} value={f.mobile} onChange={set("mobile")} /></div>
                            </div>
                            <div className="field"><label htmlFor="ap-g">Grounds of appeal</label><textarea id="ap-g" rows={4} value={f.grounds} onChange={set("grounds")} required minLength={20} placeholder="Why the ERO's order is wrong, and what evidence you have." /></div>
                            <button className="btn btn-primary" disabled={busy}>File appeal</button>
                        </form>
                    )}
                    {tab === "track" && !result && (
                        <form className="panel portal-form" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); go(() => api.get(`/appeals/track/${encodeURIComponent(ref.trim())}`)); }}>
                            <div className="field"><label htmlFor="ap-t">Appeal reference</label><input id="ap-t" value={ref} onChange={(e) => setRef(e.target.value)} required placeholder="AP2026…" /></div>
                            <button className="btn btn-primary" disabled={busy}>Show status</button>
                        </form>
                    )}
                    {result && <Result a={result} onSecond={(grounds) => go(() => api.post(`/appeals/track/${result.referenceId}/second`, { grounds }))} />}
                </div>
            </section>
        </>
    );
}

import { useEffect, useState } from "react";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";

const CATEGORIES = [
  { id: "cash", label: "Distribution of cash or bribery", severity: "High" },
  { id: "liquor", label: "Distribution of liquor or freebies", severity: "High" },
  { id: "speaker", label: "Loudspeakers beyond permitted hours", severity: "Medium" },
  { id: "hate_speech", label: "Hate speech or communal appeals", severity: "Critical" },
  { id: "banner", label: "Unauthorised banners or defacement of property", severity: "Medium" },
  { id: "weapons", label: "Firearms or voter intimidation", severity: "Critical" },
  { id: "paid_news", label: "Paid news or uncertified advertisements", severity: "Medium" }
];

const QUEUE = [
  { id: "VR-2026-0842", category: "Distribution of cash or bribery", location: "Near the bus terminal", reported: "14:15", status: "Investigating", team: "Flying squad 02", note: "On site, gathering evidence" },
  { id: "VR-2026-0839", category: "Loudspeakers beyond permitted hours", location: "Block C market", reported: "13:40", status: "Disposed", team: "Flying squad 05", note: "Equipment seized, undertaking taken" },
  { id: "VR-2026-0835", category: "Unauthorised banners", location: "Main road", reported: "12:10", status: "Disposed", team: "Static surveillance team 01", note: "Banners removed by the civic team" }
];

const clock = (seconds) => `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;

export default function ReportViolation() {
  const [tab, setTab] = useState("report");
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [filed, setFiled] = useState(null);
  const [seconds, setSeconds] = useState(6000);
  const [queue, setQueue] = useState(QUEUE);

  useEffect(() => {
    if (!filed) return undefined;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [filed]);

  const submit = (e) => {
    e.preventDefault();
    setFiled({ id: `VR-2026-${Math.floor(1000 + Math.random() * 9000)}`, category: CATEGORIES.find((c) => c.id === category)?.label, anonymous });
    setSeconds(6000);
  };
  const decide = (id, status) => setQueue((q) => q.map((item) => (item.id === id ? { ...item, status, note: `${status} by the returning officer` } : item)));

  return (
    <>
      <PageHead title="Report a violation" crumbs={[{ label: "Elections" }, { label: "Report a violation" }]}
        lede="See cash, liquor, weapons, hate speech or other Model Code of Conduct violations? Report it with evidence. A response team is expected on the matter within 100 minutes." />
      <section className="section">
        <div className="container">
          <Tabs label="Violation reports" active={tab} onChange={setTab} tabs={[{ id: "report", label: "Report a violation" }, { id: "queue", label: "Response queue" }]} />

          {tab === "report" && (filed ? (
            <div className="panel" role="status">
              <h2>Report received: {filed.id}</h2>
              <p>{filed.category}. {filed.anonymous ? "Filed anonymously." : "Filed with your contact details."}</p>
              <p className="muted">Time left for the response team to act</p>
              <p className="countdown">{clock(seconds)}</p>
              <button type="button" className="btn btn-quiet" onClick={() => { setFiled(null); setDescription(""); setEvidence(false); }}>File another report</button>
            </div>
          ) : (
            <form className="panel portal-form" onSubmit={submit} style={{ maxWidth: 720 }}>
              <div className="field">
                <label htmlFor="v-cat">What did you see?</label>
                <select id="v-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.severity})</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="v-desc">Describe it</label>
                <textarea id="v-desc" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} placeholder="Where it happened, who was involved, and what you saw." />
              </div>
              <label className="check"><input type="checkbox" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} /> I have a photo or video taken now, with my location</label>
              <label className="check"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Keep my identity anonymous</label>
              <button type="submit" className="btn btn-primary" disabled={!description.trim()}>Submit report</button>
            </form>
          ))}

          {tab === "queue" && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Reference</th><th>Violation</th><th>Where</th><th>Reported</th><th>Team</th><th>Status</th><th><span className="sr-only">Decision</span></th></tr></thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id}>
                      <td className="figure">{item.id}</td>
                      <td>{item.category}</td>
                      <td>{item.location}</td>
                      <td>{item.reported}</td>
                      <td>{item.team}<br /><small className="muted">{item.note}</small></td>
                      <td><span className={`badge ${item.status === "Investigating" ? "badge-progress" : item.status === "Disposed" ? "badge-ok" : "badge-warn"}`}>{item.status}</span></td>
                      <td>{item.status === "Investigating" && (
                        <span className="cluster">
                          <button type="button" className="btn btn-quiet btn-small" onClick={() => decide(item.id, "Disposed")}>Dispose</button>
                          <button type="button" className="btn btn-quiet btn-small" onClick={() => decide(item.id, "Escalated")}>Escalate</button>
                        </span>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ marginTop: 20 }}>Sample data for demonstration. Reports filed here are not sent to an office.</p>
        </div>
      </section>
    </>
  );
}

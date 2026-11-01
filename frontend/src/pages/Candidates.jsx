import { useState } from "react";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";

const PERMISSIONS = [
  { id: "rally", title: "Public rallies and processions", depts: "Police, traffic, fire" },
  { id: "speaker", title: "Use of loudspeakers", depts: "Police, pollution control" },
  { id: "vehicle", title: "Campaign vehicles and convoys", depts: "Transport, traffic, police" },
  { id: "office", title: "Temporary party offices", depts: "Municipal corporation, fire" },
  { id: "helipad", title: "Helicopter or helipad landing", depts: "Aviation authority, district police, public works" }
];

const TRACKER = [
  { id: "CP-2026-00192", applicant: "Independent candidate", category: "Campaign vehicles and convoys", venue: "Five vehicles, constituency-wide", applied: "30 Oct 2026", status: "Approved", queue: "Processed (12th)" },
  { id: "CP-2026-00198", applicant: "Recognised party", category: "Public rallies and processions", venue: "District ground", applied: "31 Oct 2026", status: "With departments", queue: "4th in queue" }
];

const CANDIDATES = [
  { name: "Candidate A", party: "Party One", assets: "₹1.2 crore", cases: "None declared", education: "Graduate" },
  { name: "Candidate B", party: "Party Two", assets: "₹86 lakh", cases: "1 declared", education: "Post graduate" },
  { name: "Candidate C", party: "Independent", assets: "₹14 lakh", cases: "None declared", education: "Higher secondary" }
];

export default function Candidates() {
  const [tab, setTab] = useState("permissions");
  const [category, setCategory] = useState("rally");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [applied, setApplied] = useState(null);
  const [nom, setNom] = useState({ name: "", party: "", constituency: "", deposit: "", affidavit: false });
  const [nomId, setNomId] = useState("");
  const [search, setSearch] = useState("");

  const selected = PERMISSIONS.find((p) => p.id === category);
  const apply = (e) => { e.preventDefault(); setApplied({ id: `CP-2026-${Math.floor(10000 + Math.random() * 90000)}`, title: selected.title, venue, date }); };
  const nominate = (e) => { e.preventDefault(); setNomId(`NOM-2026-${Math.floor(100 + Math.random() * 900)}`); };
  const set = (k) => (e) => setNom({ ...nom, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const found = CANDIDATES.filter((c) => !search.trim() || `${c.name} ${c.party}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <PageHead title="Candidates and parties" crumbs={[{ label: "Elections" }, { label: "Candidates and parties" }]}
        lede="One window for nominations and campaign permissions, handled in the order they arrive, and a public place to look up who is contesting." />
      <section className="section">
        <div className="container">
          <Tabs label="Candidate services" active={tab} onChange={setTab}
            tabs={[{ id: "permissions", label: "Campaign permissions" }, { id: "nomination", label: "Nomination" }, { id: "lookup", label: "Know your candidate" }]} />

          {tab === "permissions" && (
            <div className="split">
              <div>
                {applied ? (
                  <div className="panel" role="status">
                    <h2>Application {applied.id} sent</h2>
                    <p>{applied.title} at {applied.venue || "the stated location"}{applied.date && ` on ${applied.date}`}. The relevant departments will review it in the order received.</p>
                    <button type="button" className="btn btn-quiet" onClick={() => setApplied(null)}>Apply for another</button>
                  </div>
                ) : (
                  <form className="panel portal-form" onSubmit={apply}>
                    <h2>Apply for a permission</h2>
                    <div className="field">
                      <label htmlFor="p-cat">Permission needed</label>
                      <select id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)}>{PERMISSIONS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
                      <span className="hint">Reviewed by: {selected.depts}</span>
                    </div>
                    <div className="form-row">
                      <div className="field"><label htmlFor="p-venue">Location</label><input id="p-venue" value={venue} onChange={(e) => setVenue(e.target.value)} required /></div>
                      <div className="field"><label htmlFor="p-date">Date</label><input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
                    </div>
                    <button className="btn btn-primary" type="submit">Send application</button>
                  </form>
                )}
              </div>
              <div>
                <h2>Applications in the queue</h2>
                <div className="table-wrap"><table>
                  <thead><tr><th>Reference</th><th>Permission</th><th>Status</th></tr></thead>
                  <tbody>{TRACKER.map((t) => (
                    <tr key={t.id}><td className="figure">{t.id}</td><td>{t.category}<br /><small className="muted">{t.applicant}, {t.applied}</small></td>
                      <td><span className={`badge ${t.status === "Approved" ? "badge-ok" : "badge-progress"}`}>{t.status}</span><br /><small className="muted">{t.queue}</small></td></tr>
                  ))}</tbody>
                </table></div>
              </div>
            </div>
          )}

          {tab === "nomination" && (nomId ? (
            <div className="panel" role="status" style={{ maxWidth: 640 }}>
              <h2>Nomination {nomId} filed</h2>
              <p>The returning officer will confirm a scrutiny slot. Keep this reference.</p>
              <button type="button" className="btn btn-quiet" onClick={() => setNomId("")}>File another nomination</button>
            </div>
          ) : (
            <form className="panel portal-form" onSubmit={nominate} style={{ maxWidth: 640 }}>
              <h2>File a nomination</h2>
              <div className="form-row">
                <div className="field"><label htmlFor="n-name">Candidate name</label><input id="n-name" value={nom.name} onChange={set("name")} required /></div>
                <div className="field"><label htmlFor="n-party">Party or independent</label><input id="n-party" value={nom.party} onChange={set("party")} required /></div>
              </div>
              <div className="form-row">
                <div className="field"><label htmlFor="n-ac">Constituency</label><input id="n-ac" value={nom.constituency} onChange={set("constituency")} required /></div>
                <div className="field"><label htmlFor="n-dep">Security deposit</label><input id="n-dep" value={nom.deposit} onChange={set("deposit")} placeholder="Amount in rupees" required /></div>
              </div>
              <label className="check"><input type="checkbox" checked={nom.affidavit} onChange={set("affidavit")} /> The sworn affidavit is ready to upload</label>
              <button className="btn btn-primary" type="submit" disabled={!nom.affidavit}>File nomination</button>
            </form>
          ))}

          {tab === "lookup" && (
            <div className="stack">
              <div className="field" style={{ maxWidth: 420 }}>
                <label htmlFor="c-search">Search by name or party</label>
                <input id="c-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="table-wrap"><table>
                <thead><tr><th>Candidate</th><th>Party</th><th>Declared assets</th><th>Criminal cases</th><th>Education</th></tr></thead>
                <tbody>{found.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.party}</td><td>{c.assets}</td><td>{c.cases}</td><td>{c.education}</td></tr>)}
                  {found.length === 0 && <tr><td colSpan={5}>No candidate matches “{search}”.</td></tr>}</tbody>
              </table></div>
            </div>
          )}
          <p className="muted" style={{ marginTop: 20 }}>Sample data for demonstration. Nothing filed here reaches an election office.</p>
        </div>
      </section>
    </>
  );
}

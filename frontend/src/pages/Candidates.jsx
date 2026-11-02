import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import useGeography from "../hooks/useGeography";
import { SCHEDULE_STEPS, STAGE_LABEL, apiMessage, rupees } from "../config/elections";

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


export default function Candidates() {
  const [tab, setTab] = useState("permissions");
  const [category, setCategory] = useState("rally");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [applied, setApplied] = useState(null);
  const [search, setSearch] = useState("");
  const { states, constituenciesOf } = useGeography();
  const [elections, setElections] = useState([]);
  const [lookup, setLookup] = useState({ electionId: "", state: "", constituency: "" });
  const [list, setList] = useState(null);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    api.get("/public/elections").then(({ data }) => {
      setElections(data.data.items);
      const first = data.data.items[0];
      if (first) setLookup((l) => ({ ...l, electionId: first._id, state: first.states[0] }));
    }).catch(() => setLookupError("Could not load elections."));
  }, []);

  const selected = PERMISSIONS.find((p) => p.id === category);
  const apply = (e) => { e.preventDefault(); setApplied({ id: `CP-2026-${Math.floor(10000 + Math.random() * 90000)}`, title: selected.title, venue, date }); };
  const election = elections.find((e) => e._id === lookup.electionId);
  const findCandidates = async (e) => {
    e.preventDefault(); setLookupError("");
    try { setList((await api.get("/public/candidates", { params: lookup })).data.data); }
    catch (err) { setList(null); setLookupError(apiMessage(err, "Could not load the list.")); }
  };
  const found = (list?.candidates ?? []).filter((c) => !search.trim() || `${c.name} ${c.party}`.toLowerCase().includes(search.trim().toLowerCase()));

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

          {tab === "nomination" && (
            <div className="split">
              <div className="panel">
                <h2>How nominations work</h2>
                <ol>
                  <li>Sign in with your candidate account. Your constituency comes from your registration as a candidate.</li>
                  <li>File between the notification and the last date of nominations, with the Form 26 affidavit summary. You must be at least 25 on the date of scrutiny.</li>
                  <li>The returning officer scrutinises every nomination on the scrutiny date. A rejection always carries a reason.</li>
                  <li>You may withdraw until the last date of withdrawal. The returning officer then publishes the list of contesting candidates, which cannot be changed.</li>
                </ol>
                <Link className="btn btn-primary" to="/candidate">File or track a nomination</Link>
              </div>
              <div>
                <h2>Election schedules</h2>
                {elections.length === 0 && <p>No elections announced.</p>}
                <ul className="rows">{elections.map((e) => (
                  <li key={e._id} style={{ padding: "10px 0" }}><strong>{e.name}</strong> <span className="badge badge-progress">{STAGE_LABEL[e.stage]}</span><br />
                    <small>{SCHEDULE_STEPS.map(([k, label]) => `${label}: ${e.schedule[k]}`).join(" · ")}</small></li>
                ))}</ul>
              </div>
            </div>
          )}

          {tab === "lookup" && (
            <div className="stack">
              <form className="panel portal-form" onSubmit={findCandidates}>
                <div className="form-row" style={{ flexWrap: "wrap" }}>
                  <div className="field"><label htmlFor="c-el">Election</label>
                    <select id="c-el" value={lookup.electionId} onChange={(e) => { const el = elections.find((x) => x._id === e.target.value); setLookup({ electionId: e.target.value, state: el?.states[0] ?? "", constituency: "" }); }}>
                      {elections.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
                    </select></div>
                  <div className="field"><label htmlFor="c-state">State or UT</label>
                    <select id="c-state" value={lookup.state} onChange={(e) => setLookup({ ...lookup, state: e.target.value, constituency: "" })}>
                      {(election?.states ?? states.map((s) => s.name)).map((s) => <option key={s}>{s}</option>)}
                    </select></div>
                  <div className="field"><label htmlFor="c-ac">Constituency</label>
                    <select id="c-ac" value={lookup.constituency} onChange={(e) => setLookup({ ...lookup, constituency: e.target.value })} required>
                      <option value="">Choose</option>
                      {constituenciesOf(lookup.state).map((c) => <option key={c}>{c}</option>)}
                    </select></div>
                </div>
                <button className="btn btn-primary" type="submit">Show candidates</button>
              </form>
              {lookupError && <div className="alert alert-error" role="alert">{lookupError}</div>}
              {list && (list.publishedAt ? (
                <>
                  <p className="muted">List of contesting candidates for {list.constituency}, published by the returning officer on {new Date(list.publishedAt).toLocaleDateString()}. Figures are from each candidate's sworn affidavit.</p>
                  <div className="field" style={{ maxWidth: 420 }}>
                    <label htmlFor="c-search">Search by name or party</label>
                    <input id="c-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <div className="table-wrap"><table>
                    <thead><tr><th>No.</th><th>Candidate</th><th>Party</th><th>Declared assets</th><th>Criminal cases</th><th>Education</th></tr></thead>
                    <tbody>{found.map((c) => <tr key={c.nominationId}><td>{c.serial}</td><td>{c.name}{c.symbol ? <><br /><small>Symbol: {c.symbol}</small></> : null}</td><td>{c.party}</td><td>{rupees(c.affidavit.assets)}</td><td>{c.affidavit.criminalCases ? `${c.affidavit.criminalCases} declared` : "None declared"}</td><td>{c.affidavit.education}</td></tr>)}
                      {found.length === 0 && <tr><td colSpan={6}>No candidate matches “{search}”.</td></tr>}</tbody>
                  </table></div>
                </>
              ) : <p role="status">The returning officer has not published the list of contesting candidates for {list.constituency} yet. It is published after the last date of withdrawal.</p>)}
            </div>
          )}
          <p className="muted" style={{ marginTop: 20 }}>Campaign permissions are sample data for demonstration. Elections and candidates come from this prototype's records, which are synthetic.</p>
        </div>
      </section>
    </>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import useGeography from "../hooks/useGeography";
import { apiMessage } from "../config/elections";

// Search the electoral roll by EPIC number, by name (with optional filters), or by the part and
// serial number printed on a voter slip. Shows the entry's particulars, its polling station, and
// where the data comes from. Nothing on this page changes the roll: corrections are made through
// Forms 6, 7 and 8, which a BLO verifies and the ERO decides.

const FACILITIES = { ramp: "Ramp", wheelchair: "Wheelchair", drinkingWater: "Drinking water", toilet: "Toilet", shade: "Shade", signage: "Signage" };
const CHECKS = [
  { id: "name", q: "My name is spelt correctly", fix: { to: "/voters/forms/form-8", label: "Correct it with Form 8" } },
  { id: "relative", q: "My father's, mother's or spouse's name is correct", fix: { to: "/voters/forms/form-8", label: "Correct it with Form 8" } },
  { id: "age", q: "My age and gender are correct", fix: { to: "/voters/forms/form-8", label: "Correct it with Form 8" } },
  { id: "station", q: "The polling station is near where I live now", fix: { to: "/voters/forms/form-8", label: "Moved? Shift with Form 8" } },
  { id: "card", q: "I have my EPIC (voter ID card) or e-EPIC", fix: { to: "/voters/forms/form-8", label: "Ask for a replacement with Form 8" } },
  { id: "once", q: "I am registered only once", fix: { to: "/voters/forms/form-7", label: "Remove the extra entry with Form 7" } },
];
const CHECK_KEY = "roll-checklist";
const readChecks = () => { try { return JSON.parse(localStorage.getItem(CHECK_KEY) || "{}"); } catch { return {}; } };
const date = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;

export default function ElectoralRoll() {
  const { states, districtsOf, constituenciesOf } = useGeography();
  const [method, setMethod] = useState("epic");
  const [f, setF] = useState({ epic: "", name: "", relativeName: "", state: "", district: "", assemblyConstituency: "", gender: "", age: "", partNumber: "", serialNumber: "" });
  const [items, setItems] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState(readChecks);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: k === "epic" ? e.target.value.toUpperCase() : e.target.value, ...(k === "state" ? { district: "", assemblyConstituency: "" } : k === "district" ? { assemblyConstituency: "" } : {}) }));

  const search = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setItems(null); setChosen(null);
    const body = method === "epic" ? { method, epic: f.epic.trim() }
      : method === "part" ? { method, state: f.state, assemblyConstituency: f.assemblyConstituency, partNumber: f.partNumber.trim(), serialNumber: f.serialNumber.trim() }
        : { method, name: f.name.trim(), state: f.state, district: f.district || undefined, relativeName: f.relativeName.trim() || undefined, gender: f.gender || undefined, age: f.age ? Number(f.age) : undefined };
    try {
      const { data } = await api.post("/electors/search", body);
      const list = data.items ?? (data.data ? [data.data] : []);
      setItems(list);
      if (list.length === 1) setChosen(list[0]);
    } catch (err) {
      setError(err.response?.status === 404 ? "No matching entry was found. Check the spelling, try fewer details, or search by EPIC number." : apiMessage(err, "The roll could not be searched just now. Try again."));
    } finally { setBusy(false); }
  };

  const mark = (id, value) => {
    const mine = { ...(checks[chosen.epic] ?? {}), [id]: value };
    const next = { ...checks, [chosen.epic]: mine };
    setChecks(next);
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const stateSelect = (
    <div className="field"><label htmlFor="er-state">State / UT</label>
      <select id="er-state" value={f.state} onChange={set("state")} required><option value="">Select</option>{states.map((s) => <option key={s.name}>{s.name}</option>)}</select></div>
  );
  const e = chosen;
  const st = e?.station;
  const mine = e ? checks[e.epic] ?? {} : {};

  return (
    <>
      <PageHead title="Search the electoral roll" crumbs={[{ label: "Voters" }, { label: "Electoral roll" }]}
        lede="Check that your name is on the roll, see your polling station, and find out how to correct an entry." />
      <section className="section">
        <div className="container stack">
          <Tabs label="Search by" active={method} onChange={(m) => { setMethod(m); setError(""); setItems(null); setChosen(null); }}
            tabs={[{ id: "epic", label: "EPIC number" }, { id: "details", label: "Name and details" }, { id: "part", label: "Part and serial number" }]} />

          <form className="panel portal-form" onSubmit={search} style={{ maxWidth: 760 }}>
            {method === "epic" && (
              <div className="field"><label htmlFor="er-epic">EPIC number</label>
                <input id="er-epic" value={f.epic} onChange={set("epic")} placeholder="ABC1234567" maxLength={10} required autoComplete="off" />
                <p className="muted" style={{ fontSize: ".85rem", margin: "4px 0 0" }}>Printed on your voter ID card: three letters and seven digits.</p></div>
            )}
            {method === "details" && (
              <>
                <div className="form-row">
                  <div className="field"><label htmlFor="er-name">Your name</label><input id="er-name" value={f.name} onChange={set("name")} required /></div>
                  {stateSelect}
                </div>
                <details style={{ marginBottom: 12 }}>
                  <summary className="muted" style={{ cursor: "pointer" }}>Narrow the search (optional)</summary>
                  <div className="form-row" style={{ marginTop: 10 }}>
                    <div className="field"><label htmlFor="er-district">District</label>
                      <select id="er-district" value={f.district} onChange={set("district")}><option value="">Any</option>{districtsOf(f.state).map((d) => <option key={d.name}>{d.name}</option>)}</select></div>
                    <div className="field"><label htmlFor="er-rel">Father's, mother's or spouse's name</label><input id="er-rel" value={f.relativeName} onChange={set("relativeName")} /></div>
                  </div>
                  <div className="form-row">
                    <div className="field"><label htmlFor="er-gender">Gender</label>
                      <select id="er-gender" value={f.gender} onChange={set("gender")}><option value="">Any</option><option value="female">Female</option><option value="male">Male</option><option value="third_gender">Third gender</option></select></div>
                    <div className="field"><label htmlFor="er-age">Age (within 2 years)</label><input id="er-age" type="number" min={18} max={120} value={f.age} onChange={set("age")} /></div>
                  </div>
                </details>
              </>
            )}
            {method === "part" && (
              <>
                <div className="form-row">
                  {stateSelect}
                  <div className="field"><label htmlFor="er-ac">Assembly constituency</label>
                    <select id="er-ac" value={f.assemblyConstituency} onChange={set("assemblyConstituency")} required><option value="">Select</option>{constituenciesOf(f.state).map((c) => <option key={c}>{c}</option>)}</select></div>
                </div>
                <div className="form-row">
                  <div className="field"><label htmlFor="er-part">Part number</label><input id="er-part" inputMode="numeric" value={f.partNumber} onChange={set("partNumber")} required /></div>
                  <div className="field"><label htmlFor="er-serial">Serial number in the part</label><input id="er-serial" inputMode="numeric" value={f.serialNumber} onChange={set("serialNumber")} required /></div>
                </div>
                <p className="muted" style={{ fontSize: ".85rem", marginTop: 0 }}>Both numbers are printed on your voter information slip.</p>
              </>
            )}
            <button className="btn btn-primary" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
          </form>

          {error && <div className="alert alert-error" role="alert">{error}</div>}

          {items?.length > 1 && !chosen && (
            <div className="panel" role="status">
              <h2 style={{ marginTop: 0 }}>{items.length} entries match</h2>
              <p className="muted">Choose yours. Use the filters to narrow the list if you do not see it.</p>
              <ul className="rows">{items.map((x) => (
                <li key={x.epic}><button type="button" className="row-link" style={{ width: "100%", background: "none", border: 0, textAlign: "left", font: "inherit" }} onClick={() => setChosen(x)}>
                  <span translate="no"><strong>{x.name}</strong><small>{x.relativeName ? `${x.relationType ? `${x.relationType} ` : ""}${x.relativeName} · ` : ""}{x.age ? `${x.age} years · ` : ""}{x.assemblyConstituency}, part {x.partNumber}</small></span>
                  <span className="go">View</span></button></li>
              ))}</ul>
            </div>
          )}

          {e && (
            <div className="split">
              <article className="panel" role="status">
                {items?.length > 1 && <button type="button" className="link-button" onClick={() => setChosen(null)}>← All {items.length} matches</button>}
                <h2 style={{ marginTop: 4 }} translate="no">{e.name}</h2>
                <p>{e.isActive === false ? <span className="badge badge-rejected">Not active on the roll</span> : <span className="badge badge-verified">On the roll</span>}</p>
                <dl className="facts">
                  <dt>EPIC number</dt><dd translate="no">{e.epic}</dd>
                  {e.relativeName && <><dt>{e.relationType ? `${e.relationType[0].toUpperCase()}${e.relationType.slice(1)}` : "Relative"}</dt><dd>{e.relativeName}</dd></>}
                  {e.age && <><dt>Age</dt><dd>{e.age}</dd></>}
                  {e.gender && <><dt>Gender</dt><dd style={{ textTransform: "capitalize" }}>{e.gender.replace("_", " ")}</dd></>}
                  <dt>Constituency</dt><dd>{e.assemblyConstituency}{e.district ? `, ${e.district}` : ""}, {e.state}</dd>
                  <dt>Part / serial</dt><dd>Part {e.partNumber ?? "—"}, serial {e.serialNumber ?? "—"}</dd>
                  {e.address && <><dt>Address</dt><dd translate="no">{e.address}{e.pinCode ? ` – ${e.pinCode}` : ""}</dd></>}
                </dl>

                <h3>Polling station</h3>
                {st ? (
                  <>
                    <p style={{ marginBottom: 4 }}><strong translate="no">{st.name}</strong>{st.partNumber ? ` (part ${st.partNumber})` : ""}</p>
                    <p className="muted" style={{ marginTop: 0 }} translate="no">{st.address}</p>
                    {st.accessibility && <div className="pill-cloud" style={{ marginBottom: 8 }}>{Object.entries(FACILITIES).filter(([k]) => st.accessibility[k]).map(([k, label]) => <span key={k} className="chip">{label}</span>)}</div>}
                    <div className="cluster">
                      {st.location && <a className="btn btn-secondary btn-small" href={`https://www.google.com/maps/dir/?api=1&destination=${st.location.lat},${st.location.lng}`} target="_blank" rel="noreferrer">Directions</a>}
                      <Link className="btn btn-quiet btn-small" to="/map">See on the map</Link>
                    </div>
                  </>
                ) : <p className="muted">{e.pollingStation || "The polling station for this part has not been published yet."}</p>}

                {e.source && <p className="muted" style={{ fontSize: ".85rem", marginTop: 16, marginBottom: 0 }}>Source: {e.source.label}{e.source.publishedAt ? ` · last updated ${date(e.source.publishedAt)}` : ""}</p>}
              </article>

              <aside className="stack">
                <div className="panel">
                  <h2 style={{ marginTop: 0 }}>My electoral information checklist</h2>
                  <p className="muted" style={{ fontSize: ".9rem" }}>If this is your entry, go through these. Your answers stay on this device and do not change the roll.</p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                    {CHECKS.map((c) => (
                      <li key={c.id} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <span>{c.q}</span>
                          <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button type="button" className="chip" aria-pressed={mine[c.id] === "yes"} onClick={() => mark(c.id, "yes")}>Yes</button>
                            <button type="button" className="chip" aria-pressed={mine[c.id] === "no"} onClick={() => mark(c.id, "no")}>No</button>
                          </span>
                        </div>
                        {mine[c.id] === "no" && <Link to={c.fix.to} style={{ fontSize: ".9rem" }}>{c.fix.label} →</Link>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="panel">
                  <h2 style={{ marginTop: 0 }}>Something wrong in the roll?</h2>
                  <ul style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
                    <li>Not on the roll: apply with <Link to="/register">Form 6</Link>.</li>
                    <li>Wrong details, moved house, or lost card: <Link to="/voters/forms/form-8">Form 8</Link>.</li>
                    <li>A duplicate entry, or someone who has died or moved away: object with <Link to="/voters/forms/form-7">Form 7</Link>. The person is given notice and the BLO checks before the ERO decides.</li>
                  </ul>
                  <p className="muted" style={{ fontSize: ".85rem", marginBottom: 0 }}>Not sure which? Ask <Link to="/voters">Voter Mitra</Link> or call 1950.</p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

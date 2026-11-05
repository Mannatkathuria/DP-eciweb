import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import { STATES, stateBySlug } from "../config/states";

let geographyCache = null;

/** Every State and Union Territory gets this same page, filled from the geography dataset. */
export default function StatePortal() {
  const { slug } = useParams();
  const state = stateBySlug(slug);
  const [geography, setGeography] = useState(geographyCache);
  const [failed, setFailed] = useState(false);
  const [district, setDistrict] = useState("");

  useEffect(() => {
    if (geographyCache) return;
    api.get("/auth/geography")
      .then(({ data }) => { geographyCache = data.data; setGeography(geographyCache); })
      .catch(() => setFailed(true));
  }, []);

  const entry = useMemo(() => geography?.states?.find((s) => s.name === state?.name), [geography, state]);
  useEffect(() => { setDistrict(""); }, [slug]);

  if (!state) return <Navigate to="/states" replace />;

  const districts = entry?.districts ?? [];
  const chosen = districts.find((d) => d.name === district);
  const constituencyCount = districts.reduce((sum, d) => sum + (d.constituencies?.length ?? 0), 0);

  return (
    <>
      <PageHead title={`Chief Electoral Officer, ${state.label}`} crumbs={[{ label: "States", to: "/states" }, { label: state.label }]}
        lede={`The election office for ${state.label}: its districts and assembly constituencies, and where to find the services that apply to voters here.`} />
      <section className="section">
        <div className="container split">
          <div className="stack">
            <div className="panel">
              <h2>{state.label} at a glance</h2>
              {failed && <div className="alert alert-warn">The district list could not be loaded. Check the connection and reload the page.</div>}
              {!entry && !failed && <p className="muted">Loading districts…</p>}
              {entry && (
                <dl className="facts">
                  <dt>Districts</dt><dd className="figure">{districts.length}</dd>
                  <dt>Assembly constituencies</dt><dd className="figure">{constituencyCount || "Not listed"}</dd>
                </dl>
              )}
            </div>

            {entry && (
              <div className="panel">
                <h2>Districts</h2>
                <div className="field" style={{ maxWidth: 360 }}>
                  <label htmlFor="district">Choose a district</label>
                  <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)}>
                    <option value="">Select a district</option>
                    {districts.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                {chosen ? (
                  <div style={{ marginTop: 18 }}>
                    <h3>{chosen.name}: {chosen.constituencies?.length ?? 0} assembly constituenc{(chosen.constituencies?.length ?? 0) === 1 ? "y" : "ies"}</h3>
                    <ul className="perm-list">{(chosen.constituencies ?? []).map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                ) : <p className="muted" style={{ marginTop: 14 }}>Pick a district to see its constituencies.</p>}
              </div>
            )}
          </div>

          <aside className="stack">
            <div className="panel">
              <h2>Voter services in {state.label}</h2>
              <p className="muted">The same services apply in every State and Union Territory. Choose your state and district when you apply.</p>
              <div className="cluster">
                <Link className="btn btn-primary" to="/electoral-roll">Search the roll</Link>
                <Link className="btn btn-quiet" to="/voters">Voter Mitra</Link>
              </div>
            </div>
            <div className="panel">
              <h2>Contact</h2>
              <p>Voter helpline <strong>1950</strong>. It reaches the district election office for your area.</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

export function StatesIndex() {
  return (
    <>
      <PageHead title="State and Union Territory election offices" lede="Each State and Union Territory has a Chief Electoral Officer who supervises election work there." crumbs={[{ label: "States" }]} />
      <section className="section">
        <div className="container">
          <ul className="rows" style={{ columnWidth: "280px", columnGap: 32 }}>
            {STATES.map((s) => (
              <li key={s.slug} style={{ breakInside: "avoid" }}><Link className="row-link" to={`/states/${s.slug}`}><strong>{s.label}</strong><span className="go">Open</span></Link></li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

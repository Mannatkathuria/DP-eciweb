import { useContext } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import PageHead from "../components/PageHead";
import useRoleCatalog from "../hooks/useRoleCatalog";
import { GROUPS, homeFor, roleById } from "../config/roles";
import { permissionText } from "../config/permissions";
import { STATES } from "../config/states";

const SCOPE_LABEL = { state: "State", district: "District", constituency: "Constituency", pollingStation: "Polling station", election: "Election" };

// Public pages that are useful from each kind of role.
const RELATED = {
  citizen: [["/candidates", "Candidates and parties"], ["/results", "Results and counting"]],
  roll: [["/electoral-roll", "Electoral roll search"], ["/check-request", "Application status"]],
  conduct: [["/results", "Results and counting"], ["/report-violation", "Report a violation"]],
  polling: [["/results", "Results and counting"]],
  district: [["/report-violation", "Report a violation"], ["/results", "Results and counting"]],
  state: [["/states", "State election offices"], ["/results", "Results and counting"]],
  national: [["/states", "State election offices"], ["/roles", "Roles and access"]],
  observer: [["/results", "Results and counting"], ["/report-violation", "Report a violation"]]
};

/** The signed-in section for every role that does not have a dedicated screen yet. */
export default function Workspace() {
  const { logged, userData } = useContext(AuthContext);
  const { roles } = useRoleCatalog();

  if (!logged || !userData) return <Navigate to="/signin" replace />;
  const target = homeFor(userData.role);
  if (target !== "/workspace") return <Navigate to={target} replace />;

  const role = roleById(userData.role);
  const permissions = roles.find((r) => r.id === userData.role)?.permissions ?? [];
  const jurisdiction = userData.jurisdiction ?? {};
  const group = GROUPS.find((g) => g.id === role?.group);
  const stateEntry = STATES.find((s) => s.name === jurisdiction.state);

  return (
    <>
      <PageHead title={role?.label ?? "Your section"} lede={role?.blurb} crumbs={[{ label: group?.label ?? "Workspace" }]} />
      <section className="section">
        <div className="container split">
          <div className="stack">
            <div className="panel">
              <h2>Your assignment</h2>
              <dl className="facts">
                <dt>Name</dt><dd>{userData.name || "Not recorded"}</dd>
                <dt>Identifier</dt><dd>{userData.epic}</dd>
                <dt>Role</dt><dd>{role?.label}</dd>
                {Object.entries(jurisdiction).map(([key, value]) => (
                  <div key={key} style={{ display: "contents" }}><dt>{SCOPE_LABEL[key] ?? key}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </div>

            <div className="panel">
              <h2>What this role may do</h2>
              {permissions.length ? (
                <ul className="perm-list">{permissions.map((p) => <li key={p}>{permissionText(p)}</li>)}</ul>
              ) : <p className="muted">The permission list could not be loaded. Try again shortly.</p>}
              <div className="alert alert-warn" style={{ marginTop: 16 }}>
                <strong>Work screens for this role are not connected yet.</strong>
                You are signed in and your assignment is recorded. The tools listed above will appear here as they are built.
              </div>
            </div>
          </div>

          <aside className="panel">
            <h2>Useful pages</h2>
            <ul className="rows">
              {[...(stateEntry ? [[`/states/${stateEntry.slug}`, `${stateEntry.label} election office`]] : []), ...(RELATED[role?.group] ?? [])].map(([to, label]) => (
                <li key={to}><Link className="row-link" to={to}><strong>{label}</strong></Link></li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </>
  );
}

import { useMemo, useState } from "react";
import PageHead from "../components/PageHead";
import useRoleCatalog from "../hooks/useRoleCatalog";
import { GROUPS, ROLES } from "../config/roles";
import { permissionText } from "../config/permissions";

const LEVELS = [
  ["National", "Election Commission of India: the Chief Election Commissioner and Election Commissioners, and the secretariat."],
  ["State", "Chief Electoral Officer, with nodal officers for particular functions."],
  ["District", "District Election Officer, with nodal officers across 16 functions such as training, transport and EVM management."],
  ["Constituency", "Two parallel tracks. Roll: Electoral Registration Officer, Assistants, Booth Level Officers. Conduct: Returning Officer, Assistants, Sector Officers."],
  ["Polling station", "Presiding Officer and polling officers. A standard polling party has one presiding officer and three polling officers."]
];

export default function Roles() {
  const { roles, loading, failed } = useRoleCatalog();
  const [group, setGroup] = useState("all");
  const byId = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const shown = ROLES.filter((r) => group === "all" || r.group === group);

  return (
    <>
      <PageHead title="Roles and access" crumbs={[{ label: "Information" }, { label: "Roles and access" }]}
        lede="Who takes part in an election, where they sit, and what each role is allowed to do on this platform." />
      <section className="section">
        <div className="container stack">
          <div className="panel">
            <h2>How the administration is arranged</h2>
            <dl className="facts">{LEVELS.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd style={{ fontWeight: 400 }}>{v}</dd></div>)}</dl>
            <div className="alert" style={{ marginTop: 16 }}>
              <strong>Two roles that are easy to confuse.</strong>
              The electoral registration officer maintains the roll. The returning officer conducts the election itself. A booth level officer is a government appointee; a booth level agent is appointed by a political party.
            </div>
          </div>

          <div>
            <h2>Roles and their permissions</h2>
            <div className="role-tabs" role="group" aria-label="Filter by group">
              <button type="button" className="chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>All</button>
              {GROUPS.map((g) => <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.label}</button>)}
            </div>
            {failed && <div className="alert alert-warn">Permissions could not be loaded. The role list below is still accurate.</div>}
            {loading && <p className="muted">Loading permissions…</p>}
            <div className="table-wrap"><table className="matrix">
              <thead><tr><th>Role</th><th>What it is for</th><th>May do</th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.label}</strong></td>
                  <td>{r.blurb}</td>
                  <td><ul>{(byId[r.id]?.permissions ?? []).map((p) => <li key={p} className="badge">{permissionText(p)}</li>)}</ul></td>
                </tr>
              ))}</tbody>
            </table></div>
            <p className="muted" style={{ marginTop: 14 }}>One person can hold more than one role, in different places. Observers report on what they see; they cannot edit the records of the officers they observe. Panchayat and municipal elections are run by State Election Commissions, not through this hierarchy.</p>
          </div>
        </div>
      </section>
    </>
  );
}

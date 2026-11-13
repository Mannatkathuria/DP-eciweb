import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageHead from "../components/PageHead";
import { GROUPS, ROLES, signInPath } from "../config/roles";
import { useTr } from "../i18n";

/** One place to find the sign-in page for any role. Filter by group or by typing part of a role name. */
export default function SignInHub() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const group = params.get("group") || "all";
  const tr = useTr();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Match the English wording and the wording in the chosen language.
    const has = (text) => text.toLowerCase().includes(q) || tr(text).toLowerCase().includes(q);
    return ROLES.filter((r) => (group === "all" || r.group === group) && (!q || has(r.label) || has(r.blurb)));
  }, [group, query, tr]);

  const choose = (id) => { const next = new URLSearchParams(params); id === "all" ? next.delete("group") : next.set("group", id); setParams(next, { replace: true }); };

  return (
    <>
      <PageHead title="Sign in" lede="Each role has its own sign-in page and its own section. Pick yours to continue." crumbs={[{ label: "Sign in" }]} />
      <section className="section">
        <div className="container">
          <div className="field role-search">
            <label htmlFor="role-search">Search for your role</label>
            <input id="role-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example: presiding, observer, district" />
          </div>

          <div className="role-tabs" role="group" aria-label="Filter by group">
            <button type="button" className="chip" aria-pressed={group === "all"} onClick={() => choose("all")}>All roles</button>
            {GROUPS.map((g) => (
              <button key={g.id} type="button" className="chip" aria-pressed={group === g.id} onClick={() => choose(g.id)}>{g.label}</button>
            ))}
          </div>

          {group !== "all" && <p className="muted">{GROUPS.find((g) => g.id === group)?.blurb}</p>}

          {visible.length === 0 ? (
            <div className="alert">{tr("No role matches “{{query}}”. Try a shorter word, or choose All roles.", { query })}</div>
          ) : (
            <ul className="rows" aria-live="polite">
              {visible.map((r) => (
                <li key={r.id}>
                  <Link className="row-link" to={signInPath(r.id)}>
                    <span><strong>{r.label}</strong><small>{r.blurb}</small></span>
                    <span className="go">Sign in</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

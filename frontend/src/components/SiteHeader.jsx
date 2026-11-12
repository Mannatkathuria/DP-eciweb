import { useContext, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import { NAV } from "../config/navigation";
import { GROUPS, rolesInGroup, homeFor, signInPath } from "../config/roles";
import { STATES } from "../config/states";
import EciEmblem from "./EciEmblem";
import { LANGUAGES } from "../languages";
import { setLanguage } from "../i18n";


function UtilityBar() {
  const { i18n } = useTranslation();
  const { dark, setDark } = useContext(AuthContext);
  const [scale, setScale] = useState(1);
  const [contrast, setContrast] = useState(false);

  const applyScale = (next) => {
    const value = Math.min(1.25, Math.max(0.85, Math.round(next * 100) / 100));
    setScale(value);
    document.documentElement.style.setProperty("--scale", value);
  };
  const toggleContrast = () => {
    document.body.classList.toggle("high-contrast", !contrast);
    setContrast(!contrast);
  };

  return (
    <div className="utility">
      <div className="container">
        <div className="utility-group">
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <a href="tel:1950"><strong>Voter helpline 1950</strong></a>
        </div>
        <div className="utility-group">
          <span className="size-controls" role="group" aria-label="Text size">
            <button type="button" onClick={() => applyScale(scale - 0.08)} aria-label="Smaller text">A-</button>
            <button type="button" onClick={() => applyScale(1)} aria-label="Default text size">A</button>
            <button type="button" onClick={() => applyScale(scale + 0.08)} aria-label="Larger text">A+</button>
          </span>
          <button type="button" aria-pressed={contrast} onClick={toggleContrast}>High contrast</button>
          <button type="button" aria-pressed={dark} onClick={() => setDark(!dark)}>Dark theme</button>
          <label className="sr-only" htmlFor="site-language">Language</label>
          <select id="site-language" value={i18n.resolvedLanguage || "en"} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(({ code, label }) => <option key={code} value={code} translate="no">{label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function SiteHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logged, userData, logout } = useContext(AuthContext);
  const [open, setOpen] = useState(null);       // id of the open dropdown
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef(null);

  // Close menus after navigating, on Escape, and on a click outside the header.
  useEffect(() => { setOpen(null); setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    const onClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  const toggle = (id) => setOpen((current) => (current === id ? null : id));
  const isIn = (paths) => paths.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));

  const dropdown = (item) => {
    const id = item.label;
    const current = item.states ? isIn(["/states"]) : isIn(item.items.map((i) => i.to));
    return (
      <li className="nav-item" key={id}>
        <button type="button" className={`nav-trigger ${current ? "is-current" : ""}`} aria-expanded={open === id} aria-haspopup="true" onClick={() => toggle(id)}>
          {item.label}
        </button>
        {open === id && (item.states ? (
          <div className="menu-panel menu-states">
            <Link className="menu-all" to="/states">All states and Union Territories</Link>
            {STATES.map((s) => <Link key={s.slug} to={`/states/${s.slug}`} aria-current={location.pathname === `/states/${s.slug}` ? "page" : undefined}>{s.label}</Link>)}
          </div>
        ) : (
          <div className="menu-panel">
            {item.items.map((i) => (
              <Link key={i.to + i.label} to={i.to} aria-current={location.pathname === i.to ? "page" : undefined}>
                {i.label}{i.note && <small>{i.note}</small>}
              </Link>
            ))}
          </div>
        ))}
      </li>
    );
  };

  return (
    <header className="site-header" ref={rootRef}>
      <UtilityBar />
      <div className="container masthead">
        <Link to="/" className="brand" aria-label="Election Commission of India, home">
          <EciEmblem size={48} />
          <span>
            <span className="brand-name">Election Commission of India</span>
            <span className="brand-hi">भारत निर्वाचन आयोग</span>
          </span>
        </Link>

        <button type="button" className="nav-toggle" aria-expanded={mobileOpen} aria-controls="main-nav" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? "Close" : "Menu"}
        </button>

        <nav id="main-nav" className={`main-nav ${mobileOpen ? "is-open" : ""}`} aria-label="Main">
          <ul className="nav-list">
            {NAV.map((item) => (item.items || item.states) ? dropdown(item) : (
              <li className="nav-item" key={item.to}>
                <NavLink to={item.to} className="nav-link">{item.label}</NavLink>
              </li>
            ))}

            <li className="nav-item">
              {logged && userData ? (
                <span className="nav-user">
                  <Link className="nav-link" to={homeFor(userData.role)}>My section</Link>
                  <button type="button" className="btn btn-quiet btn-small" onClick={async () => { await logout(); navigate("/home"); }}>Sign out</button>
                  <button type="button" className="btn btn-quiet btn-small" title="Ends this account's sessions on every device" onClick={async () => { await logout({ everywhere: true }); navigate("/home"); }}>Sign out everywhere</button>
                </span>
              ) : (
                <>
                  <button type="button" className="nav-trigger nav-signin" aria-expanded={open === "signin"} aria-haspopup="true" onClick={() => toggle("signin")}>Sign in</button>
                  {open === "signin" && (
                    <div className="menu-panel menu-mega align-right">
                      <Link className="menu-all" to="/signin">Find your sign-in page</Link>
                      {GROUPS.map((group) => (
                        <div className="menu-group" key={group.id}>
                          <h4>{group.label}</h4>
                          {rolesInGroup(group.id).map((r) => <Link key={r.id} to={signInPath(r.id)}>{r.label}</Link>)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

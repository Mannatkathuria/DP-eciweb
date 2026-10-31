import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import EciEmblem from "./EciEmblem";
import GovAccessibilityBar from "./GovAccessibilityBar";
import "./GovHeader.css";

export default function GovHeader() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portalDropdownOpen, setPortalDropdownOpen] = useState(false);

  const navLinks = [
    { label: "Home", path: "/", icon: "🏛️" },
    { label: "Voter Services", path: "/voters", icon: "🗳️", badge: "SSR 2026" },
    { label: "cVIGIL (100-Min)", path: "/cvigil", icon: "🚨", badge: "MCC Live" },
    { label: "Suvidha Portal", path: "/suvidha", icon: "🚩" },
    { label: "ENCORE & Results", path: "/encore", icon: "📊" },
    { label: "CEO Himachal", path: "/ceo-himachal", icon: "🏔️", badge: "State" },
    { label: "Workflow Blueprints", path: "/workflows", icon: "⚡" },
    { label: "Media & SVEEP", path: "/media-publications", icon: "📰" }
  ];

  const portals = [
    { label: "Voter Sign-In", path: "/login", desc: "Citizen EPIC & OTP Login" },
    { label: "New Voter Registration (Form 6)", path: "/register", desc: "Apply for inclusion in electoral roll" },
    { label: "Electoral Roll Search", path: "/electoral-roll", desc: "Search by EPIC / Details" },
    { label: "Track Application Status", path: "/check-request", desc: "Check status of Form 6/7/8" },
    { label: "BLO Workdesk", path: "/blo/login", desc: "Booth Level Officer login & verification" },
    { label: "ECI Official Console", path: "/eci/login", desc: "Election Commission operations" },
    { label: "Admin Console", path: "/admin", desc: "Constituency & booth management" }
  ];

  const isActive = (path) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="gov-header-wrapper" role="banner">
      <GovAccessibilityBar />

      {/* Main Government Masthead */}
      <div className="gov-masthead">
        <div className="gov-masthead-container">
          <Link to="/" className="gov-brand-container" title="Election Commission of India">
            <EciEmblem size={64} className="gov-emblem" />
            <div className="gov-titles">
              <span className="gov-hindi-title">भारत निर्वाचन आयोग</span>
              <h1 className="gov-english-title">ELECTION COMMISSION OF INDIA</h1>
              <p className="gov-sub-tagline">
                Constitutional Authority Under Article 324 of the Constitution of India
              </p>
            </div>
          </Link>

          <div className="gov-masthead-right">
            <div className="gov-seal-badge" title="Official Government of India Portal">
              <span className="gov-badge-icon">🇮🇳</span>
              <div className="gov-badge-text">
                <strong>Digital India</strong>
                <span>Unified Electoral Portal</span>
              </div>
            </div>

            {/* Quick Portals Dropdown Button */}
            <div className="gov-portals-menu-wrapper">
              <button
                type="button"
                className="gov-portal-select-btn"
                onClick={() => setPortalDropdownOpen(!portalDropdownOpen)}
                aria-expanded={portalDropdownOpen}
                aria-haspopup="true"
              >
                <span>🔐 Portals & Logins</span>
                <span className="gov-caret">{portalDropdownOpen ? "▲" : "▼"}</span>
              </button>

              {portalDropdownOpen && (
                <div className="gov-portals-dropdown" role="menu">
                  <div className="gov-portals-dropdown-header">
                    <strong>Select Official Portal / Action</strong>
                  </div>
                  {portals.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className="gov-portal-item"
                      role="menuitem"
                      onClick={() => setPortalDropdownOpen(false)}
                    >
                      <div className="gov-portal-item-title">{item.label}</div>
                      <div className="gov-portal-item-desc">{item.desc}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              className="gov-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className="gov-hamburger-bar"></span>
              <span className="gov-hamburger-bar"></span>
              <span className="gov-hamburger-bar"></span>
            </button>
          </div>
        </div>
      </div>

      {/* Tricolor Ribbon Bar */}
      <div className="gov-tricolor-bar" aria-hidden="true"></div>

      {/* Primary Navigation Ribbon */}
      <nav className={`gov-main-nav ${mobileMenuOpen ? "open" : ""}`} aria-label="Main Navigation">
        <div className="gov-nav-container">
          <ul className="gov-nav-list">
            {navLinks.map((item) => (
              <li key={item.path} className="gov-nav-item">
                <Link
                  to={item.path}
                  className={`gov-nav-link ${isActive(item.path) ? "active" : ""}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="gov-nav-icon">{item.icon}</span>
                  <span className="gov-nav-label">{item.label}</span>
                  {item.badge && <span className="gov-nav-badge">{item.badge}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}

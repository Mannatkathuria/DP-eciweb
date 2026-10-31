import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./CvigilPortal.css";

const violationCategories = [
  { id: "cash", label: "Distribution of Cash / Bribery", icon: "💰", severity: "High" },
  { id: "liquor", label: "Distribution of Liquor / Freebies", icon: "🍾", severity: "High" },
  { id: "speaker", label: "Loudspeakers Beyond Permitted Hours (after 10 PM)", icon: "📢", severity: "Medium" },
  { id: "hate_speech", label: "Hate Speech / Communal / Religious Appeal", icon: "⚠️", severity: "Critical" },
  { id: "banner", label: "Unauthorized Banners / Defacement of Property", icon: "🪧", severity: "Medium" },
  { id: "weapons", label: "Carrying Firearms / Voter Intimidation", icon: "🚨", severity: "Critical" },
  { id: "paid_news", label: "Paid News / Uncertified Advertisements", icon: "📰", severity: "Medium" }
];

const mockIncidents = [
  {
    id: "CV-2026-DL-0842",
    category: "Distribution of Cash / Bribery",
    location: "Near Bus Terminal, Vikaspuri (Lat: 28.6328, Long: 77.0682)",
    reportedAt: "Today, 14:15 IST",
    slaRemaining: "42 Mins",
    status: "INVESTIGATING",
    assignedTeam: "Flying Squad Team 02 (FST-02)",
    fstStatus: "On Site · Gathering Evidence",
    roDecision: null
  },
  {
    id: "CV-2026-DL-0839",
    category: "Loudspeakers Beyond Permitted Hours",
    location: "Block C Market, Janakpuri (Lat: 28.6214, Long: 77.0871)",
    reportedAt: "Today, 13:40 IST",
    slaRemaining: "Resolved in 68 mins",
    status: "DISPOSED",
    assignedTeam: "Flying Squad Team 05 (FST-05)",
    fstStatus: "Loudspeaker equipment seized; Undertaking taken",
    roDecision: "DISPOSED (Seizure & Warning)"
  },
  {
    id: "CV-2026-DL-0835",
    category: "Unauthorized Banners on Govt Office",
    location: "Main Road, Tilak Nagar (Lat: 28.6365, Long: 77.0964)",
    reportedAt: "Today, 12:10 IST",
    slaRemaining: "Resolved in 52 mins",
    status: "DISPOSED",
    assignedTeam: "Static Surveillance Team 01 (SST-01)",
    fstStatus: "Banners removed by civic team",
    roDecision: "DISPOSED (Banners Removed)"
  }
];

export default function CvigilPortal() {
  const [activeView, setActiveView] = useState("report"); // report | dcc
  const [selectedCategory, setSelectedCategory] = useState("cash");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [description, setDescription] = useState("");
  const [evidenceUploaded, setEvidenceUploaded] = useState(false);
  const [submittedCase, setSubmittedCase] = useState(null);
  const [incidentsList, setIncidentsList] = useState(mockIncidents);
  const [timerSeconds, setTimerSeconds] = useState(6000); // 100 minutes in seconds

  useEffect(() => {
    if (!submittedCase) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [submittedCase]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };

  const handleCitizenSubmit = (e) => {
    e.preventDefault();
    const newCase = {
      id: "CV-2026-DL-" + Math.floor(1000 + Math.random() * 9000),
      category: violationCategories.find((c) => c.id === selectedCategory)?.label,
      location: "Vikaspuri Constituency (Auto GPS: 28.6341° N, 77.0694° E)",
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      isAnonymous
    };
    setSubmittedCase(newCase);
    setTimerSeconds(6000); // 100 mins
    window.scrollTo({ top: 200, behavior: "smooth" });
  };

  const handleRoAction = (id, action) => {
    setIncidentsList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: action, roDecision: `${action} by Returning Officer` } : item
      )
    );
  };

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>cVIGIL 100-Minute SLA MCC Incident Portal</span>
        </div>
      </div>

      <main id="main-content" className="gov-cvigil-main">
        {/* cVIGIL Banner */}
        <section className="gov-cvigil-hero" aria-label="cVIGIL Citizen Action">
          <div className="gov-cvigil-container">
            <div className="gov-cvigil-hero-content">
              <span className="gov-cvigil-badge">ECI CITIZEN VIGILANCE APPLICATION</span>
              <h1 className="gov-cvigil-title">cVIGIL: 100-Minute Action on Violations</h1>
              <p className="gov-cvigil-desc">
                Fast-track reporting of Model Code of Conduct (MCC) and election expenditure violations. Submissions automatically geotag GPS coordinates and deploy nearest Flying Squads for rapid action within 100 minutes.
              </p>
            </div>

            <div className="gov-cvigil-sla-pill">
              <span className="gov-sla-icon">⚡</span>
              <div>
                <strong>100 MINUTES SLA TARGET</strong>
                <span>From Citizen Click to Flying Squad Resolution</span>
              </div>
            </div>
          </div>
        </section>

        {/* View Switcher */}
        <div className="gov-cvigil-switch-bar">
          <div className="gov-cvigil-switch-container">
            <button
              type="button"
              className={`gov-switch-btn ${activeView === "report" ? "active" : ""}`}
              onClick={() => setActiveView("report")}
            >
              📸 Citizen Incident Reporter (Live GPS)
            </button>
            <button
              type="button"
              className={`gov-switch-btn ${activeView === "dcc" ? "active" : ""}`}
              onClick={() => setActiveView("dcc")}
            >
              🛰️ District Control Centre (DCC) & RO Console
            </button>
          </div>
        </div>

        <div className="gov-cvigil-body-container">
          {activeView === "report" ? (
            <div className="gov-report-layout">
              {submittedCase ? (
                <div className="gov-cvigil-success-card">
                  <div className="gov-sla-countdown-box">
                    <span className="gov-countdown-label">100-MINUTE SLA COUNTDOWN</span>
                    <div className="gov-countdown-timer">{formatTimer(timerSeconds)}</div>
                    <span className="gov-countdown-sub">Target resolution time remaining</span>
                  </div>

                  <div className="gov-success-case-info">
                    <span className="gov-badge-green">INCIDENT RECORDED & TRANSMITTED</span>
                    <h2>Case Reference: {submittedCase.id}</h2>
                    <p className="gov-case-loc">📍 {submittedCase.location}</p>
                    <div className="gov-case-details-grid">
                      <div><strong>Violation:</strong> {submittedCase.category}</div>
                      <div><strong>Reported At:</strong> {submittedCase.time} IST</div>
                      <div><strong>Reporting Mode:</strong> {submittedCase.isAnonymous ? "Anonymous Citizen (Protected)" : "Verified Citizen"}</div>
                      <div><strong>DCC Queue Status:</strong> Dispatched to Flying Squad Team 02</div>
                    </div>
                  </div>

                  {/* 100-Minute Process Breakdown */}
                  <div className="gov-100min-breakdown">
                    <h4>Stage-wise Protocol Mandate:</h4>
                    <div className="gov-100min-stages">
                      <div className="stage-item done">
                        <span className="stage-num">05m</span>
                        <strong>Evidence Captured</strong>
                        <span>Citizen live media + GPS</span>
                      </div>
                      <div className="stage-item active">
                        <span className="stage-num">10m</span>
                        <strong>DCC Assignment</strong>
                        <span>Dispatched to nearest FST</span>
                      </div>
                      <div className="stage-item">
                        <span className="stage-num">25m</span>
                        <strong>Field Arrival</strong>
                        <span>FST team reaches site</span>
                      </div>
                      <div className="stage-item">
                        <span className="stage-num">55m</span>
                        <strong>Action & Report</strong>
                        <span>Investigation report uploaded</span>
                      </div>
                      <div className="stage-item">
                        <span className="stage-num">100m</span>
                        <strong>RO Decision</strong>
                        <span>Drop, Dispose, or Escalate</span>
                      </div>
                    </div>
                  </div>

                  <div className="gov-action-center">
                    <button
                      type="button"
                      className="gov-btn-primary"
                      onClick={() => setSubmittedCase(null)}
                    >
                      Report Another Incident
                    </button>
                  </div>
                </div>
              ) : (
                <form className="gov-cvigil-form-card" onSubmit={handleCitizenSubmit}>
                  <div className="gov-form-intro">
                    <h2>Submit MCC Violation Report</h2>
                    <p>Select the nature of violation and provide live evidence. False complaints are punishable under law.</p>
                  </div>

                  {/* Category Picker */}
                  <div className="gov-field-section">
                    <label className="gov-field-label">1. Select Nature of Violation *</label>
                    <div className="gov-categories-grid">
                      {violationCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`gov-cat-tile ${selectedCategory === cat.id ? "selected" : ""}`}
                          onClick={() => setSelectedCategory(cat.id)}
                        >
                          <span className="gov-cat-icon">{cat.icon}</span>
                          <span className="gov-cat-label">{cat.label}</span>
                          <span className={`gov-cat-sev ${cat.severity.toLowerCase()}`}>{cat.severity}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Evidence Upload */}
                  <div className="gov-field-section">
                    <label className="gov-field-label">2. Capture Live Photo / Video Evidence *</label>
                    <div className="gov-evidence-upload-zone">
                      {evidenceUploaded ? (
                        <div className="gov-evidence-preview">
                          <span className="ev-icon">📸</span>
                          <div>
                            <strong>IMG_20261031_141528_GPS.jpg (1.8 MB)</strong>
                            <span className="ev-meta">Watermarked: 28.6341° N, 77.0694° E · 31-10-2026 14:15:28 IST</span>
                          </div>
                          <button
                            type="button"
                            className="gov-btn-remove"
                            onClick={() => setEvidenceUploaded(false)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="gov-upload-prompt">
                          <span className="upload-icon">📷</span>
                          <p>ECI cVIGIL requires live photo/video capture with GPS timestamps.</p>
                          <button
                            type="button"
                            className="gov-btn-secondary"
                            onClick={() => setEvidenceUploaded(true)}
                          >
                            Simulate Live Camera Capture 📸
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Incident Details & GPS */}
                  <div className="gov-field-section">
                    <label className="gov-field-label">3. Location & Description</label>
                    <div className="gov-gps-badge">
                      <span className="gps-pin">📍</span>
                      <div>
                        <strong>Auto-Detected GPS Location:</strong>
                        <span>Vikaspuri Assembly Constituency, West Delhi District (Accuracy: 5m)</span>
                      </div>
                    </div>

                    <div className="gov-input-group mt-12">
                      <label htmlFor="inc-desc">Incident Description / Landmark Details</label>
                      <textarea
                        id="inc-desc"
                        rows={3}
                        placeholder="Provide details such as vehicle number, party flags, or specific address..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                      ></textarea>
                    </div>

                    <label className="gov-anon-toggle">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                      />
                      <span>Report Anonymously (Identity will be hidden from political entities and public record)</span>
                    </label>
                  </div>

                  <button type="submit" className="gov-btn-primary full-width cta-red">
                    Submit to District Control Centre (DCC) 🚨
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* DCC & RO OFFICIAL VIEW */
            <div className="gov-dcc-layout">
              <div className="gov-dcc-header">
                <div>
                  <span className="gov-section-badge">DISTRICT CONTROL CENTRE</span>
                  <h2>Live Incident Queue & RO Decision Console</h2>
                  <p>Real-time incident dispatch, Flying Squad monitoring, and Returning Officer decisions.</p>
                </div>
                <div className="gov-dcc-stats">
                  <div className="dcc-stat"><strong>3</strong> Active Cases</div>
                  <div className="dcc-stat green"><strong>2</strong> Disposed</div>
                  <div className="dcc-stat red"><strong>1</strong> In Progress</div>
                </div>
              </div>

              <div className="gov-incidents-table-card">
                <table className="gov-incidents-table">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Violation Category</th>
                      <th>Location / GPS</th>
                      <th>SLA Status</th>
                      <th>Assigned FST Team</th>
                      <th>RO Statutory Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidentsList.map((inc) => (
                      <tr key={inc.id}>
                        <td>
                          <strong>{inc.id}</strong>
                          <span className="inc-time">{inc.reportedAt}</span>
                        </td>
                        <td>
                          <span className="inc-cat-badge">{inc.category}</span>
                        </td>
                        <td className="inc-loc-cell">{inc.location}</td>
                        <td>
                          <span className={`sla-badge ${inc.status.toLowerCase()}`}>
                            {inc.status === "INVESTIGATING" ? `⏳ ${inc.slaRemaining}` : `✓ ${inc.slaRemaining}`}
                          </span>
                        </td>
                        <td>
                          <strong>{inc.assignedTeam}</strong>
                          <span className="fst-status">{inc.fstStatus}</span>
                        </td>
                        <td>
                          {inc.roDecision ? (
                            <span className="ro-decision-text">{inc.roDecision}</span>
                          ) : (
                            <div className="ro-action-btns">
                              <button
                                type="button"
                                className="ro-btn-dispose"
                                onClick={() => handleRoAction(inc.id, "DISPOSED")}
                              >
                                Dispose (Acted)
                              </button>
                              <button
                                type="button"
                                className="ro-btn-drop"
                                onClick={() => handleRoAction(inc.id, "DROPPED")}
                              >
                                Drop
                              </button>
                              <button
                                type="button"
                                className="ro-btn-escalate"
                                onClick={() => handleRoAction(inc.id, "ESCALATED")}
                              >
                                Escalate
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <GovFooter />
    </div>
  );
}

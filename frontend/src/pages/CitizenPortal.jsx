import { useState } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./CitizenPortal.css";

export default function CitizenPortal() {
  const [activeTab, setActiveTab] = useState("forms");
  const [modalData, setModalData] = useState(null);

  // Status tracking state
  const [trackRefId, setTrackRefId] = useState("REF-2026-90412");
  const [trackingResult, setTrackingResult] = useState(null);

  // e-EPIC state
  const [epicNumber, setEpicNumber] = useState("ABC1234567");
  const [epicState, setEpicState] = useState("DL");
  const [eEpicResult, setEEpicResult] = useState(null);

  // BLO call booking state
  const [bloBooking, setBloBooking] = useState({
    state: "Delhi",
    district: "West",
    ac: "31 - Vikaspuri",
    part: "42 - Community Center",
    phone: "9876543210",
    slot: "Morning (10:00 AM - 01:00 PM)",
    confirmed: false
  });

  // Complaint state
  const [complaintTicket, setComplaintTicket] = useState({
    category: "Voter ID Not Received",
    description: "",
    submitted: false,
    ticketId: ""
  });

  const handleTrackSubmit = (e) => {
    e.preventDefault();
    if (!trackRefId.trim()) return;
    setTrackingResult({
      id: trackRefId,
      formType: "Form 6 (New Voter Registration)",
      applicantName: "Rahul Sharma",
      state: "Delhi (NCT)",
      ac: "31 – Vikaspuri",
      submittedDate: "24 Oct 2026",
      stages: [
        { label: "Form Submitted Online", date: "24 Oct 2026, 11:30 AM", status: "completed" },
        { label: "Assigned to BLO (Ravi Kumar)", date: "25 Oct 2026, 09:15 AM", status: "completed" },
        { label: "Field Verification Completed", date: "28 Oct 2026, 04:45 PM", status: "completed" },
        { label: "ERO Scrutiny & Approval", date: "30 Oct 2026, 02:10 PM", status: "completed" },
        { label: "EPIC Generated (DL/04/031/984210)", date: "31 Oct 2026, 10:00 AM", status: "completed" }
      ],
      currentStatus: "APPROVED",
      epicNumber: "DL0403198421"
    });
  };

  const handleEEpicGenerate = (e) => {
    e.preventDefault();
    if (!epicNumber.trim()) return;
    setEEpicResult({
      epic: epicNumber.toUpperCase(),
      name: "PRIYA VERMA",
      relation: "Suresh Verma (Father)",
      gender: "FEMALE",
      dob: "14/05/1998",
      address: "H.No. 42-B, Pocket-3, Sector 12, Dwarka, New Delhi 110078",
      assembly: "31 – VIKASPURI",
      parliament: "04 – WEST DELHI",
      partName: "42 – Sarvodaya Kanya Vidyalaya, Room 2",
      serialNo: "384",
      issuedOn: "31/10/2026"
    });
  };

  const handleBloBook = (e) => {
    e.preventDefault();
    setBloBooking({ ...bloBooking, confirmed: true });
  };

  const handleComplaintSubmit = (e) => {
    e.preventDefault();
    const id = "NGSP-" + Math.floor(100000 + Math.random() * 900000);
    setComplaintTicket({ ...complaintTicket, submitted: true, ticketId: id });
  };

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb strip */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>Citizen Service Portal (Voters)</span>
        </div>
      </div>

      <main id="main-content" className="gov-citizen-main">
        {/* SIR 2026 Action Banner */}
        <section className="gov-sir-banner" aria-label="Special Summary Revision 2026">
          <div className="gov-sir-container">
            <div className="gov-sir-content">
              <span className="gov-sir-pill">SPECIAL SUMMARY REVISION (SSR) 2026</span>
              <h1 className="gov-sir-title">Citizen Voter Services Hub</h1>
              <p className="gov-sir-sub">
                Online registration, revision of electoral rolls, correction of particulars, and status tracking under the Election Commission of India.
              </p>
            </div>
            <div className="gov-sir-actions">
              <button
                type="button"
                className="gov-sir-btn primary"
                onClick={() => {
                  setActiveTab("track");
                  window.scrollTo({ top: 500, behavior: "smooth" });
                }}
              >
                🔍 Search in Last SIR
              </button>
              <button
                type="button"
                className="gov-sir-btn outline"
                onClick={() => setModalData({ title: "Submit Document Against Notice", formType: "SIR_NOTICE" })}
              >
                📄 Submit Document Against Notice
              </button>
              <Link to="/register" className="gov-sir-btn fill">
                ✍️ Fill Enumeration Form
              </Link>
            </div>
          </div>
        </section>

        {/* Portal Tabs Bar */}
        <section className="gov-citizen-nav-tabs">
          <div className="gov-citizen-tabs-container">
            <button
              className={`gov-c-tab ${activeTab === "forms" ? "active" : ""}`}
              onClick={() => setActiveTab("forms")}
            >
              📑 Statutory Forms (6/6A/7/8)
            </button>
            <button
              className={`gov-c-tab ${activeTab === "eepic" ? "active" : ""}`}
              onClick={() => setActiveTab("eepic")}
            >
              💳 Digital e-EPIC Download
            </button>
            <button
              className={`gov-c-tab ${activeTab === "track" ? "active" : ""}`}
              onClick={() => setActiveTab("track")}
            >
              🔎 Track Application & Appeals
            </button>
            <button
              className={`gov-c-tab ${activeTab === "blo" ? "active" : ""}`}
              onClick={() => setActiveTab("blo")}
            >
              📞 Book a Call with BLO
            </button>
            <button
              className={`gov-c-tab ${activeTab === "eroll" ? "active" : ""}`}
              onClick={() => setActiveTab("eroll")}
            >
              📥 Download Electoral Roll
            </button>
            <button
              className={`gov-c-tab ${activeTab === "ngsp" ? "active" : ""}`}
              onClick={() => setActiveTab("ngsp")}
            >
              ⚖️ Grievance (NGSP)
            </button>
          </div>
        </section>

        <div className="gov-citizen-body-container">
          {/* TAB 1: FORMS */}
          {activeTab === "forms" && (
            <div className="gov-forms-grid">
              {/* Form 6 */}
              <div className="gov-form-card">
                <div className="gov-form-card-header f-blue">
                  <span className="gov-form-code">FORM 6</span>
                  <span className="gov-form-statute">Section 23, RPA 1950</span>
                </div>
                <div className="gov-form-card-body">
                  <h3 className="gov-form-title">New Voter Registration</h3>
                  <p className="gov-form-desc">
                    Application for inclusion of name in Electoral Roll for first-time electors (age 18+ or qualifying on 01.01.2026).
                  </p>
                  <div className="gov-form-actions-list">
                    <Link to="/register" className="gov-form-btn primary">
                      Fill Form 6 (Online) →
                    </Link>
                    <button
                      type="button"
                      className="gov-form-btn secondary"
                      onClick={() => setModalData({ title: "Declaration Form for Form 6", formType: "DECLARATION_6" })}
                    >
                      Fill Declaration Form
                    </button>
                    <div className="gov-form-btn-group">
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => alert("Downloading Statutory Form 6 PDF...")}
                      >
                        📥 Download Statutory PDF
                      </button>
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => setModalData({ title: "Guidelines for Form 6", formType: "GUIDELINES_6" })}
                      >
                        📘 Guidelines
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form 6A */}
              <div className="gov-form-card">
                <div className="gov-form-card-header f-teal">
                  <span className="gov-form-code">FORM 6A</span>
                  <span className="gov-form-statute">Section 20A, RPA 1950</span>
                </div>
                <div className="gov-form-card-body">
                  <h3 className="gov-form-title">Overseas (NRI) Elector Registration</h3>
                  <p className="gov-form-desc">
                    For Indian citizens residing abroad who have not acquired citizenship of any other country and wish to vote in India.
                  </p>
                  <div className="gov-form-actions-list">
                    <button
                      type="button"
                      className="gov-form-btn primary"
                      onClick={() => setModalData({ title: "Form 6A Overseas Registration", formType: "FORM_6A" })}
                    >
                      Fill Form 6A (NRI) →
                    </button>
                    <div className="gov-form-btn-group">
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => alert("Downloading Statutory Form 6A PDF...")}
                      >
                        📥 Download Statutory PDF
                      </button>
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => setModalData({ title: "Guidelines for Form 6A", formType: "GUIDELINES_6A" })}
                      >
                        📘 Guidelines
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form 7 */}
              <div className="gov-form-card">
                <div className="gov-form-card-header f-red">
                  <span className="gov-form-code">FORM 7</span>
                  <span className="gov-form-statute">Rule 13(2), RER 1960</span>
                </div>
                <div className="gov-form-card-body">
                  <h3 className="gov-form-title">Deletion / Objection in Roll</h3>
                  <p className="gov-form-desc">
                    Application for deletion of name from electoral roll due to death, permanent shifting, under-age or duplicate entry.
                  </p>
                  <div className="gov-form-actions-list">
                    <button
                      type="button"
                      className="gov-form-btn primary btn-danger"
                      onClick={() => setModalData({ title: "Form 7 Deletion Application", formType: "FORM_7" })}
                    >
                      Fill Form 7 (Deletion) →
                    </button>
                    <button
                      type="button"
                      className="gov-form-btn secondary"
                      onClick={() => setModalData({ title: "Form 7 Overseas", formType: "FORM_7_OVERSEAS" })}
                    >
                      Fill Form 7 Overseas
                    </button>
                    <div className="gov-form-btn-group">
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => alert("Downloading Statutory Form 7 PDF...")}
                      >
                        📥 Download Statutory PDF
                      </button>
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => setModalData({ title: "Guidelines for Form 7", formType: "GUIDELINES_7" })}
                      >
                        📘 Guidelines
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form 8 */}
              <div className="gov-form-card">
                <div className="gov-form-card-header f-purple">
                  <span className="gov-form-code">FORM 8</span>
                  <span className="gov-form-statute">Rule 26, RER 1960</span>
                </div>
                <div className="gov-form-card-body">
                  <h3 className="gov-form-title">Shifting, Correction & Replacement</h3>
                  <p className="gov-form-desc">
                    Shifting of residence, correction of name/photo/DOB, issue of replacement EPIC card, and marking as Person with Disability (PwD).
                  </p>
                  <div className="gov-form-actions-list">
                    <button
                      type="button"
                      className="gov-form-btn primary"
                      onClick={() => setModalData({ title: "Form 8 Modification Suite", formType: "FORM_8" })}
                    >
                      Fill Form 8 (Correction / Shift) →
                    </button>
                    <button
                      type="button"
                      className="gov-form-btn secondary"
                      onClick={() => setModalData({ title: "Form 8 Overseas (Self Correction)", formType: "FORM_8_OVERSEAS" })}
                    >
                      Fill Form 8 Overseas
                    </button>
                    <div className="gov-form-btn-group">
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => alert("Downloading Statutory Form 8 PDF...")}
                      >
                        📥 Download Statutory PDF
                      </button>
                      <button
                        type="button"
                        className="gov-form-btn text"
                        onClick={() => setModalData({ title: "Guidelines for Form 8", formType: "GUIDELINES_8" })}
                      >
                        📘 Guidelines
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Service Forms (Form M & 12C from research) */}
              <div className="gov-form-card">
                <div className="gov-form-card-header f-amber">
                  <span className="gov-form-code">FORM M</span>
                  <span className="gov-form-statute">Kashmiri Migrant Electors</span>
                </div>
                <div className="gov-form-card-body">
                  <h3 className="gov-form-title">Special Polling Station (Migrant)</h3>
                  <p className="gov-form-desc">
                    Intimation by Kashmiri migrant electors desiring to vote at special polling stations in Delhi, Jammu, and Udhampur.
                  </p>
                  <div className="gov-form-actions-list">
                    <button
                      type="button"
                      className="gov-form-btn primary"
                      onClick={() => setModalData({ title: "Form M Application", formType: "FORM_M" })}
                    >
                      Fill Form M Intimation →
                    </button>
                    <button
                      type="button"
                      className="gov-form-btn text"
                      onClick={() => alert("Downloading Statutory Form M PDF...")}
                    >
                      📥 Download Statutory Form M PDF
                    </button>
                  </div>
                </div>
              </div>

              {/* Form 12C */}
              <div className="gov-form-card">
                <div className="gov-form-card-header f-emerald">
                  <span className="gov-form-code">FORM 12C</span>
                  <span className="gov-form-statute">Postal Ballot (Migrant)</span>
                </div>
                <div className="gov-form-card-body">
                  <h3 className="gov-form-title">Postal Ballot for Migrant Electors</h3>
                  <p className="gov-form-desc">
                    Letter of intimation to the Assistant Returning Officer for casting vote through postal ballot by notified migrant electors.
                  </p>
                  <div className="gov-form-actions-list">
                    <button
                      type="button"
                      className="gov-form-btn primary"
                      onClick={() => setModalData({ title: "Form 12C Application", formType: "FORM_12C" })}
                    >
                      Fill Form 12C Postal Ballot →
                    </button>
                    <button
                      type="button"
                      className="gov-form-btn text"
                      onClick={() => alert("Downloading Statutory Form 12C PDF...")}
                    >
                      📥 Download Statutory Form 12C PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DIGITAL e-EPIC DOWNLOAD */}
          {activeTab === "eepic" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>💳 Download Digital e-EPIC (Voter ID Card)</h2>
                <p>
                  e-EPIC is a portable document format (PDF) version of the EPIC which can be downloaded on mobile or in a self-printable form on the computer. It is equally valid as proof of identity for voting.
                </p>
              </div>

              <div className="gov-tool-grid">
                <form className="gov-tool-form" onSubmit={handleEEpicGenerate}>
                  <div className="gov-input-group">
                    <label htmlFor="epic-input">EPIC (Voter ID) Number</label>
                    <input
                      id="epic-input"
                      type="text"
                      placeholder="e.g. ABC1234567 or DL0403198421"
                      value={epicNumber}
                      onChange={(e) => setEpicNumber(e.target.value)}
                      required
                    />
                  </div>

                  <div className="gov-input-group">
                    <label htmlFor="epic-state">State / Union Territory</label>
                    <select
                      id="epic-state"
                      value={epicState}
                      onChange={(e) => setEpicState(e.target.value)}
                    >
                      <option value="DL">Delhi (NCT)</option>
                      <option value="HP">Himachal Pradesh</option>
                      <option value="UP">Uttar Pradesh</option>
                      <option value="MH">Maharashtra</option>
                      <option value="KA">Karnataka</option>
                      <option value="TN">Tamil Nadu</option>
                      <option value="WB">West Bengal</option>
                    </select>
                  </div>

                  <div className="gov-info-box">
                    🔒 An OTP verification prompt will be initiated to your registered mobile number for secure electronic card generation.
                  </div>

                  <button type="submit" className="gov-btn-primary full-width">
                    Verify & Generate e-EPIC Card 📇
                  </button>
                </form>

                {/* Digital Card Preview */}
                <div className="gov-eepic-preview-card">
                  {eEpicResult ? (
                    <div className="gov-epic-card-render">
                      <div className="gov-epic-top">
                        <div className="gov-epic-crest">🇮🇳</div>
                        <div className="gov-epic-header-text">
                          <strong>ELECTION COMMISSION OF INDIA</strong>
                          <span>भारत निर्वाचन आयोग · VOTER IDENTITY CARD</span>
                        </div>
                        <div className="gov-epic-flag-tag">ECI</div>
                      </div>

                      <div className="gov-epic-body">
                        <div className="gov-epic-photo-box">
                          <div className="gov-epic-photo">👤</div>
                          <span className="gov-epic-badge">VERIFIED</span>
                        </div>
                        <div className="gov-epic-details">
                          <div className="gov-epic-no">
                            <span>EPIC NO:</span> <strong>{eEpicResult.epic}</strong>
                          </div>
                          <div className="gov-epic-row">
                            <span>Name:</span> <strong>{eEpicResult.name}</strong>
                          </div>
                          <div className="gov-epic-row">
                            <span>Relation:</span> <span>{eEpicResult.relation}</span>
                          </div>
                          <div className="gov-epic-row">
                            <span>Gender / DOB:</span> <span>{eEpicResult.gender} / {eEpicResult.dob}</span>
                          </div>
                          <div className="gov-epic-row">
                            <span>Assembly:</span> <span>{eEpicResult.assembly}</span>
                          </div>
                        </div>
                      </div>

                      <div className="gov-epic-footer">
                        <div className="gov-epic-barcode">||||||||||||||||||||||||||||||||</div>
                        <div className="gov-epic-qr">▣ QR SECURE</div>
                      </div>

                      <button
                        type="button"
                        className="gov-btn-primary full-width mt-12"
                        onClick={() => alert(`Official e-EPIC PDF for ${eEpicResult.epic} downloaded successfully with digital watermark!`)}
                      >
                        📥 Download Signed e-EPIC PDF
                      </button>
                    </div>
                  ) : (
                    <div className="gov-epic-placeholder">
                      <span className="placeholder-icon">🪪</span>
                      <strong>Digital e-EPIC Preview</strong>
                      <p>Enter your EPIC number on the left to preview and download your official digitally-signed voter card.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRACK APPLICATION & APPEALS */}
          {activeTab === "track" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>🔎 Track Application & Appeal Status</h2>
                <p>
                  Check real-time statutory progress of Form 6, 6A, 7, 8 submissions, Special Summary Revision claims, or Appeals filed under Section 24 of the RPA 1950.
                </p>
              </div>

              <form className="gov-track-form-inline" onSubmit={handleTrackSubmit}>
                <div className="gov-input-group flex-1">
                  <label htmlFor="ref-input">Application Reference Number / Appeal ID</label>
                  <input
                    id="ref-input"
                    type="text"
                    value={trackRefId}
                    onChange={(e) => setTrackRefId(e.target.value)}
                    placeholder="e.g. REF-2026-90412"
                    required
                  />
                </div>
                <button type="submit" className="gov-btn-primary">
                  Track Status 🚀
                </button>
              </form>

              {trackingResult && (
                <div className="gov-track-result-card">
                  <div className="gov-track-meta">
                    <div>
                      <span className="gov-meta-tag">{trackingResult.formType}</span>
                      <h3 className="gov-track-id">Reference: {trackingResult.id}</h3>
                      <p className="gov-track-sub">
                        Applicant: <strong>{trackingResult.applicantName}</strong> | {trackingResult.ac}, {trackingResult.state}
                      </p>
                    </div>
                    <div className="gov-status-pill approved">
                      STATUS: {trackingResult.currentStatus}
                    </div>
                  </div>

                  {/* 5-Stage Timeline */}
                  <div className="gov-timeline">
                    {trackingResult.stages.map((stage, i) => (
                      <div key={i} className={`gov-timeline-step ${stage.status}`}>
                        <div className="gov-step-marker">{i + 1}</div>
                        <div className="gov-step-content">
                          <strong>{stage.label}</strong>
                          <span>{stage.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="gov-track-success-box">
                    🎉 <strong>Congratulations!</strong> Your voter application has been approved. Your EPIC number is{" "}
                    <code>{trackingResult.epicNumber}</code>. You can now download your digital e-EPIC card immediately.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: BOOK A CALL WITH BLO */}
          {activeTab === "blo" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>📞 Book a Direct Call with Your Booth Level Officer (BLO)</h2>
                <p>
                  Need assistance with physical address verification, disability assistance at the booth, or resolving queries? Schedule an official callback from your designated polling station BLO.
                </p>
              </div>

              {bloBooking.confirmed ? (
                <div className="gov-success-banner">
                  <div className="gov-success-icon">✅</div>
                  <h3>BLO Callback Request Scheduled!</h3>
                  <p>
                    Your request has been routed to the Booth Level Officer for <strong>{bloBooking.part}</strong> ({bloBooking.ac}).
                  </p>
                  <div className="gov-booking-details-box">
                    <div><strong>Designated Slot:</strong> {bloBooking.slot}</div>
                    <div><strong>Registered Phone:</strong> {bloBooking.phone}</div>
                    <div><strong>Assigned BLO:</strong> Shri Ravi Kumar (Mobile: +91-9876543210)</div>
                  </div>
                  <button
                    type="button"
                    className="gov-btn-secondary"
                    onClick={() => setBloBooking({ ...bloBooking, confirmed: false })}
                  >
                    Schedule Another Callback
                  </button>
                </div>
              ) : (
                <form className="gov-blo-form" onSubmit={handleBloBook}>
                  <div className="gov-form-row">
                    <div className="gov-input-group">
                      <label>State / UT</label>
                      <input type="text" value={bloBooking.state} disabled />
                    </div>
                    <div className="gov-input-group">
                      <label>District</label>
                      <input type="text" value={bloBooking.district} disabled />
                    </div>
                  </div>

                  <div className="gov-form-row">
                    <div className="gov-input-group">
                      <label>Assembly Constituency</label>
                      <input type="text" value={bloBooking.ac} disabled />
                    </div>
                    <div className="gov-input-group">
                      <label>Polling Station / Part Name</label>
                      <input type="text" value={bloBooking.part} disabled />
                    </div>
                  </div>

                  <div className="gov-form-row">
                    <div className="gov-input-group">
                      <label>Mobile Number for Callback</label>
                      <input
                        type="tel"
                        value={bloBooking.phone}
                        onChange={(e) => setBloBooking({ ...bloBooking, phone: e.target.value })}
                        required
                      />
                    </div>
                    <div className="gov-input-group">
                      <label>Preferred Calling Slot</label>
                      <select
                        value={bloBooking.slot}
                        onChange={(e) => setBloBooking({ ...bloBooking, slot: e.target.value })}
                      >
                        <option>Morning (10:00 AM - 01:00 PM)</option>
                        <option>Afternoon (02:00 PM - 05:00 PM)</option>
                        <option>Evening (05:00 PM - 07:00 PM)</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" className="gov-btn-primary">
                    Confirm & Schedule BLO Call 📲
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 5: ELECTORAL ROLL DOWNLOAD */}
          {activeTab === "eroll" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>📥 Download Electoral Roll PDF (SSR 2026)</h2>
                <p>
                  Download the official Electoral Roll PDF for your polling part as published under the Special Summary Revision 2026.
                </p>
              </div>

              <div className="gov-eroll-selector-box">
                <div className="gov-form-row">
                  <div className="gov-input-group">
                    <label>State</label>
                    <select>
                      <option>Delhi (NCT)</option>
                      <option>Himachal Pradesh</option>
                      <option>Uttar Pradesh</option>
                    </select>
                  </div>
                  <div className="gov-input-group">
                    <label>Revision Year</label>
                    <select disabled>
                      <option>2026 (Special Summary Revision)</option>
                    </select>
                  </div>
                  <div className="gov-input-group">
                    <label>Language</label>
                    <select>
                      <option>Hindi (हिन्दी)</option>
                      <option>English</option>
                    </select>
                  </div>
                </div>

                <div className="gov-form-row">
                  <div className="gov-input-group">
                    <label>District</label>
                    <select>
                      <option>West Delhi</option>
                      <option>South Delhi</option>
                      <option>North Delhi</option>
                    </select>
                  </div>
                  <div className="gov-input-group">
                    <label>Assembly Constituency</label>
                    <select>
                      <option>31 – Vikaspuri</option>
                      <option>32 – Janakpuri</option>
                      <option>33 – Hari Nagar</option>
                    </select>
                  </div>
                </div>

                <div className="gov-parts-table-wrapper">
                  <table className="gov-parts-table">
                    <thead>
                      <tr>
                        <th>Part No.</th>
                        <th>Polling Station Name & Location</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>01</strong></td>
                        <td>Govt Boys Senior Secondary School, Room 1, Hastsal</td>
                        <td>
                          <button
                            type="button"
                            className="gov-download-btn-sm"
                            onClick={() => alert("Downloading Draft Electoral Roll Part 01 PDF...")}
                          >
                            📥 Download PDF
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td><strong>02</strong></td>
                        <td>Govt Boys Senior Secondary School, Room 2, Hastsal</td>
                        <td>
                          <button
                            type="button"
                            className="gov-download-btn-sm"
                            onClick={() => alert("Downloading Draft Electoral Roll Part 02 PDF...")}
                          >
                            📥 Download PDF
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td><strong>42</strong></td>
                        <td>Community Centre, Pocket 3, Vikaspuri</td>
                        <td>
                          <button
                            type="button"
                            className="gov-download-btn-sm"
                            onClick={() => alert("Downloading Draft Electoral Roll Part 42 PDF...")}
                          >
                            📥 Download PDF
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: NGSP GRIEVANCES */}
          {activeTab === "ngsp" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>⚖️ National Grievance Redressal Portal (NGSP)</h2>
                <p>
                  Register citizen complaints, report electoral service issues, or share suggestions directly with the Election Commission of India.
                </p>
              </div>

              {complaintTicket.submitted ? (
                <div className="gov-success-banner">
                  <div className="gov-success-icon">🎫</div>
                  <h3>Grievance Ticket Registered Successfully</h3>
                  <p>
                    Your ticket ID is <strong>{complaintTicket.ticketId}</strong>. A confirmation SMS has been dispatched.
                  </p>
                  <div className="gov-booking-details-box">
                    <div><strong>Category:</strong> {complaintTicket.category}</div>
                    <div><strong>Status:</strong> Assigned to District Grievance Nodal Officer</div>
                    <div><strong>SLA Resolution:</strong> Within 48 hours</div>
                  </div>
                  <button
                    type="button"
                    className="gov-btn-secondary"
                    onClick={() => setComplaintTicket({ ...complaintTicket, submitted: false })}
                  >
                    File Another Grievance
                  </button>
                </div>
              ) : (
                <form className="gov-ngsp-form" onSubmit={handleComplaintSubmit}>
                  <div className="gov-input-group">
                    <label>Grievance Category</label>
                    <select
                      value={complaintTicket.category}
                      onChange={(e) => setComplaintTicket({ ...complaintTicket, category: e.target.value })}
                    >
                      <option>Voter ID Not Received</option>
                      <option>Incorrect Details on EPIC</option>
                      <option>BLO Not Accessible</option>
                      <option>Polling Station Infrastructure Issue (AMF)</option>
                      <option>Delay in Form 6 Processing</option>
                      <option>General Feedback / Suggestion</option>
                    </select>
                  </div>

                  <div className="gov-input-group">
                    <label>Subject / Description</label>
                    <textarea
                      rows={4}
                      placeholder="Please describe the grievance in detail with reference ID if applicable..."
                      value={complaintTicket.description}
                      onChange={(e) => setComplaintTicket({ ...complaintTicket, description: e.target.value })}
                      required
                    ></textarea>
                  </div>

                  <button type="submit" className="gov-btn-primary">
                    Submit Grievance to ECI 📬
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Universal Modal Dialog */}
      {modalData && (
        <div className="gov-modal-overlay" onClick={() => setModalData(null)}>
          <div className="gov-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="gov-modal-header">
              <h3>{modalData.title}</h3>
              <button
                type="button"
                className="gov-modal-close"
                onClick={() => setModalData(null)}
              >
                ✕
              </button>
            </div>
            <div className="gov-modal-body">
              {modalData.formType.startsWith("GUIDELINES") && (
                <div className="gov-guidelines-box">
                  <h4>Statutory Eligibility & Rules:</h4>
                  <ul>
                    <li>The applicant must be a citizen of India and ordinarily resident at the given address.</li>
                    <li>Must be at least 18 years of age on the qualifying date (01 January 2026).</li>
                    <li>Proof of Age accepted: Birth Certificate, Passport, PAN Card, Driving Licence, or Class 10 Certificate.</li>
                    <li>Proof of Ordinary Residence accepted: Electricity/Water Bill, Aadhaar, Bank Passbook, or Registered Rent Agreement.</li>
                  </ul>
                  <p className="mt-8">Note: Providing false declarations is punishable under Section 31 of RPA 1950.</p>
                </div>
              )}

              {modalData.formType.startsWith("DECLARATION") && (
                <div className="gov-declaration-box">
                  <p>
                    "I hereby declare that to the best of my knowledge and belief, I am a citizen of India, I have not applied for inclusion of my name elsewhere, and I am ordinarily resident at the specified address."
                  </p>
                  <label className="gov-checkbox-label">
                    <input type="checkbox" required /> I accept and confirm the above statutory declaration.
                  </label>
                </div>
              )}

              {modalData.formType === "FORM_6A" && (
                <div className="gov-overseas-box">
                  <div className="gov-input-group">
                    <label>Passport Number</label>
                    <input type="text" placeholder="e.g. Z1234567" required />
                  </div>
                  <div className="gov-input-group">
                    <label>Country of Overseas Residence</label>
                    <input type="text" placeholder="e.g. United Kingdom" required />
                  </div>
                  <div className="gov-input-group">
                    <label>Indian Address as in Passport</label>
                    <textarea placeholder="Address in India for voter constituency..." required></textarea>
                  </div>
                </div>
              )}

              {modalData.formType === "FORM_7" && (
                <div className="gov-deletion-box">
                  <div className="gov-input-group">
                    <label>EPIC Number of Elector to be Deleted</label>
                    <input type="text" placeholder="e.g. ABC1234567" required />
                  </div>
                  <div className="gov-input-group">
                    <label>Grounds for Deletion</label>
                    <select>
                      <option>Death of Elector</option>
                      <option>Permanently Shifted to Another Constituency</option>
                      <option>Duplicate Entry</option>
                      <option>Underage / Not Eligible</option>
                    </select>
                  </div>
                </div>
              )}

              {modalData.formType === "FORM_8" && (
                <div className="gov-form8-box">
                  <label>Select Purpose of Application:</label>
                  <div className="gov-radio-group">
                    <label><input type="radio" name="f8type" defaultChecked /> Shifting of Residence</label>
                    <label><input type="radio" name="f8type" /> Correction of Entries in Existing Roll</label>
                    <label><input type="radio" name="f8type" /> Issue of Replacement EPIC without correction</label>
                    <label><input type="radio" name="f8type" /> Marking as Person with Disability (PwD)</label>
                  </div>
                  <div className="gov-input-group mt-12">
                    <label>Existing EPIC Number</label>
                    <input type="text" placeholder="e.g. ABC1234567" required />
                  </div>
                </div>
              )}

              {modalData.formType === "SIR_NOTICE" && (
                <div className="gov-notice-box">
                  <div className="gov-input-group">
                    <label>Notice Reference Number</label>
                    <input type="text" placeholder="e.g. NOT-2026-DEL-892" required />
                  </div>
                  <div className="gov-input-group">
                    <label>Upload Supporting Document (PDF / JPEG)</label>
                    <input type="file" />
                  </div>
                </div>
              )}
            </div>
            <div className="gov-modal-footer">
              <button
                type="button"
                className="gov-btn-secondary"
                onClick={() => setModalData(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gov-btn-primary"
                onClick={() => {
                  alert("Application details captured and recorded in test session!");
                  setModalData(null);
                }}
              >
                Proceed & Submit 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      <GovFooter />
    </div>
  );
}

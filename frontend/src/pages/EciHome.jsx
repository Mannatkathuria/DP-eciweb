import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./EciHome.css";

const heroSlides = [
  {
    id: 1,
    category: "SPECIAL SUMMARY REVISION 2026",
    title: "Verify Your Name in the Electoral Roll Today",
    description: "The Special Summary Revision (SSR) 2026 is underway across all 36 States and Union Territories. Ensure your vote is secure with instant online enrollment via Form 6.",
    primaryBtn: { label: "Register as New Voter (Form 6)", link: "/register" },
    secondaryBtn: { label: "Search Electoral Roll", link: "/electoral-roll" },
    badge: "Official Notice · Qualifying Date 01.01.2026",
    tagline: "Every Eligible Citizen on the Electoral Roll"
  },
  {
    id: 2,
    category: "cVIGIL 100-MINUTE CITIZEN ACTION",
    title: "Report Model Code of Conduct Violations Instantly",
    description: "Spot illegal cash, liquor distribution, firearms, or hate speech? Submit live photo/video evidence with automatic GPS geotag. Our Flying Squads resolve within 100 minutes.",
    primaryBtn: { label: "File cVIGIL Report", link: "/cvigil" },
    secondaryBtn: { label: "DCC Control Room Status", link: "/cvigil" },
    badge: "Active Operational Protocol · Strict Accountability",
    tagline: "Fast, Transparent, Citizen-Led Vigilance"
  },
  {
    id: 3,
    category: "SUVIDHA 2.0 CANDIDATE PORTAL",
    title: "Single-Window Nominations & Campaign Clearances",
    description: "File candidate nominations, upload affidavits (Form 26), and apply for multi-departmental rally, vehicle, and loudspeaker permissions with transparent First-In-First-Out processing.",
    primaryBtn: { label: "Open Suvidha Portal", link: "/suvidha" },
    secondaryBtn: { label: "Know Your Candidate (KYC)", link: "/suvidha" },
    badge: "For Candidates & Recognized Parties",
    tagline: "Digital Convenience for Fair Elections"
  },
  {
    id: 4,
    category: "SVEEP VOTER EDUCATION & EMPOWERMENT",
    title: "No Voter to be Left Behind",
    description: "Dedicated polling assistance, braille ballot papers, home voting facilities for 85+ electors and PwD citizens, and youth voter awareness across all educational institutions.",
    primaryBtn: { label: "Explore SVEEP Resources", link: "/media-publications" },
    secondaryBtn: { label: "Voter Saathi AI Guide", link: "/ceo-himachal" },
    badge: "Systematic Voters' Education and Electoral Participation",
    tagline: "Mera Vote, Desh Ka Haq"
  }
];

const newsTabs = [
  {
    id: "current",
    title: "Current Issues",
    items: [
      { date: "31 Oct 2026", title: "Schedule for Special Summary Revision of Electoral Rolls (SSR 2026) in all States/UTs with reference to 01.01.2026 as qualifying date", isNew: true },
      { date: "28 Oct 2026", title: "Enforcement of Model Code of Conduct instructions for Parliamentary & Assembly bye-elections", isNew: true },
      { date: "24 Oct 2026", title: "Advisory to all National and State recognized political parties regarding ethical campaigning standards", isNew: false },
      { date: "19 Oct 2026", title: "Upgraded Suvidha 2.0 portal launched for single-window campaign clearances and digital deposits", isNew: false }
    ]
  },
  {
    id: "press",
    title: "Press Releases",
    items: [
      { date: "30 Oct 2026", title: "ECI announces completion of 100% First Level Checking (FLC) of EVMs and VVPATs in presence of political party representatives", isNew: true },
      { date: "25 Oct 2026", title: "National Voter Helpline 1950 resolves over 4.5 lakh citizen inquiries in Special Revision fortnight", isNew: false },
      { date: "21 Oct 2026", title: "cVIGIL app achieves average resolution time of 84 minutes across 12,400 citizen submissions", isNew: false },
      { date: "15 Oct 2026", title: "International delegation of 24 Election Management Bodies visits IIIDEM for capacity building program", isNew: false }
    ]
  },
  {
    id: "instructions",
    title: "Instructions",
    items: [
      { date: "29 Oct 2026", title: "Compendium of Instructions on Electronic Voting Machine (EVM) and Voter Verifiable Paper Audit Trail (VVPAT) - Edition 2026", isNew: true },
      { date: "22 Oct 2026", title: "Standard Operating Procedure for Flying Squads (FST) and Static Surveillance Teams (SST) in cVIGIL integration", isNew: false },
      { date: "18 Oct 2026", title: "Guidelines for counting of votes and round-wise tabulation in Parliamentary constituencies", isNew: false }
    ]
  },
  {
    id: "tenders",
    title: "Tender & Vacancies",
    items: [
      { date: "31 Oct 2026", title: "Notice Inviting Tender for supply of non-toxic indelible ink markers for General Elections 2026-27", isNew: true },
      { date: "26 Oct 2026", title: "Engagement of Young Professionals and Technical Consultants at ECI Headquarters, New Delhi", isNew: false },
      { date: "14 Oct 2026", title: "RFP for cloud-based disaster recovery infrastructure for National Electoral Roll Database", isNew: false }
    ]
  },
  {
    id: "stories",
    title: "Election Stories",
    items: [
      { date: "27 Oct 2026", title: "Journey to Tashigang, Himachal Pradesh: Inside the world's highest polling station at 15,256 feet", isNew: true },
      { date: "20 Oct 2026", title: "How dedicated BLOs in Andaman & Nicobar traverse dense creeks to ensure 100% door-to-door verification", isNew: false },
      { date: "12 Oct 2026", title: "Voices of Democracy: First-time transgender voters share their journey with voter ID cards", isNew: false }
    ]
  },
  {
    id: "faqs",
    title: "FAQs",
    items: [
      { date: "Updated 2026", title: "Frequently Asked Questions regarding EVM & VVPAT security, non-programmability, and mock poll protocol", isNew: false },
      { date: "Updated 2026", title: "Can an NRI Indian citizen register to vote without an Indian address? (Detailed Form 6A Guide)", isNew: false },
      { date: "Updated 2026", title: "What documents are legally accepted as proof of residence for Form 6 and Form 8?", isNew: false }
    ]
  },
  {
    id: "court",
    title: "Court Orders",
    items: [
      { date: "Oct 2026", title: "Supreme Court of India judgment reaffirming VVPAT slip verification and electoral roll purity standards", isNew: false },
      { date: "Sep 2026", title: "High Court directives on public disclosure of criminal antecedents by contesting candidates", isNew: false }
    ]
  }
];

export default function EciHome() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeTab, setActiveTab] = useState("current");
  const [tickerPaused, setTickerPaused] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const slide = heroSlides[currentSlide];
  const activeTabContent = newsTabs.find((t) => t.id === activeTab);

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Live Election Alert Marquee */}
      <div className="gov-alert-ticker-bar" role="region" aria-label="Official Election Ticker">
        <div className="gov-ticker-container">
          <div className="gov-ticker-badge">
            <span className="gov-ticker-dot"></span>
            <strong>LIVE ALERTS</strong>
          </div>
          <div
            className={`gov-ticker-scroll ${tickerPaused ? "paused" : ""}`}
            onMouseEnter={() => setTickerPaused(true)}
            onMouseLeave={() => setTickerPaused(false)}
          >
            <span className="gov-ticker-item">
              🔴 <strong>Special Summary Revision (SSR) 2026:</strong> Draft Electoral Rolls published across all States & UTs. Claims & Objections open till November 30.
            </span>
            <span className="gov-ticker-separator">✦</span>
            <span className="gov-ticker-item">
              🚨 <strong>cVIGIL 100-Minute Redressal:</strong> Citizens can report MCC violations with live GPS photos/videos. DCC Flying Squads dispatched instantly.
            </span>
            <span className="gov-ticker-separator">✦</span>
            <span className="gov-ticker-item">
              📞 <strong>Toll-Free Helpline 1950:</strong> Connect directly with your local Booth Level Officer (BLO) for booth and polling card help.
            </span>
            <span className="gov-ticker-separator">✦</span>
            <span className="gov-ticker-item">
              🚩 <strong>Suvidha 2.0:</strong> Single-window online candidate nominations and multi-nodal campaign permissions now live.
            </span>
          </div>
        </div>
      </div>

      <main id="main-content" className="gov-home-main">
        {/* Hero Section with Carousel */}
        <section className="gov-hero-section" aria-label="Featured Election Updates">
          <div className="gov-hero-container">
            <div className="gov-hero-card">
              <div className="gov-hero-content">
                <div className="gov-hero-meta">
                  <span className="gov-hero-badge">{slide.badge}</span>
                  <span className="gov-hero-category">{slide.category}</span>
                </div>
                <h2 className="gov-hero-title">{slide.title}</h2>
                <p className="gov-hero-desc">{slide.description}</p>
                <div className="gov-hero-actions">
                  <Link to={slide.primaryBtn.link} className="gov-btn-primary">
                    {slide.primaryBtn.label} →
                  </Link>
                  <Link to={slide.secondaryBtn.link} className="gov-btn-secondary">
                    {slide.secondaryBtn.label}
                  </Link>
                </div>
                <div className="gov-hero-tagline">
                  <span>🇮🇳 {slide.tagline}</span>
                </div>
              </div>

              {/* Slider Dots & Indicators */}
              <div className="gov-slider-controls">
                {heroSlides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`gov-slide-dot ${idx === currentSlide ? "active" : ""}`}
                    onClick={() => setCurrentSlide(idx)}
                    aria-label={`Go to slide ${idx + 1}: ${s.category}`}
                  >
                    <span className="gov-dot-bar"></span>
                    <span className="gov-dot-label">0{idx + 1}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* National Democracy Pulse Statistics */}
        <section className="gov-pulse-section" aria-label="Democracy in Numbers">
          <div className="gov-pulse-container">
            <div className="gov-pulse-header">
              <span className="gov-pulse-eyebrow">WORLD'S LARGEST DEMOCRACY</span>
              <h2 className="gov-pulse-title">Electoral Machinery at a Glance</h2>
              <p className="gov-pulse-subtitle">
                Official statistics maintained by the Election Commission of India under the Representation of the People Acts.
              </p>
            </div>

            <div className="gov-pulse-grid">
              <div className="gov-pulse-card">
                <div className="gov-pulse-icon">👥</div>
                <div className="gov-pulse-number">96.8 Cr+</div>
                <div className="gov-pulse-label">Registered Electors</div>
                <div className="gov-pulse-detail">Inclusive of youth, women, PwD & overseas voters</div>
              </div>

              <div className="gov-pulse-card">
                <div className="gov-pulse-icon">🏛️</div>
                <div className="gov-pulse-number">543</div>
                <div className="gov-pulse-label">Parliamentary Constituencies</div>
                <div className="gov-pulse-detail">Across 28 States and 8 Union Territories</div>
              </div>

              <div className="gov-pulse-card">
                <div className="gov-pulse-icon">🗺️</div>
                <div className="gov-pulse-number">4,123</div>
                <div className="gov-pulse-label">Assembly Constituencies</div>
                <div className="gov-pulse-detail">Mapped with official GIS & part boundaries</div>
              </div>

              <div className="gov-pulse-card">
                <div className="gov-pulse-icon">🗳️</div>
                <div className="gov-pulse-number">10.5 Lakh+</div>
                <div className="gov-pulse-label">Polling Stations</div>
                <div className="gov-pulse-detail">Assured Minimum Facilities (AMF) in every booth</div>
              </div>

              <div className="gov-pulse-card highlight">
                <div className="gov-pulse-icon">⏱️</div>
                <div className="gov-pulse-number">100 Mins</div>
                <div className="gov-pulse-label">cVIGIL SLA Response</div>
                <div className="gov-pulse-detail">From citizen report to Flying Squad resolution</div>
              </div>
            </div>
          </div>
        </section>

        {/* 4 Pillars Ecosystem Service Explorer */}
        <section className="gov-pillars-section" aria-label="ECI Digital Services Ecosystem">
          <div className="gov-pillars-container">
            <div className="gov-section-heading">
              <span className="gov-section-badge">INTEGRATED DIGITAL PLATFORM</span>
              <h2 className="gov-section-title">ECI Ecosystem Service Portals</h2>
              <p className="gov-section-subtitle">
                Discover statutory workflows and dedicated platforms tailored for Citizens, Candidates, Election Officials, and State Administrations.
              </p>
            </div>

            <div className="gov-pillars-grid">
              {/* Pillar 1: Voters */}
              <div className="gov-pillar-card">
                <div className="gov-pillar-header pillar-voter">
                  <span className="gov-pillar-icon">🗳️</span>
                  <div>
                    <span className="gov-pillar-tag">FOR ELECTORS</span>
                    <h3 className="gov-pillar-title">Citizen Service Portal</h3>
                  </div>
                </div>
                <p className="gov-pillar-desc">
                  Official statutory portal for voter enrollment, revisions, and identity cards under the Registration of Electors Rules.
                </p>
                <div className="gov-pillar-links">
                  <Link to="/register" className="gov-action-link">
                    <span>Form 6 (New Elector Registration)</span> →
                  </Link>
                  <Link to="/voters" className="gov-action-link">
                    <span>Form 8 (Correction / Shifting / PwD)</span> →
                  </Link>
                  <Link to="/voters" className="gov-action-link">
                    <span>Download Digital e-EPIC Card</span> →
                  </Link>
                  <Link to="/electoral-roll" className="gov-action-link">
                    <span>Search Name in Electoral Roll</span> →
                  </Link>
                  <Link to="/check-request" className="gov-action-link">
                    <span>Track Form & Appeal Status</span> →
                  </Link>
                </div>
                <Link to="/voters" className="gov-pillar-cta">
                  Enter Citizen Portal & All Forms →
                </Link>
              </div>

              {/* Pillar 2: cVIGIL */}
              <div className="gov-pillar-card">
                <div className="gov-pillar-header pillar-cvigil">
                  <span className="gov-pillar-icon">🚨</span>
                  <div>
                    <span className="gov-pillar-tag">MCC VIGILANCE</span>
                    <h3 className="gov-pillar-title">cVIGIL Redressal</h3>
                  </div>
                </div>
                <p className="gov-pillar-desc">
                  Empowering citizens to report Model Code of Conduct violations with real-time GPS geotagged photo/video evidence.
                </p>
                <div className="gov-pillar-links">
                  <Link to="/cvigil" className="gov-action-link">
                    <span>Submit Incident Report (Live GPS)</span> →
                  </Link>
                  <Link to="/cvigil" className="gov-action-link">
                    <span>District Control Centre (DCC) Feed</span> →
                  </Link>
                  <Link to="/cvigil" className="gov-action-link">
                    <span>Flying Squad (FST) Dispatch Tracker</span> →
                  </Link>
                  <Link to="/cvigil" className="gov-action-link">
                    <span>Returning Officer Decision Console</span> →
                  </Link>
                  <Link to="/cvigil" className="gov-action-link">
                    <span>100-Minute SLA Compliance Monitor</span> →
                  </Link>
                </div>
                <Link to="/cvigil" className="gov-pillar-cta cta-red">
                  Launch cVIGIL Operations Console →
                </Link>
              </div>

              {/* Pillar 3: Suvidha */}
              <div className="gov-pillar-card">
                <div className="gov-pillar-header pillar-suvidha">
                  <span className="gov-pillar-icon">🚩</span>
                  <div>
                    <span className="gov-pillar-tag">CANDIDATES & PARTIES</span>
                    <h3 className="gov-pillar-title">Suvidha 2.0 Portal</h3>
                  </div>
                </div>
                <p className="gov-pillar-desc">
                  Single-window system for candidate nominations, mandatory affidavits, and multi-departmental campaign clearances.
                </p>
                <div className="gov-pillar-links">
                  <Link to="/suvidha" className="gov-action-link">
                    <span>Online Candidate Nomination Drafts</span> →
                  </Link>
                  <Link to="/suvidha" className="gov-action-link">
                    <span>Affidavit Portal (Form 26 & KYC)</span> →
                  </Link>
                  <Link to="/suvidha" className="gov-action-link">
                    <span>Rally & Campaign Permissions</span> →
                  </Link>
                  <Link to="/suvidha" className="gov-action-link">
                    <span>Multi-Nodal Police & Fire Clearances</span> →
                  </Link>
                  <Link to="/suvidha" className="gov-action-link">
                    <span>FIFO Queue Transparency Tracker</span> →
                  </Link>
                </div>
                <Link to="/suvidha" className="gov-pillar-cta cta-orange">
                  Open Suvidha Candidate Suite →
                </Link>
              </div>

              {/* Pillar 4: ENCORE */}
              <div className="gov-pillar-card">
                <div className="gov-pillar-header pillar-encore">
                  <span className="gov-pillar-icon">📊</span>
                  <div>
                    <span className="gov-pillar-tag">ELECTION OPERATIONS</span>
                    <h3 className="gov-pillar-title">ENCORE & Results</h3>
                  </div>
                </div>
                <p className="gov-pillar-desc">
                  Core management platform for Returning Officers, Scrutiny, 2-Hour Turnout monitoring, EVM counting, and Index Cards.
                </p>
                <div className="gov-pillar-links">
                  <Link to="/encore" className="gov-action-link">
                    <span>Nomination Scrutiny & Form 7A</span> →
                  </Link>
                  <Link to="/encore" className="gov-action-link">
                    <span>2-Hour Poll Day Turnout Slots</span> →
                  </Link>
                  <Link to="/encore" className="gov-action-link">
                    <span>EVM & Postal Round Counting</span> →
                  </Link>
                  <Link to="/encore" className="gov-action-link">
                    <span>Constituency Index Card Generator</span> →
                  </Link>
                  <Link to="/ceo-himachal" className="gov-action-link">
                    <span>CEO Himachal Pradesh Portal</span> →
                  </Link>
                </div>
                <Link to="/encore" className="gov-pillar-cta cta-blue">
                  Access ENCORE Operations Suite →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* News & Official Notices Hub (7 Tabs from research audit) */}
        <section className="gov-news-section" aria-label="Official Communications and Notices">
          <div className="gov-news-container">
            <div className="gov-news-header">
              <div>
                <span className="gov-section-badge">OFFICIAL GAZETTE & NOTICES</span>
                <h2 className="gov-section-title">Media, Updates & Notifications</h2>
              </div>
              <div className="gov-search-hint">
                <span>🔍 Filter and access official gazettes & orders</span>
              </div>
            </div>

            <div className="gov-news-tabs-wrapper">
              <div className="gov-tabs-nav" role="tablist">
                {newsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className={`gov-tab-btn ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>

              <div className="gov-tab-content-panel" role="tabpanel">
                <div className="gov-news-items-list">
                  {activeTabContent?.items.map((item, i) => (
                    <article key={i} className="gov-news-item">
                      <div className="gov-news-date-col">
                        <span className="gov-news-date">{item.date}</span>
                        {item.isNew && <span className="gov-new-tag">NEW</span>}
                      </div>
                      <div className="gov-news-title-col">
                        <h4 className="gov-news-headline">{item.title}</h4>
                      </div>
                      <div className="gov-news-action-col">
                        <span className="gov-pdf-download-btn" title="Download Official Order">
                          PDF 📥
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* EVM & VVPAT Transparency Section */}
        <section className="gov-evm-section" aria-label="EVM and VVPAT Integrity">
          <div className="gov-evm-container">
            <div className="gov-evm-content">
              <span className="gov-evm-tag">SECURITY & TRUST</span>
              <h2 className="gov-evm-title">EVM & VVPAT: Integrity of the Vote</h2>
              <p className="gov-evm-description">
                Electronic Voting Machines (EVMs) and Voter Verifiable Paper Audit Trail (VVPAT) units are standalone, battery-powered devices. They have no internet, Wi-Fi, Bluetooth, or wireless interface, ensuring complete immunity against external cyber interference.
              </p>
              <div className="gov-evm-features">
                <div className="gov-evm-feat-item">
                  <span className="gov-feat-check">✓</span>
                  <div>
                    <strong>One-Time Programmable (OTP) Chips</strong>
                    <p>Microcontrollers burned at manufacturing; cannot be reprogrammed or rewritten.</p>
                  </div>
                </div>
                <div className="gov-evm-feat-item">
                  <span className="gov-feat-check">✓</span>
                  <div>
                    <strong>100% Mock Poll with Agents</strong>
                    <p>Mandatory mock poll in presence of candidates before polling begins, with printed slip verification.</p>
                  </div>
                </div>
                <div className="gov-evm-feat-item">
                  <span className="gov-feat-check">✓</span>
                  <div>
                    <strong>Two-Stage Randomization</strong>
                    <p>Constituency and polling-station allotment done through randomized software in front of political observers.</p>
                  </div>
                </div>
              </div>
              <div className="gov-evm-action-links">
                <Link to="/media-publications" className="gov-btn-primary">
                  Read EVM Manuals & Status Paper →
                </Link>
                <Link to="/media-publications" className="gov-btn-outline">
                  View EVM Judicial Orders
                </Link>
              </div>
            </div>

            <div className="gov-evm-visual-box">
              <div className="gov-evm-diagram-card">
                <div className="gov-evm-unit">
                  <span className="gov-unit-icon">🗳️</span>
                  <strong>Ballot Unit (BU)</strong>
                  <span>Where elector presses button</span>
                </div>
                <div className="gov-evm-cable">◄ Cable Connection ►</div>
                <div className="gov-evm-unit">
                  <span className="gov-unit-icon">🧾</span>
                  <strong>VVPAT Unit</strong>
                  <span>7-second visible paper slip</span>
                </div>
                <div className="gov-evm-cable">◄ Cable Connection ►</div>
                <div className="gov-evm-unit">
                  <span className="gov-unit-icon">📟</span>
                  <strong>Control Unit (CU)</strong>
                  <span>Retained by Presiding Officer</span>
                </div>
              </div>
              <div className="gov-evm-note">
                🔒 Sealed with specialized pink paper seals and signed by polling agents of contesting parties.
              </div>
            </div>
          </div>
        </section>

        {/* State CEO Spotlight: CEO Himachal Pradesh */}
        <section className="gov-state-spotlight-section" aria-label="CEO Himachal Pradesh Special Portal">
          <div className="gov-state-spotlight-container">
            <div className="gov-state-card">
              <div className="gov-state-badge">STATE SPOTLIGHT · HIMACHAL PRADESH</div>
              <h2 className="gov-state-title">Chief Electoral Officer, Himachal Pradesh</h2>
              <p className="gov-state-desc">
                Access Himachal Pradesh electoral profiles across 12 Districts, 68 Assembly Constituencies, GIS Polling Station maps, Special Summary Revision 2026 notices, and the 24x7 <strong>Voter Saathi Virtual Assistant</strong>.
              </p>
              <div className="gov-state-stats">
                <div className="gov-stat-item">
                  <strong>12</strong>
                  <span>Districts</span>
                </div>
                <div className="gov-stat-item">
                  <strong>68</strong>
                  <span>Assembly ACs</span>
                </div>
                <div className="gov-stat-item">
                  <strong>4</strong>
                  <span>Lok Sabha PCs</span>
                </div>
                <div className="gov-stat-item">
                  <strong>7,990+</strong>
                  <span>Polling Stations</span>
                </div>
              </div>
              <div className="gov-state-actions">
                <Link to="/ceo-himachal" className="gov-btn-primary">
                  Explore CEO Himachal Portal →
                </Link>
                <Link to="/ceo-himachal" className="gov-btn-secondary">
                  Chat with Voter Saathi 🤖
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <GovFooter />
    </div>
  );
}

import { Link } from "react-router-dom";
import EciEmblem from "./EciEmblem";

// Sitemap only. Sign-in options live in the Sign in menu and registration lives in the Voters menu,
// so neither is repeated here.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <EciEmblem size={44} />
          <h2 style={{ marginTop: 12 }}>Election Commission of India</h2>
          <p>Nirvachan Sadan, Ashoka Road, New Delhi 110001</p>
          <p>complaints@eci.gov.in<br />info@eci.gov.in</p>
          <a className="helpline" href="tel:1950">Voter helpline 1950</a>
        </div>
        <div>
          <h2>Voters</h2>
          <ul>
            <li><Link to="/electoral-roll">Electoral roll search</Link></li>
            <li><Link to="/check-request">Application status</Link></li>
            <li><Link to="/voters">Voter Mitra</Link></li>
          </ul>
        </div>
        <div>
          <h2>Elections</h2>
          <ul>
            <li><Link to="/report-violation">Report a violation</Link></li>
            <li><Link to="/candidates">Candidates and parties</Link></li>
            <li><Link to="/results">Results and counting</Link></li>
          </ul>
        </div>
        <div>
          <h2>About</h2>
          <ul>
            <li><Link to="/states">State election offices</Link></li>
            <li><Link to="/media">Awareness and media</Link></li>
            <li><Link to="/roles">Roles and access</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-base">
        <div className="container">© 2026 Election Commission of India. Content is owned and maintained by the Commission.</div>
      </div>
    </footer>
  );
}

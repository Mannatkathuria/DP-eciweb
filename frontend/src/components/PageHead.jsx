import { Link } from "react-router-dom";

/** Page title block with a breadcrumb trail: crumbs is [{label, to?}] after Home. */
export default function PageHead({ title, lede, crumbs = [], children }) {
  return (
    <div className="page-head">
      <div className="container">
        <ol className="crumbs" aria-label="Breadcrumb">
          <li><Link to="/home">Home</Link></li>
          {crumbs.map((c) => <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>)}
        </ol>
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </div>
  );
}

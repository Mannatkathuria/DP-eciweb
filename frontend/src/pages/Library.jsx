import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/axios";
import "../styles/desk.css";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import { apiMessage } from "../config/elections";

// The reference library: handbooks and manuals, the compendium of instructions, eBooks, the FAQ
// and training material, with search; and a reader with chapters, page-by-page navigation and printing.

const TABS = [["handbook", "Handbooks"], ["compendium", "Compendium"], ["ebook", "eBooks"], ["faq", "FAQ"], ["training", "Training material"]];

export default function Library() {
    const [tab, setTab] = useState("handbook");
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [items, setItems] = useState([]);
    const [meta, setMeta] = useState(null);
    const [cat, setCat] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    useEffect(() => { api.get("/library/meta").then((r) => setMeta(r.data.data)).catch(() => {}); }, []);
    useEffect(() => {
        setLoading(true);
        api.get("/library", { params: query ? { q: query } : { type: tab } })
            .then((r) => { setItems(r.data.data.items); setError(""); })
            .catch((e) => setError(apiMessage(e, "The library could not be loaded.")))
            .finally(() => setLoading(false));
    }, [tab, query]);
    const faqCats = useMemo(() => [...new Set(items.filter((x) => x.type === "faq").map((x) => x.category))], [items]);
    const shown = items.filter((x) => !cat || x.category === cat);
    return (
        <>
            <PageHead title="Handbooks, instructions and answers" crumbs={[{ label: "Library" }]}
                lede="Handbooks and manuals for every election officer, the compendium of the Commission's instructions, eBooks on India's elections, answers to common questions, and training material. Summaries written for this platform; the Commission's own documents are authoritative." />
            <section className="section">
                <div className="container stack">
                    <form className="panel lib-search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setCat(""); }}>
                        <label htmlFor="lib-q" className="lib-search-label">Search everything</label><div className="lib-search-row"><input id="lib-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. mock poll, Form 7A, VVPAT, security deposit" />
                        <button className="btn btn-primary">Search</button>
                        {query && <button type="button" className="btn btn-quiet" onClick={() => { setQ(""); setQuery(""); }}>Clear</button>}</div>
                    </form>
                    {!query && <Tabs label="Library sections" active={tab} onChange={(t) => { setTab(t); setCat(""); }} tabs={TABS.map(([id, label]) => ({ id, label: meta?.counts?.[id] ? `${label} (${meta.counts[id]})` : label }))} />}
                    {query && <p className="muted">{items.length} result(s) for “{query}”.</p>}
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {loading && <p className="muted" role="status">Loading…</p>}
                    {!query && tab === "faq" && (
                        <div className="row-actions">{["", ...faqCats].map((c) => <button key={c || "all"} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c || "All topics"}</button>)}</div>
                    )}
                    {(tab === "faq" && !query) ? (
                        <div className="panel">
                            {shown.map((x) => <details key={x._id} className="faq-item"><summary><strong>{x.title}</strong> <small className="muted">· {x.category}</small></summary><p>{x.answer ?? x.summary}</p></details>)}
                        </div>
                    ) : (
                        <div className="screens">
                            {shown.map((x) => x.type === "faq"
                                ? <details key={x._id} className="screen-card"><summary><strong>{x.title}</strong></summary><small>{x.answer ?? x.summary}</small></details>
                                : <Link key={x._id} className="screen-card lib-card" to={`/library/${x.slug}`}>
                                    <strong>{x.title}</strong>
                                    <small>{x.summary}</small>
                                    <small className="muted">{[x.category, x.reference, x.issuedOn, x.chapterCount ? `${x.chapterCount} chapters · ${x.pageCount} pages` : null].filter(Boolean).join(" · ")}</small>
                                </Link>)}
                        </div>
                    )}
                    {!loading && !shown.length && <p className="muted">Nothing here yet.</p>}
                </div>
            </section>
        </>
    );
}

/** A publication: table of contents, one page at a time, printable. */
export function LibraryReader() {
    const { slug } = useParams();
    const [item, setItem] = useState(null);
    const [error, setError] = useState("");
    const [pos, setPos] = useState({ c: 0, p: 0 });
    useEffect(() => { api.get(`/library/${slug}`).then((r) => setItem(r.data.data)).catch((e) => setError(apiMessage(e, "Not found."))); }, [slug]);
    const pages = useMemo(() => (item?.chapters ?? []).flatMap((ch, c) => ch.pages.map((text, p) => ({ c, p, text, chapter: ch.title }))), [item]);
    const index = pages.findIndex((x) => x.c === pos.c && x.p === pos.p);
    const go = (i) => { const t = pages[Math.max(0, Math.min(pages.length - 1, i))]; if (t) setPos({ c: t.c, p: t.p }); };
    useEffect(() => {
        const key = (e) => { if (e.key === "ArrowRight") go(index + 1); if (e.key === "ArrowLeft") go(index - 1); };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    });
    if (error) return <section className="section"><div className="container"><div className="alert alert-error">{error}</div><Link to="/library">Back to the library</Link></div></section>;
    if (!item) return <section className="section"><div className="container"><p className="muted">Loading…</p></div></section>;
    const page = pages[index];
    return (
        <>
            <PageHead title={item.title} lede={item.summary} crumbs={[{ label: "Library", to: "/library" }, { label: item.title }]} />
            <section className="section">
                <div className="container reader">
                    <nav className="reader-toc panel no-print" aria-label="Contents">
                        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Contents</h2>
                        <ol>{(item.chapters ?? []).map((ch, c) => <li key={c}><button type="button" className={pos.c === c ? "on" : ""} onClick={() => setPos({ c, p: 0 })}>{ch.title}</button></li>)}</ol>
                        <button type="button" className="btn btn-quiet btn-small" onClick={() => window.print()}>Print this publication</button>
                        {item.media?.length > 0 && <><h3 style={{ fontSize: ".9rem" }}>Videos</h3><ul>{item.media.map((m) => <li key={m.title}><small>{m.title}</small></li>)}</ul></>}
                    </nav>
                    <article className="panel reader-page">
                        {page ? <>
                            <p className="muted" style={{ marginTop: 0 }}>{page.chapter} · page {index + 1} of {pages.length}</p>
                            <p style={{ fontSize: "1.08rem", lineHeight: 1.7 }}>{page.text}</p>
                            <div className="desk-actions no-print">
                                <button type="button" className="btn btn-quiet" disabled={index <= 0} onClick={() => go(index - 1)}>← Previous</button>
                                <button type="button" className="btn btn-primary" disabled={index >= pages.length - 1} onClick={() => go(index + 1)}>Next →</button>
                            </div>
                        </> : <p>{item.body}</p>}
                        <div className="print-all">{(item.chapters ?? []).map((ch, c) => <section key={c}><h2>{ch.title}</h2>{ch.pages.map((t, i) => <p key={i}>{t}</p>)}</section>)}</div>
                    </article>
                </div>
            </section>
        </>
    );
}

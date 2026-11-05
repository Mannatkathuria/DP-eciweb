// The reference library: handbooks and manuals, the compendium of instructions, eBooks, the FAQ
// and training material. Public to read; the Commission's administrators publish and archive.
// MongoDB is the system of record (collection `library_items`, with a text index for search).
import { ALL_LIBRARY_ITEMS, FAQ_CATEGORIES, LIBRARY_TYPES } from "../data/library.js";
import { docStore } from "../services/docStore.service.js";
import { auditChange, clean, newId, nowIso, oneOf, requireText } from "../services/workflow.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const items = docStore("library_items", { textFields: ["title", "summary", "body", "tags", "chapters.title", "chapters.pages"] });
let seeded = null;

/** Loads the starter library the first time it is read (idempotent: unique type + slug). */
export const ensureLibrary = () => {
    seeded ??= (async () => {
        if (await items.count()) return;
        const at = nowIso();
        await items.insertMany(ALL_LIBRARY_ITEMS.map((x) => ({ _id: newId(), status: "published", version: 1, createdAt: at, updatedAt: at, publishedBy: "SEED", tags: [], ...x })));
    })().catch((err) => { seeded = null; throw err; });
    return seeded;
};

const listView = ({ body, chapters, ...x }) => ({ ...x, chapterCount: chapters?.length ?? 0, pageCount: (chapters ?? []).reduce((n, c) => n + (c.pages?.length ?? 0), 0), ...(x.type === "faq" ? { answer: body } : {}) });

export const libraryMeta = asyncHandler(async (req, res) => {
    await ensureLibrary();
    res.json({ success: true, data: { types: LIBRARY_TYPES, faqCategories: FAQ_CATEGORIES, counts: await items.countBy("type", { status: "published" }), store: items.backend() } });
});

export const listLibrary = asyncHandler(async (req, res) => {
    await ensureLibrary();
    const filter = { status: "published" };
    if (req.query.type) filter.type = oneOf(req.query.type, LIBRARY_TYPES, "type");
    if (req.query.category) filter.category = clean(req.query.category, 80);
    if (req.query.audience) filter.audience = clean(req.query.audience, 40);
    const q = clean(req.query.q, 100) || null;
    const found = await items.find(filter, { q, sort: q ? null : { type: 1, category: 1, title: 1 }, limit: 300 });
    res.json({ success: true, data: { items: found.map(listView), store: items.backend() } });
});

export const getLibraryItem = asyncHandler(async (req, res) => {
    await ensureLibrary();
    const item = await items.findOne({ slug: clean(req.params.slug, 120), status: "published" });
    if (!item) throw new ApiError(404, "No such publication.");
    res.json({ success: true, data: item });
});

const slugOf = (s) => clean(s, 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Commission administrators: publish a new item or a new version of one (same type and slug). */
export const publishLibraryItem = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const type = oneOf(b.type, LIBRARY_TYPES, "type");
    const title = requireText(b.title, "Title", { min: 3, max: 200 });
    const slug = slugOf(b.slug || title);
    if (!slug) throw new ApiError(400, "Give a title.");
    const chapters = Array.isArray(b.chapters) ? b.chapters.slice(0, 60).map((c) => ({ title: requireText(c.title, "Chapter title", { min: 1, max: 200 }),
        pages: (Array.isArray(c.pages) ? c.pages : [c.text]).filter(Boolean).slice(0, 100).map((p) => clean(p, 6000)) })) : [];
    const doc = {
        type, slug, title, summary: requireText(b.summary, "Summary", { min: 5, max: 600 }), body: clean(b.body, 20000) || null,
        category: clean(b.category, 80) || null, audience: Array.isArray(b.audience) ? b.audience.map((a) => clean(a, 40)) : [],
        reference: clean(b.reference, 80) || null, issuedOn: clean(b.issuedOn, 10) || null, chapters, tags: Array.isArray(b.tags) ? b.tags.map((t) => clean(t, 40)).slice(0, 20) : [],
        status: "published", updatedAt: nowIso(), publishedBy: req.user.epic
    };
    if (type === "faq" && !doc.body) doc.body = doc.summary;
    const saved = await items.withLock(`${type}:${slug}`, async () => {
        const existing = await items.findOne({ type, slug });
        const next = existing ? { ...existing, ...doc, version: (existing.version ?? 1) + 1 } : { _id: newId(), createdAt: doc.updatedAt, version: 1, ...doc };
        await items.put(next);
        return next;
    });
    await auditChange(req, saved.version > 1 ? "library.revised" : "library.published", { type: "library", id: saved._id }, {}, { after: { type, slug, version: saved.version } });
    res.status(201).json({ success: true, message: saved.version > 1 ? `Version ${saved.version} published.` : "Published.", data: saved });
});

export const archiveLibraryItem = asyncHandler(async (req, res) => {
    const item = await items.findOne({ slug: clean(req.params.slug, 120) });
    if (!item) throw new ApiError(404, "No such publication.");
    await items.put({ ...item, status: "archived", archivedAt: nowIso(), archivedBy: req.user.epic });
    await auditChange(req, "library.archived", { type: "library", id: item._id }, {}, { after: { slug: item.slug } });
    res.json({ success: true, message: "Archived." });
});

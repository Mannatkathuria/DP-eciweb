// Voter Mitra: matches a citizen's question to an ECI service and explains it (what it is, the
// steps, the form, the documents, where to start and where the rule comes from). Matching is by
// keywords over a fixed catalogue (data/services.js) plus the library's FAQ, so every answer is
// one the Commission's material supports. When nothing matches, it says so and offers the
// helpline. It never submits anything and never changes a record.
import { GROUPS, SERVICES } from "../data/services.js";
import { docStore } from "../services/docStore.service.js";
import { ensureLibrary } from "./library.controller.js";
import { clean } from "../services/workflow.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const view = ({ keywords, ...s }) => s; // eslint-disable-line no-unused-vars
const norm = (s) => ` ${String(s ?? "").toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim()} `;

/** Score each service: whole keyword phrases count most; the form name ("form 7") wins outright. */
export const matchServices = (question) => {
    const q = norm(question);
    const formNo = q.match(/ form ?(\d+[ab]?) /)?.[1];
    return SERVICES.map((s) => {
        let score = 0;
        // Whole words or phrases; longer stems ("migrat", "passed") also match inside a word.
        for (const k of s.keywords) if (q.includes(norm(k)) || (!k.includes(" ") && (k.length >= 5 || /[^\x00-\x7f]/.test(k)) && q.includes(k.toLowerCase())) || (/[^\x00-\x7f]/.test(k) && q.includes(k))) score += k.includes(" ") ? 3 : 2;
        if (formNo && s.form && norm(s.form).includes(` form ${formNo} `)) score += 4;
        return { s, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
};

export const assistServices = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { groups: GROUPS, services: SERVICES.map(view) } });
});

export const askAssistant = asyncHandler(async (req, res) => {
    const question = clean(req.body?.question, 300);
    if (question.length < 2) return res.status(400).json({ success: false, message: "Ask a question, for example: How do I correct my name?" });
    const ranked = matchServices(question);
    await ensureLibrary().catch(() => {});
    const faqs = await docStore("library_items", { textFields: ["title", "summary", "body"] }).find({ status: "published", type: "faq" }, { q: question, limit: 3 }).catch(() => []);
    const best = ranked[0]?.s ?? null;
    res.json({ success: true, data: {
        question, answer: best ? view(best) : null,
        related: ranked.slice(1, 4).map((x) => ({ id: x.s.id, title: x.s.title })),
        faqs: faqs.map((f) => ({ slug: f.slug, question: f.title, answer: f.body ?? f.summary, category: f.category })),
        fallback: best ? null : "I could not find a service for that. Try other words, look through the list of services, or call the voter helpline 1950."
    } });
});

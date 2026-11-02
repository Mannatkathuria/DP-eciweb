// Fuzzy elector search for the polling party and the voter assistance booth. No external
// dependency: names are normalised (case, accents, punctuation), reduced to a simple phonetic key
// that absorbs common spelling variants of Indian names in Roman script (ee/i, oo/u, w/v, ph/f,
// sh/s, kh/k, doubled letters, a trailing "a"), and compared token by token with an edit distance.
// The search only ever runs over one part's electors, so a linear scan is fine (a part has a few
// hundred to about 1,500 electors).

// Common abbreviations in Indian electoral rolls, expanded before matching.
const ALIASES = { mohd: "mohammad", md: "mohammad", mohammed: "mohammad", muhammad: "mohammad", kr: "kumar", pd: "prasad", smt: "", shri: "", sri: "", km: "kumari" };
export const normalise = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).map((w) => ALIASES[w] ?? w).filter(Boolean).join(" ");

const PHONETIC = [[/x/g, "ks"], [/ph/g, "f"], [/w/g, "v"], [/(sh|ch)/g, "s"], [/kh/g, "k"], [/gh/g, "g"], [/th/g, "t"], [/dh/g, "d"], [/bh/g, "b"],
    [/z/g, "j"], [/q/g, "k"], [/ee|ea|ie|y/g, "i"], [/oo|ou/g, "u"], [/aa/g, "a"], [/(.)\1+/g, "$1"], [/h(?=[^aeiou]|$)/g, ""], [/a$/g, ""]];
export const phonetic = (word) => PHONETIC.reduce((w, [re, to]) => w.replace(re, to), word);

/** Damerau-Levenshtein distance (optimal string alignment), capped for speed. */
export const distance = (a, b, cap = 3) => {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
};

/** How well one query word matches one name word: 1 exact, lower for prefix, phonetic or typo matches; 0 none. */
const wordScore = (q, w) => {
    if (!q || !w) return 0;
    if (q === w) return 1;
    if (w.startsWith(q) && q.length >= 2) return 0.9;
    const pq = phonetic(q); const pw = phonetic(w);
    if (pq === pw) return 0.85;
    if (pw.startsWith(pq) && pq.length >= 3) return 0.75;
    // Typos: one edit for short words, two for longer ones, and never more than a third of the
    // shorter word, so very short or unrelated words do not match.
    const shorter = Math.min(q.length, w.length);
    if (shorter < 3) return 0;
    const allowed = Math.min(shorter <= 4 ? 1 : 2, Math.floor(shorter / 3));
    const dist = Math.min(distance(q, w, allowed), Math.min(pq.length, pw.length) >= 3 ? distance(pq, pw, allowed) : allowed + 1);
    return dist <= allowed ? (7 - dist) / 10 : 0;
};

/** Every query word must match some word of the text; the score is the average of the best matches. */
export const textScore = (query, text) => {
    const qs = normalise(query).split(" ").filter(Boolean);
    const ws = normalise(text).split(" ").filter(Boolean);
    if (!qs.length || !ws.length) return 0;
    let total = 0;
    for (const q of qs) {
        const best = Math.max(0, ...ws.map((w) => wordScore(q, w)));
        if (!best) return 0;
        total += best;
    }
    return total / qs.length;
};

/**
 * Ranks electors for a query. Fields: EPIC (exact), serial number (exact, numbers only), name,
 * relative's name and house number. `field` limits the search to one of them.
 * Returns [{ elector, score, matchedOn }] best first.
 */
export const rankElectors = (electors, query, { field = "any", serialOf = () => null } = {}) => {
    const q = normalise(query);
    if (!q) return electors.map((elector) => ({ elector, score: 0, matchedOn: null }));
    const out = [];
    for (const e of electors) {
        let best = { score: 0, matchedOn: null };
        const consider = (score, matchedOn) => { if (score > best.score) best = { score, matchedOn }; };
        if ((field === "any" || field === "epic") && normalise(e.epic) === q.replace(/ /g, "")) consider(1.2, "epic");
        if ((field === "any" || field === "serial") && /^\d+$/.test(q) && String(serialOf(e)) === q) consider(1.1, "serial");
        if (field === "any" || field === "name") consider(textScore(q, e.name), "name");
        if ((field === "any" || field === "relative") && e.relativeName) consider(textScore(q, e.relativeName) * 0.95, "relative");
        if ((field === "any" || field === "house") && e.houseNumber) {
            const h = normalise(e.houseNumber);
            consider(h === q ? 1 : h.split(" ").includes(q) ? 0.9 : 0, "house");
        }
        if (best.score >= 0.5) out.push({ elector: e, ...best });
    }
    return out.sort((a, b) => b.score - a.score || a.elector.name.localeCompare(b.elector.name));
};

/**
 * Builds src/data/geography.json (State/UT -> District -> Assembly Constituency) from the
 * Election Commission of India's own master lists, as used by the ECI Voters' Services Portal
 * (https://electoralsearch.eci.gov.in/). See docs/CONSTITUENCY_DATA.md for how the two input
 * files are captured.
 *
 * Usage (from the backend folder):
 *   node scripts/build-geography-eci.js <live-export.json> [<bundle-export.json>]
 *
 *   live-export.json   States, districts and constituencies read from the portal's public lookup
 *                      service (gateway-voters.eci.gov.in/api/v1/common/{states,districts,acs}).
 *                      This is the primary source.
 *   bundle-export.json The same master lists embedded in the portal's application bundle. Optional;
 *                      used only to cross-check the live lists and to add each seat's reservation
 *                      category (GEN / SC / ST), which the live service does not return.
 *
 * Nothing is guessed: a constituency is listed under the district ECI assigns it to. A district
 * for which ECI lists no constituency offers the whole State/UT list instead (acScope "state").
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// States/UTs without a legislative assembly. ECI lists their Parliamentary Constituency in the
// assembly field (Form 6: "No. & Name of Parliamentary Constituency, only for UTs not having
// Legislative Assembly"), so they are kept but labelled as parliamentary constituencies.
const NO_LEGISLATURE = new Set(["U01", "U02", "U03", "U06", "U09"]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const byNo = (a, b) => a.no - b.no;

const main = () => {
    const [livePath, bundlePath] = process.argv.slice(2);
    if (!livePath) {
        console.error("Usage: node scripts/build-geography-eci.js <live-export.json> [<bundle-export.json>]");
        process.exit(1);
    }
    const live = readJson(livePath);
    const bundle = bundlePath ? readJson(bundlePath) : null;

    const category = new Map(); // "S01-12" -> category, from the bundle
    if (bundle) for (const a of bundle.constituencies) category.set(`${a.stateCd}-${a.acNo}`, { cat: clean(a.category), name: clean(a.acName) });

    const bundleStateName = new Map((bundle?.states || []).map((s) => [s.stateCd, s.stateName]));
    const report = { mismatches: [], onlyInBundle: [], onlyInLive: [] };
    const states = live.states.map((s) => {
        const code = s.stateCd;
        const parliamentary = NO_LEGISLATURE.has(code);
        const acs = live.constituencies.filter((a) => a.stateCd === code).map((a) => ({
            id: `${code}-${a.acNo}`,
            no: Number(a.acNo),
            name: clean(a.acName),
            districtCode: a.districtCd,
            category: category.get(`${code}-${a.acNo}`)?.cat || null,
            pcNo: a.pcNo ? Number(a.pcNo) : null,
            pcName: clean(a.pcName) || null
        })).sort(byNo);
        for (const a of acs) {
            const b = category.get(a.id);
            if (bundle && !b) report.onlyInLive.push(`${s.stateName}: ${a.no} ${a.name}`);
            else if (b && b.name.toLowerCase() !== a.name.toLowerCase()) report.mismatches.push(`${s.stateName} ${a.no}: live "${a.name}" / bundle "${b.name}"`);
        }
        const districts = live.districts.filter((d) => d.stateCd === code)
            .map((d) => ({ code: d.districtCd, no: Number(d.districtNo), name: clean(d.districtName) }))
            .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })); // alphabetical for the dropdown
        return {
            // The lookup service spells one name differently from the portal's own list
            // ("Chattisgarh" / "Chhattisgarh"); the portal list's spelling is used when given.
            name: clean(bundleStateName.get(code) || s.stateNameInBundle || s.stateName),
            code,
            type: (s.stateType || (code.startsWith("U") ? "UT" : "ST")) === "UT" ? "Union Territory" : "State",
            // "available" for every State/UT: each now has at least one selectable constituency.
            constituencies: acs.length ? "available" : "unavailable",
            constituencyType: parliamentary ? "parliamentary" : "assembly",
            totalConstituencies: acs.length,
            districts: districts.map((d) => {
                const own = acs.filter((a) => a.districtCode === d.code);
                const list = own.length ? own : acs; // ECI lists none for this district: offer the whole State/UT
                return {
                    name: d.name,
                    code: d.code,
                    acScope: own.length ? "district" : "state",
                    // Display names, kept for existing callers (Form 8, validateGeography).
                    constituencies: list.map((a) => a.name),
                    acs: list.map(({ districtCode, ...a }) => a) // eslint-disable-line no-unused-vars
                };
            })
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (bundle) {
        const liveIds = new Set(live.constituencies.map((a) => `${a.stateCd}-${a.acNo}`));
        for (const a of bundle.constituencies) if (!liveIds.has(`${a.stateCd}-${a.acNo}`)) report.onlyInBundle.push(`${a.stateCd} ${a.acNo} ${a.acName}`);
    }

    const output = {
        source: {
            name: "Election Commission of India: Voters' Services Portal master lists",
            url: "https://electoralsearch.eci.gov.in/",
            service: "https://gateway-voters.eci.gov.in/api/v1/common/ (states, districts/{stateCd}, acs/{districtCd})",
            retrieved: live.source?.extractedAt?.slice(0, 10) || null,
            crossChecked: bundle ? `Portal application bundle ${bundle.source?.file || ""} (${bundle.source?.extractedAt?.slice(0, 10) || ""})` : null,
            documentation: "docs/CONSTITUENCY_DATA.md"
        },
        states
    };
    const here = path.dirname(fileURLToPath(import.meta.url));
    const target = path.join(here, "..", "src", "data", "geography.json");
    fs.writeFileSync(target, `${JSON.stringify(output)}\n`);

    const legislative = states.filter((s) => s.constituencyType === "assembly").reduce((n, s) => n + s.totalConstituencies, 0);
    console.log(`Wrote ${target}`);
    console.log(`States/UTs: ${states.length}; districts: ${states.reduce((n, s) => n + s.districts.length, 0)}; assembly constituencies: ${legislative}; ` +
        `parliamentary (UTs without assembly): ${states.filter((s) => s.constituencyType === "parliamentary").reduce((n, s) => n + s.totalConstituencies, 0)}`);
    console.log(`Districts offering the whole State/UT list (ECI lists no seat for them): ${states.flatMap((s) => s.districts.filter((d) => d.acScope === "state").map((d) => `${s.name} / ${d.name}`)).join("; ") || "none"}`);
    if (bundle) console.log(`Cross-check with bundle: ${report.mismatches.length} name differences, ${report.onlyInLive.length} only in live, ${report.onlyInBundle.length} only in bundle`);
    return report;
};

const report = main();
if (process.env.PRINT_REPORT) console.log(JSON.stringify(report, null, 1));

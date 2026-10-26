/**
 * Builds src/data/geography.json (State/UT -> District -> Assembly constituency) from the
 * official Local Government Directory (LGD, https://lgdirectory.gov.in) CSV exports.
 *
 * Usage (from the backend folder):
 *   node scripts/build-geography.js <folder-with-LGD-csv-files> <retrieved-date YYYY-MM-DD>
 *
 * The folder must contain these LGD exports (file names may carry a date suffix, e.g.
 * "districts.25Oct2026.csv"): states, districts, subdistricts, villages,
 * statewise_ulbs_coverage, urban_local_body_wards, assembly_constituencies,
 * constituency_coverage. A daily mirror of these exports is published at
 * https://github.com/ramSeraph/opendata (release "lgd-latest").
 *
 * Constituency -> district links are derived only from LGD's own constituency coverage
 * records (district, sub-district, village, local body and ward entities). Nothing is guessed:
 * a constituency with no coverage record is left out and listed under "unmappedConstituencies".
 */
import fs from "fs";
import path from "path";
import readline from "readline";

// States/UTs without a legislative assembly. LGD lists a "Chandigarh" assembly constituency,
// but Chandigarh has no legislature, so it is excluded with the others.
const NO_LEGISLATURE = new Set([
    "Andaman And Nicobar Islands", "Chandigarh", "Ladakh", "Lakshadweep",
    "The Dadra And Nagar Haveli And Daman And Diu"
]);

// States whose LGD constituency list does not yet reflect the latest delimitation.
// Their constituencies are withheld rather than shown with outdated names.
const OUTDATED_IN_LGD = {
    "Jammu And Kashmir": "LGD still lists the constituencies from before the 2022 delimitation.",
    "Assam": "LGD does not yet list the constituencies from the 2023 delimitation."
};

const parseLine = (line) => {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
            else if (ch === '"') quoted = false;
            else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
    }
    out.push(cur);
    return out;
};

const findFile = (dir, prefix) => {
    const name = fs.readdirSync(dir).find((f) => f === `${prefix}.csv` || (f.startsWith(`${prefix}.`) && f.endsWith(".csv")));
    if (!name) throw new Error(`Missing LGD file "${prefix}*.csv" in ${dir}`);
    return path.join(dir, name);
};

// Streams a CSV and calls onRow with an object keyed by header names.
const readCsv = async (dir, prefix, onRow) => {
    const rl = readline.createInterface({ input: fs.createReadStream(findFile(dir, prefix), "utf8"), crlfDelay: Infinity });
    let header = null;
    for await (const raw of rl) {
        const line = raw.replace(/^﻿/, "");
        if (!line.trim()) continue;
        const cells = parseLine(line);
        if (!header) { header = cells.map((h) => h.trim()); continue; }
        const row = {};
        header.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
        onRow(row);
    }
};

const byName = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });

const main = async () => {
    const [dir, retrieved] = process.argv.slice(2);
    if (!dir || !/^\d{4}-\d{2}-\d{2}$/.test(retrieved || "")) {
        console.error("Usage: node scripts/build-geography.js <lgd-csv-folder> <YYYY-MM-DD>");
        process.exit(1);
    }

    const states = new Map(); // stateCode -> { name, type }
    await readCsv(dir, "states", (r) => states.set(r["State Code"], {
        name: r["State Name (In English)"], type: r["State or UT"] === "U" ? "Union Territory" : "State"
    }));

    const districts = new Map(); // districtCode -> { name, stateCode }
    await readCsv(dir, "districts", (r) => districts.set(r["District Code"], {
        name: r["District Name(In English)"], stateCode: r["State Code"]
    }));

    const subToDistrict = new Map();
    await readCsv(dir, "subdistricts", (r) => subToDistrict.set(r["Sub-district Code"], r["District Code"]));

    const villageToDistrict = new Map();
    await readCsv(dir, "villages", (r) => villageToDistrict.set(r["Village Code"], r["District Code"]));

    const localBodyToDistricts = new Map();
    await readCsv(dir, "statewise_ulbs_coverage", (r) => {
        if (!localBodyToDistricts.has(r["Local Body Code"])) localBodyToDistricts.set(r["Local Body Code"], new Set());
        localBodyToDistricts.get(r["Local Body Code"]).add(r["District Code"]);
    });

    const wardToLocalBody = new Map();
    await readCsv(dir, "urban_local_body_wards", (r) => wardToLocalBody.set(r["Ward Code"], r["Local Body Code"]));

    const constituencies = new Map(); // acCode -> { name, stateCode }
    await readCsv(dir, "assembly_constituencies", (r) => {
        const code = r["Assembly Constituency Code"];
        if (code && code !== "0") constituencies.set(code, { name: r["Assembly Constituency Name"], stateCode: r["State Code"] });
    });

    const acDistricts = new Map(); // acCode -> Set(districtCode)
    await readCsv(dir, "constituency_coverage", (r) => {
        const ac = constituencies.get(r["Assembly Constituency Code"]);
        if (!ac) return;
        const code = r["Entity Code"];
        let found = [];
        switch (r["Entity Type"]) {
            case "District": found = [code]; break;
            case "SubDistrict": found = [subToDistrict.get(code)]; break;
            case "Village": found = [villageToDistrict.get(code)]; break;
            case "Localbody": found = [...(localBodyToDistricts.get(code) || [])]; break;
            case "Ward": found = [...(localBodyToDistricts.get(wardToLocalBody.get(code)) || [])]; break;
            default: break;
        }
        for (const d of found) {
            // Only keep links to districts of the constituency's own state.
            if (!d || districts.get(d)?.stateCode !== ac.stateCode) continue;
            if (!acDistricts.has(r["Assembly Constituency Code"])) acDistricts.set(r["Assembly Constituency Code"], new Set());
            acDistricts.get(r["Assembly Constituency Code"]).add(d);
        }
    });

    const districtAcs = new Map(); // districtCode -> Set(acName)
    const unmapped = [];
    for (const [code, ac] of constituencies) {
        const stateName = states.get(ac.stateCode)?.name;
        if (NO_LEGISLATURE.has(stateName) || OUTDATED_IN_LGD[stateName]) continue;
        const ds = acDistricts.get(code);
        if (!ds?.size) { unmapped.push({ state: stateName, name: ac.name }); continue; }
        for (const d of ds) {
            if (!districtAcs.has(d)) districtAcs.set(d, new Set());
            districtAcs.get(d).add(ac.name);
        }
    }

    const output = {
        source: {
            name: "Local Government Directory (LGD), Ministry of Panchayati Raj, Government of India",
            url: "https://lgdirectory.gov.in",
            mirror: "https://github.com/ramSeraph/opendata (release lgd-latest)",
            retrieved,
            method: "Constituency-to-district links derived from LGD constituency coverage records."
        },
        states: [],
        unmappedConstituencies: unmapped.sort((a, b) => byName(a.state, b.state) || byName(a.name, b.name))
    };

    for (const [stateCode, state] of states) {
        const stateDistricts = [...districts].filter(([, d]) => d.stateCode === stateCode);
        const entry = { name: state.name, type: state.type, constituencies: "available", districts: [] };
        if (NO_LEGISLATURE.has(state.name)) {
            entry.constituencies = "none";
            entry.note = "This State/UT has no legislative assembly.";
        } else if (OUTDATED_IN_LGD[state.name]) {
            entry.constituencies = "unavailable";
            entry.note = OUTDATED_IN_LGD[state.name];
        } else if (!stateDistricts.some(([code]) => districtAcs.has(code))) {
            entry.constituencies = "unavailable";
            entry.note = "LGD does not map this State/UT's constituencies to districts.";
        }
        entry.districts = stateDistricts
            .map(([code, d]) => ({
                name: d.name,
                constituencies: entry.constituencies === "available" ? [...(districtAcs.get(code) || [])].sort(byName) : []
            }))
            .sort((a, b) => byName(a.name, b.name));
        output.states.push(entry);
    }
    output.states.sort((a, b) => byName(a.name, b.name));

    const target = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "src", "data", "geography.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(output)}\n`);

    const acCount = new Set(output.states.flatMap((s) => s.districts.flatMap((d) => d.constituencies.map((c) => `${s.name}|${c}`)))).size;
    console.log(`Wrote ${target}`);
    console.log(`States/UTs: ${output.states.length}, districts: ${output.states.reduce((n, s) => n + s.districts.length, 0)}, constituencies: ${acCount}`);
    console.log(`Without constituencies: ${output.states.filter((s) => s.constituencies !== "available").map((s) => `${s.name} (${s.constituencies})`).join(", ")}`);
    console.log(`Unmapped constituencies: ${unmapped.length}`);
};

main().catch((error) => { console.error(error); process.exit(1); });

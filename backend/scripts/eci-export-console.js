/*
 * Paste into the browser console while https://electoralsearch.eci.gov.in/ is open.
 * It reads ECI's public lookup service (states -> districts -> constituencies), about 830 requests
 * spaced 120 ms apart, and saves eci-constituencies-live.json for scripts/build-geography-eci.js.
 * This file is NOT run by the backend; it is kept here so the data can be refreshed the same way.
 */
(async () => {
    const H = { headers: { applicationName: "ELECTORAL-SEARCH" } };
    const errors = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const get = async (p) => {
        for (let t = 0; t < 3; t++) {
            try {
                const r = await fetch(`https://gateway-voters.eci.gov.in/api/v1/common/${p}`, H);
                if (r.ok) return await r.json();
                errors.push(`${p} ${r.status}`);
            } catch (e) { errors.push(`${p} ${e.message}`); }
            await sleep(800);
        }
        return null;
    };
    const states = (await get("states/")) || [];
    const districts = [];
    const acs = [];
    for (const s of states) {
        const ds = (await get(`districts/${s.stateCd}`)) || [];
        districts.push(...ds);
        for (const d of ds) {
            const a = await get(`acs/${d.districtCd}`);
            if (a) acs.push(...a); else errors.push(`acs missing ${d.districtCd}`);
            await sleep(120);
        }
        console.log(`${s.stateName}: ${ds.length} districts`);
    }
    const out = {
        source: {
            publisher: "Election Commission of India",
            portal: "Voters' Services Portal (https://electoralsearch.eci.gov.in/)",
            service: "https://gateway-voters.eci.gov.in/api/v1/common/states/, /districts/{stateCd}, /acs/{districtCd}",
            extractedAt: new Date().toISOString(), errors
        },
        // stateNameInBundle / stateType are filled from the portal bundle when available; without
        // them the build script uses the service's own names.
        states: states.map((s) => ({ stateCd: s.stateCd, stateName: s.stateName, stateNameInBundle: null, stateType: s.stateCd.startsWith("U") ? "UT" : "ST" })),
        districts: districts.map((d) => ({ stateCd: d.state, districtCd: d.districtCd, districtNo: d.districtNo, districtName: d.districtValue })),
        constituencies: acs.map((a) => ({ stateCd: a.stateCd, districtCd: a.districtCd, acNo: a.asmblyNo, acName: a.asmblyName, isActive: a.isActive, pcNo: a.pcNo, pcName: a.prlmntNameL1, acId: a.acId }))
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
    link.download = "eci-constituencies-live.json";
    link.click();
    console.log(`Done: ${states.length} States/UTs, ${districts.length} districts, ${acs.length} constituencies, ${errors.length} errors`);
})();

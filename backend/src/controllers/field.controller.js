// BLO App (GARUDA) field work beyond application verification:
//
//   FACILITY SURVEY  The BLO (or sector officer) surveys a polling station: assured minimum
//                    facilities (AMF), essential minimum facilities (EMF), its GPS position, a
//                    photograph and the distance to nearby services. The station gets a facility
//                    summary that the map and the DEO see. A GPS position far from the recorded one
//                    is flagged for the DEO; the station is never moved by a survey (moving it needs
//                    the Commission's approval, RP Act 1951, s. 25).
//   BLO REGISTER     House-to-house verification: who was found at each entry's address, with
//                    the house number and National House Number, and what the BLO saw.
//   EPIC DELIVERY    The BLO records handing over a new or replacement EPIC.
//
// Surveys, the register and deliveries live in MongoDB; the station summary is written to the
// station in Redis (and projected to the map's MongoDB read model).
import { transaction } from "../config/redis.js";
import { getStation, lockStation, saveStation } from "../repositories/election.repository.js";
import { getElectorByEpic } from "../repositories/elector.repository.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { hasPermission } from "../services/authority.service.js";
import { docStore } from "../services/docStore.service.js";
import { distanceKm } from "../services/readModel.service.js";
import { actorOf, assertScope, auditChange, clean, dateOf, inScope, newId, nowIso, oneOf, page } from "../services/workflow.service.js";
import { todayIST } from "../services/election.service.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const surveys = docStore("station_surveys");
const register = docStore("blo_register");
const deliveries = docStore("epic_deliveries");

export const AMF = {
    ramp: "Ramp for wheelchairs", drinking_water: "Drinking water", toilet: "Toilets (separate for women)", electricity: "Electricity",
    shade: "Shade or shelter for the queue", furniture: "Furniture for the polling party", signage: "Signage and voter facilitation poster", wheelchair: "Wheelchair available",
    lighting: "Adequate lighting"
};
export const EMF = {
    ground_floor: "Station on the ground floor", separate_entry_exit: "Separate entry and exit", compartment_space: "Space for a private voting compartment",
    waiting_area: "Waiting area for elderly and disabled electors", help_desk: "Voter help desk", mobile_network: "Mobile network coverage", approach_road: "All-weather approach road"
};
export const NEARBY = { bus_stand: "Bus stand", police_station: "Police station", fire_station: "Fire station", hospital: "Hospital or health centre", fuel_pump: "Fuel pump", parking: "Parking" };
export const REGISTER_FINDINGS = { present: "Found at the address", shifted: "Shifted permanently", dead: "Died", duplicate: "Entered elsewhere too", not_found: "Not known at the address", new_eligible: "New eligible person in the household" };
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const DOC = /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/]+={0,2}$/;
const FAR_METRES = 250;

const stationArea = (s) => ({ state: s.state, district: s.district, constituency: s.constituency, pollingStation: s.name });
const checks = (input, list) => Object.fromEntries(Object.keys(list).map((k) => [k, input?.[k] === true]));

export const surveyLists = asyncHandler(async (req, res) => {
    res.json({ success: true, data: { amf: AMF, emf: EMF, nearby: NEARBY, findings: REGISTER_FINDINGS, store: surveys.backend() } });
});

/** BLO or sector officer: survey a polling station. */
export const surveyStation = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const station = await getStation(req.params.stationId);
    if (!station) throw new ApiError(404, "No such polling station.");
    assertScope(req, stationArea(station), "This polling station");
    const amf = checks(b.amf, AMF);
    const emf = checks(b.emf, EMF);
    const gps = b.gps && Number.isFinite(Number(b.gps.lat)) && Number.isFinite(Number(b.gps.lng)) ? { lat: Number(b.gps.lat), lng: Number(b.gps.lng), accuracyM: Number(b.gps.accuracyM) || null } : null;
    if (gps && (Math.abs(gps.lat) > 90 || Math.abs(gps.lng) > 180)) throw new ApiError(400, "The GPS position is not valid.");
    const distances = {};
    for (const k of Object.keys(NEARBY)) {
        if (b.distances?.[k] === undefined || b.distances[k] === "") continue;
        const km = Number(b.distances[k]);
        if (!Number.isFinite(km) || km < 0 || km > 200) throw new ApiError(400, `${NEARBY[k]}: give the distance in km (0 to 200).`);
        distances[k] = Math.round(km * 10) / 10;
    }
    if (b.photo && (!PHOTO.test(b.photo) || b.photo.length > 3_000_000)) throw new ApiError(400, "The photograph must be a JPEG, PNG or WEBP under 2 MB.");
    const offsetM = gps && station.location ? Math.round(distanceKm(gps, station.location) * 1000) : null;
    const missing = [...Object.entries(amf).filter(([, v]) => !v).map(([k]) => AMF[k]), ...Object.entries(emf).filter(([, v]) => !v).map(([k]) => EMF[k])];
    const amfScore = Math.round((Object.values(amf).filter(Boolean).length / Object.keys(AMF).length) * 100);
    const doc = {
        _id: newId(), stationId: station._id, stationName: station.name, partNumber: station.partNumber, jurisdiction: { state: station.state, district: station.district, constituency: station.constituency },
        amf, emf, amfScore, missing, gps, gpsOffsetM: offsetM, gpsFlag: offsetM !== null && offsetM > FAR_METRES ? `GPS position is ${offsetM} m from the recorded location; the DEO should check it.` : null,
        distances, photo: b.photo || null, remarks: clean(b.remarks, 600) || null, by: actorOf(req.user), createdAt: nowIso()
    };
    await surveys.insert(doc);
    // The station carries a summary of its latest survey (not the photograph).
    const release = await lockStation(station._id);
    if (!release) throw new ApiError(409, "The station is being updated. Try again in a moment.");
    try {
        const fresh = await getStation(station._id);
        const tx = transaction();
        saveStation({ ...fresh, facilitySurvey: { surveyId: doc._id, at: doc.createdAt, amfScore, missing, distances, gpsFlag: doc.gpsFlag, hasPhoto: Boolean(doc.photo), by: doc.by.epic } }, tx);
        await recordAudit(auditEvent({ actor: req.user, action: "station.facility_surveyed", resource: { type: "station", id: station._id }, jurisdiction: stationArea(station),
            after: { amfScore, missing: missing.length, gpsOffsetM: offsetM } }), tx);
        await tx.exec();
    } finally { await release(); }
    res.status(201).json({ success: true, message: `Survey saved: ${amfScore}% of assured minimum facilities${missing.length ? `; ${missing.length} missing` : ""}.${doc.gpsFlag ? ` ${doc.gpsFlag}` : ""}`, data: { ...doc, photo: undefined, hasPhoto: Boolean(doc.photo) } });
});

const surveyView = ({ photo, ...s }) => ({ ...s, hasPhoto: Boolean(photo) });

export const listSurveys = asyncHandler(async (req, res) => {
    const filter = req.query.stationId ? { stationId: clean(req.query.stationId, 80) } : {};
    const all = (await surveys.find(filter, { sort: { createdAt: -1 }, limit: 2000 })).filter((s) => inScope(req, s.jurisdiction));
    const latest = Object.values(all.reduce((m, s) => { if (!m[s.stationId]) m[s.stationId] = s; return m; }, {}));
    res.json({ success: true, data: { items: page(all, req.query).map(surveyView), latest: latest.map(surveyView),
        summary: { stations: latest.length, fullAmf: latest.filter((s) => s.amfScore === 100).length, gpsFlags: latest.filter((s) => s.gpsFlag).length,
            avgAmf: latest.length ? Math.round(latest.reduce((n, s) => n + s.amfScore, 0) / latest.length) : null },
        lists: { amf: AMF, emf: EMF, nearby: NEARBY } } });
});

export const surveyPhoto = asyncHandler(async (req, res) => {
    const s = await surveys.get(req.params.id);
    if (!s || !inScope(req, s.jurisdiction)) throw new ApiError(404, "No such survey.");
    if (!s.photo) throw new ApiError(404, "No photograph with this survey.");
    res.json({ success: true, data: { dataUrl: s.photo } });
});

const electorInScope = async (req, epicRaw) => {
    const elector = await getElectorByEpic(clean(epicRaw, 20).toUpperCase());
    if (!elector) throw new ApiError(404, "No roll entry with this EPIC.");
    const area = { state: elector.state, district: elector.district, constituency: elector.assemblyConstituency };
    assertScope(req, area, "This entry");
    return { elector, area };
};

/** BLO register: house-to-house verification of one entry. */
export const addRegisterEntry = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const { elector, area } = await electorInScope(req, b.epic);
    if (b.document && (!DOC.test(b.document) || b.document.length > 3_000_000)) throw new ApiError(400, "The document must be a JPEG, PNG, WEBP or PDF under 2 MB.");
    const finding = oneOf(b.finding, REGISTER_FINDINGS, "finding");
    const doc = {
        _id: newId(), epic: elector.epic, name: elector.name, partNumber: elector.partNumber, serialNumber: elector.serialNumber ?? null, jurisdiction: area,
        houseNumber: clean(b.houseNumber, 40) || elector.houseNumber || null, nationalHouseNumber: clean(b.nationalHouseNumber, 40) || null,
        finding, note: clean(b.note, 600) || null, document: b.document || null, mobileSeen: /^[6-9]\d{9}$/.test(String(b.mobile ?? "")) ? `xxxxxx${String(b.mobile).slice(-4)}` : null,
        visitedOn: b.visitedOn ? dateOf(b.visitedOn, "Visit date") : todayIST(), by: actorOf(req.user), createdAt: nowIso()
    };
    await register.insert(doc);
    await auditChange(req, "blo.register_entry", { type: "elector", id: elector.epic }, area, { after: { finding } });
    const next = { dead: "Report the death (with the certificate) so the ERO can issue notice.", shifted: "The elector can apply in Form 8 to shift, or anyone may object in Form 7.",
        duplicate: "Tell the ERO; the PSE/DSE scan raises duplicates for a notice and hearing.", new_eligible: "Help the person fill in Form 6." }[finding];
    res.status(201).json({ success: true, message: `Recorded for ${elector.epic}.${next ? ` ${next}` : ""}`, data: { ...doc, document: undefined, hasDocument: Boolean(doc.document) } });
});

export const listRegister = asyncHandler(async (req, res) => {
    const all = (await register.find({}, { sort: { createdAt: -1 }, limit: 3000 })).filter((r) => inScope(req, r.jurisdiction));
    const mine = hasPermission(req.user, "application:decide") || hasPermission(req.user, "blo:supervise") ? all : all.filter((r) => r.by.epic === req.user.epic);
    res.json({ success: true, data: { items: page(mine, req.query).map(({ document, ...r }) => ({ ...r, hasDocument: Boolean(document) })),
        counts: mine.reduce((m, r) => ((m[r.finding] = (m[r.finding] ?? 0) + 1), m), {}), findings: REGISTER_FINDINGS } });
});

/** BLO: an EPIC handed over to the elector. */
export const recordEpicDelivery = asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    const { elector, area } = await electorInScope(req, b.epic);
    if (elector.isActive === false) throw new ApiError(409, "This entry is deleted; there is no EPIC to deliver.");
    const doc = { _id: newId(), epic: elector.epic, name: elector.name, jurisdiction: area, kind: oneOf(b.kind ?? "new", ["new", "replacement"], "kind"),
        receivedBy: oneOf(b.receivedBy ?? "self", ["self", "family_member"], "receivedBy"), deliveredOn: b.deliveredOn ? dateOf(b.deliveredOn, "Delivery date") : todayIST(),
        note: clean(b.note, 300) || null, by: actorOf(req.user), createdAt: nowIso() };
    await deliveries.insert(doc);
    await auditChange(req, "blo.epic_delivered", { type: "elector", id: elector.epic }, area, { after: { kind: doc.kind } });
    res.status(201).json({ success: true, message: `EPIC ${elector.epic} recorded as delivered.`, data: doc });
});

export const listDeliveries = asyncHandler(async (req, res) => {
    const all = (await deliveries.find({}, { sort: { createdAt: -1 }, limit: 3000 })).filter((d) => inScope(req, d.jurisdiction));
    res.json({ success: true, data: { items: page(all, req.query), total: all.length } });
});

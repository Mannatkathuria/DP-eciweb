import crypto from "crypto";
import { transaction } from "../config/redis.js";
import { getDataSource, listDataSources, listIngestionRuns, saveDataSource } from "../repositories/integration.repository.js";
import { ingest, rescreenProspects } from "../services/ingestion.service.js";
import { auditEvent, recordAudit } from "../services/audit.service.js";
import { requireReason } from "../utils/documentProof.js";
import { ApiError } from "../utils/ApiErrors.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Data source types. Only an officially documented API or a government-approved export may carry
// real personal data, and only with a recorded legal basis and agreement. Scraped websites and
// databases that merely happen to be reachable are never valid sources.
export const SOURCE_TYPES = ["synthetic", "approved_api", "approved_export"];
const clean = (v, max = 300) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export const listSources = asyncHandler(async (req, res) => {
    const items = (await listDataSources()).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: { items } });
});

export const createSource = asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const type = String(body.type ?? "");
    if (!SOURCE_TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${SOURCE_TYPES.join(", ")}.`);
    const name = clean(body.name, 120);
    if (name.length < 3) throw new ApiError(400, "Give the source a name.");
    const purpose = clean(body.purpose);
    if (!purpose) throw new ApiError(400, "State the permitted purpose of this source.");
    const legalBasis = clean(body.legalBasis);
    const agreementReference = clean(body.agreementReference, 120);
    if (type !== "synthetic" && (!legalBasis || !agreementReference)) {
        throw new ApiError(400, "A real data source needs its legal basis and the data-sharing agreement reference.");
    }
    const source = {
        _id: crypto.randomUUID(), name, type, purpose, legalBasis: legalBasis || null, agreementReference: agreementReference || null,
        containsRealPersonalData: type !== "synthetic", status: "active",
        registeredBy: req.user.epic, registeredAt: new Date().toISOString()
    };
    const tx = transaction();
    saveDataSource(source, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "datasource.registered", resource: { type: "datasource", id: source._id }, after: { name, type, purpose } }), tx);
    await tx.exec();
    res.status(201).json({ success: true, data: source });
});

export const suspendSource = asyncHandler(async (req, res) => {
    const reason = requireReason(req.body?.reason, "suspension");
    const source = await getDataSource(req.params.id);
    if (!source) throw new ApiError(404, "Data source not found.");
    if (source.status !== "active") throw new ApiError(409, "This source is already suspended.");
    const updated = { ...source, status: "suspended", suspendedBy: req.user.epic, suspendedAt: new Date().toISOString(), suspendReason: reason };
    const tx = transaction();
    saveDataSource(updated, tx);
    await recordAudit(auditEvent({ actor: req.user, action: "datasource.suspended", resource: { type: "datasource", id: source._id }, note: reason }), tx);
    await tx.exec();
    res.json({ success: true, data: updated });
});

export const runIngestion = asyncHandler(async (req, res) => {
    const run = await ingest({ sourceId: req.params.id, records: req.body?.records, actor: req.user });
    res.status(201).json({ success: true, message: "Import finished.", data: run });
});

export const listRuns = asyncHandler(async (req, res) => {
    const items = (await listIngestionRuns()).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    res.json({ success: true, data: { items } });
});

export const rescreen = asyncHandler(async (req, res) => {
    res.json({ success: true, data: await rescreenProspects({ actor: req.user }) });
});

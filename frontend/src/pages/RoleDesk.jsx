import { useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import useRoleCatalog from "../hooks/useRoleCatalog";
import { GROUPS, roleById } from "../config/roles";
import { permissionText } from "../config/permissions";
import { DESKS } from "../config/desks";
import { useLoad } from "../components/desk/kit";
import FormsPanel from "../components/desk/FormsPanel";
import { ExpenditureObserve, ExpenditureRegister, PermissionsApply, PermissionsStaff } from "../components/desk/CampaignPanels";
import { Directions, ObserverReports } from "../components/desk/OversightPanels";
import { LogisticsPanel, NodalPanel, SecurityPanel } from "../components/desk/FieldPanels";
import { AuditPanel, BloTeam, RollPart, StationIssues, StationWorkflow, SummaryPanel } from "../components/desk/OpsPanels";
import { AppealsPanel, AssistedNomination, ComplaintsPanel, StationRecords, StationReports } from "../components/desk/CasePanels";
import { BloRegisterPanel, FieldSurveyPanel, RecordOfficerPanel, RollQualityPanel } from "../components/desk/RollPanels";
import { EncorePanel, EplanPanel, EtpbPanel, EvmPanel, IndexCardPanel } from "../components/desk/ElectionPanels";
import { DataStoresPanel, GrievancesPanel, LibraryAdminPanel, ObserverPortalPanel, PartyCompliancePanel, PartyFilingsPanel, SeizuresPanel, SquadPanel } from "../components/desk/MonitorPanels";
import { InboxPanel, WorkloadPanel } from "../components/desk/InboxPanels";
import "../styles/desk.css";

// The signed-in home of every election role: who you are, where your authority runs, what you
// may and may not do, your work panels and your dedicated work screens.

const SCOPE_LABEL = { state: "State/UT", district: "District", constituency: "Constituency", parliamentaryConstituency: "Parliamentary constituency", pollingStation: "Polling station", partNumber: "Part" };

const PANELS = {
    summary: () => <SummaryPanel />,
    summaryRoll: () => <SummaryPanel title="Roll work in your constituency" focus="roll" />,
    formsField: () => <FormsPanel mode="field" />,
    formsDecide: () => <FormsPanel mode="decide" />,
    formsRead: () => <FormsPanel mode="read" />,
    permApply: () => <PermissionsApply />,
    permStaff: () => <PermissionsStaff />,
    expRegister: () => <ExpenditureRegister />,
    expObserve: () => <ExpenditureObserve />,
    observerFile: ({ area }) => <ObserverReports area={area} canFile />,
    observerRead: () => <ObserverReports />,
    observerReview: () => <ObserverReports />,
    directions: () => <Directions />,
    directionsIssue: () => <Directions canIssue />,
    security: ({ area }) => <SecurityPanel area={area} />,
    logistics: () => <LogisticsPanel />,
    nodal: ({ area }) => <NodalPanel area={area} />,
    stationsDeo: () => <StationWorkflow role="deo" />,
    stationsCeo: () => <StationWorkflow role="ceo" />,
    stationsEci: () => <StationWorkflow role="eci" />,
    issues: () => <StationIssues />,
    issuesClose: () => <StationIssues canClose />,
    bloTeam: () => <BloTeam />,
    rollPart: () => <RollPart />,
    audit: () => <AuditPanel />,
    complaints: () => <ComplaintsPanel />,
    appeals: () => <AppealsPanel />,
    stationRecords: () => <StationRecords />,
    stationReports: () => <StationReports />,
    assisted: () => <AssistedNomination />,
    rollQuality: () => <RollQualityPanel />,
    fieldSurvey: () => <FieldSurveyPanel canSurvey />,
    fieldSurveyRead: () => <FieldSurveyPanel />,
    bloRegister: () => <BloRegisterPanel />,
    recordOfficer: () => <RecordOfficerPanel />,
    eplan: () => <EplanPanel />,
    evm: () => <EvmPanel />,
    encore: () => <EncorePanel />,
    indexCard: () => <IndexCardPanel />,
    etpb: () => <EtpbPanel />,
    grievances: () => <GrievancesPanel />,
    seizures: () => <SeizuresPanel />,
    squads: () => <SquadPanel />,
    partyFilings: () => <PartyFilingsPanel />,
    partyCompliance: () => <PartyCompliancePanel />,
    observerPortal: () => <ObserverPortalPanel />,
    library: () => <LibraryAdminPanel />,
    dataStores: () => <DataStoresPanel />,
    workload: () => <WorkloadPanel />
};

// Desks with many panels get a grouped side menu instead of one long row of tabs.
const GROUP_OF = {
    formsField: "Electoral roll", formsDecide: "Electoral roll", formsRead: "Electoral roll", rollPart: "Electoral roll", rollQuality: "Electoral roll", bloRegister: "Electoral roll", appeals: "Electoral roll", recordOfficer: "Electoral roll", bloTeam: "Electoral roll",
    eplan: "Election work", encore: "Election work", assisted: "Election work", permApply: "Election work", permStaff: "Election work", expRegister: "Election work", evm: "Election work", etpb: "Election work", indexCard: "Election work", partyFilings: "Election work", partyCompliance: "Election work",
    stationsDeo: "Stations and field", stationsCeo: "Stations and field", stationsEci: "Stations and field", fieldSurvey: "Stations and field", fieldSurveyRead: "Stations and field", issues: "Stations and field", issuesClose: "Stations and field",
    logistics: "Stations and field", security: "Stations and field", stationRecords: "Stations and field", stationReports: "Stations and field", nodal: "Stations and field",
    complaints: "Complaints and monitoring", squads: "Complaints and monitoring", seizures: "Complaints and monitoring", grievances: "Complaints and monitoring", expObserve: "Complaints and monitoring",
    workload: "Oversight", observerPortal: "Oversight", observerFile: "Oversight", observerRead: "Oversight", observerReview: "Oversight", directions: "Oversight", directionsIssue: "Oversight",
    audit: "Records and administration", library: "Records and administration", dataStores: "Records and administration"
};
const GROUP_ORDER = ["Oversight", "Electoral roll", "Election work", "Stations and field", "Complaints and monitoring", "Records and administration"];
const GROUPED_FROM = 6;

export default function RoleDesk() {
    const { logged, userData } = useContext(AuthContext);
    const { roles } = useRoleCatalog();
    const [params, setParams] = useSearchParams();
    const roleId = userData?.role === "admin" ? "blo" : userData?.role;
    const desk = DESKS[roleId];
    const role = roleById(roleId);
    const me = useLoad(logged ? "/assignments/me" : null);
    const assignments = useMemo(() => me.data?.assignments ?? [], [me.data]);
    const area = assignments.find((a) => a.jurisdiction && Object.keys(a.jurisdiction).length)?.jurisdiction ?? userData?.jurisdiction ?? {};
    // A desk's report (if it has one) opens its overview; the other panels are tabs.
    const summaryKey = desk?.tabs.find(([id]) => id.startsWith("summary"))?.[0] ?? null;
    const workTabs = useMemo(() => (desk?.tabs ?? []).filter(([id]) => !id.startsWith("summary")), [desk]);
    const tabs = useMemo(() => [{ id: "overview", label: "Overview" }, ...workTabs.map(([id, label]) => ({ id, label }))], [workTabs]);
    const grouped = useMemo(() => {
        const m = new Map();
        for (const t of workTabs) { const g = GROUP_OF[t[0]] ?? "Other work"; if (!m.has(g)) m.set(g, []); m.get(g).push(t); }
        return [...m.entries()].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 99) % 99 - (GROUP_ORDER.indexOf(b[0]) + 99) % 99);
    }, [workTabs]);
    const [tab, setTab] = useState(params.get("tab") && tabs.some((t) => t.id === params.get("tab")) ? params.get("tab") : "overview");
    useEffect(() => { document.title = `${role?.label ?? "Desk"} · ECI`; }, [role]);

    if (!logged || !userData) return <Navigate to="/signin" replace />;
    if (roleId === "voter") return <Navigate to="/dashboard" replace />;
    if (!desk) return <Navigate to="/workspace" replace />;

    const permissions = roles.find((r) => r.id === roleId)?.permissions ?? [];
    const group = GROUPS.find((g) => g.id === role?.group);
    const change = (id) => { setTab(id); setParams(id === "overview" ? {} : { tab: id }, { replace: true }); };
    const Panel = PANELS[tab];

    return (
        <>
            <PageHead title={role?.label ?? "Your desk"} lede={desk.mission} crumbs={[{ label: group?.label ?? "Desk" }]}>
                <p className="desk-basis">Authority: {desk.basis}</p>
                <div className="desk-scope">
                    {assignments.length ? assignments.map((a) => (
                        <span key={a._id ?? JSON.stringify(a.jurisdiction)}>{a.nationwide ? "Whole country" : Object.entries(a.jurisdiction ?? {}).filter(([k]) => k !== "state" || !a.jurisdiction.district).map(([k, v]) => `${SCOPE_LABEL[k] ?? k}: ${v}`).join(" · ")}{a.election ? ` · ${a.election}` : ""}{a.function ? ` · subject: ${a.function}` : ""}</span>
                    )) : !me.loading && <span>No active assignment: most work screens stay empty until one is granted.</span>}
                </div>
            </PageHead>
            <section className="section">
                <div className="container stack">
                    {tabs.length > 1 && tabs.length <= GROUPED_FROM && <Tabs tabs={tabs} active={tab} onChange={change} label="Your work" />}
                    <div className={tabs.length > GROUPED_FROM ? "desk-layout" : undefined}>
                    {tabs.length > GROUPED_FROM && (
                        <>
                            <nav className="desk-nav" aria-label="Your work">
                                <button type="button" aria-current={tab === "overview" ? "page" : undefined} onClick={() => change("overview")}>Overview</button>
                                {grouped.map(([g, list]) => (
                                    <div key={g}><h3>{g}</h3>{list.map(([id, l]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => change(id)}>{l}</button>)}</div>
                                ))}
                            </nav>
                            <select className="desk-nav-select" aria-label="Your work" value={tab} onChange={(e) => change(e.target.value)}>
                                <option value="overview">Overview</option>
                                {grouped.map(([g, list]) => <optgroup key={g} label={g}>{list.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}
                            </select>
                        </>
                    )}
                    <div className="stack">
                    {tab === "overview" ? (
                        <>
                            <InboxPanel onOpen={change} tabs={workTabs.map(([id]) => id)} />
                            {summaryKey && PANELS[summaryKey]({ area })}
                            {desk.screens.length > 0 && (
                                <section className="panel">
                                    <h2>Your work screens</h2>
                                    <div className="screens">{desk.screens.map((x) => <Link key={x.to} className="screen-card" to={x.to}><strong>{x.label}</strong>{x.note && <small>{x.note}</small>}</Link>)}</div>
                                </section>
                            )}
                            {workTabs.length > 0 && (
                                <section className="panel">
                                    <h2>On this desk</h2>
                                    {grouped.map(([g, list]) => (
                                        <div key={g}>{grouped.length > 1 && <h3 className="subhead">{g}</h3>}
                                            <div className="screens">{list.map(([id, label]) => <button key={id} type="button" className="screen-card" style={{ textAlign: "left", font: "inherit", cursor: "pointer" }} onClick={() => change(id)}><strong>{label}</strong></button>)}</div></div>
                                    ))}
                                </section>
                            )}
                            <section className="panel powers">
                                <div>
                                    <h2 style={{ marginTop: 0 }}>What you may do</h2>
                                    {permissions.length ? <ul>{permissions.map((p) => <li key={p}>{permissionText(p)}</li>)}</ul> : <p className="muted">Loading…</p>}
                                </div>
                                <div className="not">
                                    <h2 style={{ marginTop: 0 }}>What this login does not allow</h2>
                                    <ul>{desk.cannot.map((c) => <li key={c}>{c}</li>)}</ul>
                                    <p className="muted"><small>Every action is checked on the server against your assignment, election and dates, and recorded in the audit trail.</small></p>
                                </div>
                            </section>
                        </>
                    ) : me.loading ? <p className="muted" role="status">Loading your assignment…</p> : Panel ? <Panel area={area} /> : null}
                    </div>
                    </div>
                </div>
            </section>
        </>
    );
}

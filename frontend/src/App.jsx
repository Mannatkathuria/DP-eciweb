import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import SiteLayout from "./components/SiteLayout";
import EntryGate from "./pages/EntryGate";
import Home from "./pages/Home";

// Public information
import Voters from "./pages/Voters";
import ReportViolation from "./pages/ReportViolation";
import Candidates from "./pages/Candidates";
import Results from "./pages/Results";
import Media from "./pages/Media";
import Roles from "./pages/Roles";
import StatePortal, { StatesIndex } from "./pages/StatePortal";

// Voter services
import Register from "./pages/Register";
import CheckRequest from "./pages/CheckRequest";
import Objection from "./pages/Objection";
import Appeal from "./pages/Appeal";
import ElectoralRoll from "./pages/ElectoralRoll";

// Sign-in and each role's own section
import SignInHub from "./pages/SignInHub";
import PortalLogin from "./pages/PortalLogin";
import LoginOtp from "./pages/LoginOtp";
import BloLogin from "./pages/BloLogin";
import BloChangePassword from "./pages/BloChangePassword";
import BloForgotPassword from "./pages/BloForgotPassword";
import Dashboard from "./pages/Dashboard";
import Verify from "./pages/Verify";
import Admin from "./pages/Admin";
import EciDashboard from "./pages/EciDashboard";
import VotingVerification from "./pages/VotingVerification";
import Workspace from "./pages/Workspace";
import RoleDesk from "./pages/RoleDesk";
import EroDecisions from "./pages/EroDecisions";
import EciIntegrations from "./pages/EciIntegrations";
import EciElections from "./pages/EciElections";
import DeoDesk from "./pages/DeoDesk";
import RoDesk from "./pages/RoDesk";
import CandidateDesk from "./pages/CandidateDesk";
import Booths from "./pages/Booths";
import PollDay from "./pages/PollDay";
import PresidingOfficer from "./pages/PresidingOfficer";
import Counting from "./pages/Counting";
import ControlRoom from "./pages/ControlRoom";
import Training from "./pages/Training";
import TrainingSimulator from "./pages/TrainingSimulator";
import PhoneScreen from "./pages/PhoneScreen";
import StepUpDialog from "./components/StepUpDialog";
import AgentDesk from "./pages/AgentDesk";
import ElectoralFormsIndex from "./pages/electoral-forms/ElectoralFormsIndex";
import Form2 from "./pages/electoral-forms/Form2";
import Form2A from "./pages/electoral-forms/Form2A";
import Form3 from "./pages/electoral-forms/Form3";
import Form6A from "./pages/electoral-forms/Form6A";
import Form6B from "./pages/electoral-forms/Form6B";
import Form7 from "./pages/electoral-forms/Form7";
import Form8 from "./pages/electoral-forms/Form8";
import PollingStationMapPage from "./pages/PollingStationMapPage";



function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* First visit: choose to sign in or browse. Afterwards "/" goes straight to the home page. */}
                <Route path="/" element={<EntryGate />} />

                <Route element={<SiteLayout />}>

                    <Route path="/home" element={<Home />} />
                    <Route path="/map" element={<PollingStationMapPage />} />

                    {/* Public information */}
                    <Route path="/voters" element={<Voters />} />
                    <Route path="/report-violation" element={<ReportViolation />} />
                    <Route path="/candidates" element={<Candidates />} />
                    <Route path="/results" element={<Results />} />
                    <Route path="/states" element={<StatesIndex />} />
                    <Route path="/states/:slug" element={<StatePortal />} />
                    <Route path="/media" element={<Media />} />
                    <Route path="/roles" element={<Roles />} />

                    {/* Voter services */}
                    <Route path="/register" element={<Register />} />
                    <Route path="/check-request" element={<CheckRequest />} />
                    <Route path="/objection" element={<Objection />} />
                    <Route path="/appeal" element={<Appeal />} />
                    <Route path="/electoral-roll" element={<ElectoralRoll />} />
                    <Route path="/booths" element={<Booths />} />

                    {/* Sign-in: one page per role */}
                    <Route path="/signin" element={<SignInHub />} />
                    <Route path="/signin/:roleId" element={<PortalLogin />} />
                    <Route path="/login/otp" element={<LoginOtp />} />
                    <Route path="/blo/login" element={<BloLogin />} />
                    <Route path="/blo/password" element={<BloChangePassword />} />
                    <Route path="/blo/forgot" element={<BloForgotPassword />} />

                    {/* Each role's own section */}
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/verify" element={<Verify />} />
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/eci/dashboard" element={<EciDashboard />} />
                    <Route path="/eci/voting-verification" element={<VotingVerification />} />
                    <Route path="/workspace" element={<Workspace />} />
                    <Route path="/desk" element={<RoleDesk />} />
                    <Route path="/ero" element={<EroDecisions />} />
                    <Route path="/eci/integrations" element={<EciIntegrations />} />
                    <Route path="/eci/elections" element={<EciElections />} />
                    <Route path="/deo" element={<DeoDesk />} />
                    <Route path="/ro" element={<RoDesk />} />
                    <Route path="/candidate" element={<CandidateDesk />} />
                    <Route path="/agent" element={<AgentDesk />} />
                    <Route path="/poll-day" element={<PollDay />} />
                    <Route path="/poll-day/presiding-officer" element={<PresidingOfficer />} />
                    <Route path="/counting" element={<Counting />} />
                    <Route path="/control-room" element={<ControlRoom />} />
                    <Route path="/training" element={<Training />} />
                    <Route path="/training/poll-day" element={<TrainingSimulator />} />

                    {/* Older addresses, kept so saved links keep working */}
                    <Route path="/login" element={<Navigate to="/signin/voter" replace />} />
                    <Route path="/eci/login" element={<Navigate to="/signin/eci" replace />} />
                    <Route path="/portals" element={<Navigate to="/signin" replace />} />
                    <Route path="/services" element={<Navigate to="/voters" replace />} />
                    <Route path="/cvigil" element={<Navigate to="/report-violation" replace />} />
                    <Route path="/suvidha" element={<Navigate to="/candidates" replace />} />
                    <Route path="/encore" element={<Navigate to="/results" replace />} />
                    <Route path="/ceo-himachal" element={<Navigate to="/states/himachal-pradesh" replace />} />
                    <Route path="/workflows" element={<Navigate to="/roles" replace />} />
                    <Route path="/media-publications" element={<Navigate to="/media" replace />} />

                    {/* Form links */}
                    <Route path="/voters/forms" element={<ElectoralFormsIndex />} />
                    <Route path="/voters/forms/form-2" element={<Form2 />} />
                    <Route path="/voters/forms/form-2a" element={<Form2A />} />
                    <Route path="/voters/forms/form-3" element={<Form3 />} />
                    <Route path="/voters/forms/form-6a" element={<Form6A />} />
                    <Route path="/voters/forms/form-6b" element={<Form6B />} />
                    <Route path="/voters/forms/form-7" element={<Form7 />} />
                    <Route path="/voters/forms/form-8" element={<Form8 />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>

                {/* Stand-alone phone simulator used during demonstrations */}
                <Route path="/phone" element={<PhoneScreen />} />
            </Routes>
            <StepUpDialog />
        </BrowserRouter>
    );
}

export default App;

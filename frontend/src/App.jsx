
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import EciHome from "./pages/EciHome";
import CitizenPortal from "./pages/CitizenPortal";
import CvigilPortal from "./pages/CvigilPortal";
import SuvidhaPortal from "./pages/SuvidhaPortal";
import EncorePortal from "./pages/EncorePortal";
import CeoHimachalPortal from "./pages/CeoHimachalPortal";
import WorkflowPortal from "./pages/WorkflowPortal";
import MediaPublicationsPortal from "./pages/MediaPublicationsPortal";

import PortalSelect from "./pages/PortalSelect";
import ServiceSelect from "./pages/ServiceSelect";
import Dashboard from "./pages/Dashboard";
import Verify from "./pages/Verify";
import Login from "./pages/Login";
import LoginOtp from "./pages/LoginOtp";
import BloLogin from "./pages/BloLogin";
import BloChangePassword from "./pages/BloChangePassword";
import BloForgotPassword from "./pages/BloForgotPassword";
import Register from "./pages/Register";
import CheckRequest from "./pages/CheckRequest";
import ElectoralRoll from "./pages/ElectoralRoll";
import Admin from "./pages/Admin";
import EciLogin from "./pages/EciLogin";
import EciDashboard from "./pages/EciDashboard";
import VotingVerification from "./pages/VotingVerification";
import PhoneScreen from "./pages/PhoneScreen";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Flagship National Portal & Integrated Systems */}
                <Route path="/" element={<EciHome />} />
                <Route path="/voters" element={<CitizenPortal />} />
                <Route path="/cvigil" element={<CvigilPortal />} />
                <Route path="/suvidha" element={<SuvidhaPortal />} />
                <Route path="/encore" element={<EncorePortal />} />
                <Route path="/ceo-himachal" element={<CeoHimachalPortal />} />
                <Route path="/workflows" element={<WorkflowPortal />} />
                <Route path="/media-publications" element={<MediaPublicationsPortal />} />

                {/* Role Switcher & Services */}
                <Route path="/portals" element={<PortalSelect />} />
                <Route path="/services" element={<ServiceSelect />} />
                <Route path="/dashboard" element={<Dashboard />} />

                {/* Authentication & Operations */}
                <Route path="/login" element={<Login />} />
                <Route path="/login/otp" element={<LoginOtp />} />
                <Route path="/blo/login" element={<BloLogin />} />
                <Route path="/blo/password" element={<BloChangePassword />} />
                <Route path="/blo/forgot" element={<BloForgotPassword />} />
                <Route path="/register" element={<Register />} />
                <Route path="/check-request" element={<CheckRequest />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/electoral-roll" element={<ElectoralRoll />} />
                <Route path="/admin" element={<Admin />} />

                <Route path="/eci/login" element={<EciLogin />} />
                <Route path="/eci/dashboard" element={<EciDashboard />} />
                <Route
                    path="/eci/voting-verification"
                    element={<VotingVerification />}
                />
                <Route path="/phone" element={<PhoneScreen />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;

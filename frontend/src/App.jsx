
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

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
import ElectoralRoll from "./pages/ElectoralRoll";
import Admin from "./pages/Admin";
import EciLogin from "./pages/EciLogin";
import EciDashboard from "./pages/EciDashboard";
import VotingVerification from "./pages/VotingVerification";
import LanguageSelector from "./LanguageSelector";
import PhoneScreen from "./pages/PhoneScreen";

function App() {
    return (
        <BrowserRouter>
            <LanguageSelector />
            <Routes>
                <Route path="/" element={<PortalSelect />} />
                <Route path="/services" element={<ServiceSelect />} />
                <Route path="/dashboard" element={<Dashboard />} />

                <Route path="/login" element={<Login />} />
                <Route path="/login/otp" element={<LoginOtp />} />
                <Route path="/blo/login" element={<BloLogin />} />
                <Route path="/blo/password" element={<BloChangePassword />} />
                <Route path="/blo/forgot" element={<BloForgotPassword />} />
                <Route path="/register" element={<Register />} />
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

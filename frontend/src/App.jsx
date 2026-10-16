
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import PortalSelect from "./pages/PortalSelect";
import ServiceSelect from "./pages/ServiceSelect";
import Dashboard from "./pages/Dashboard";
import Verify from "./pages/Verify";
import Login from "./pages/Login";
import LoginOtp from "./pages/LoginOtp";
import Register from "./pages/Register";
import ElectoralRoll from "./pages/ElectoralRoll";
import Admin from "./pages/Admin";
import EciLogin from "./pages/EciLogin";
import EciDashboard from "./pages/EciDashboard";
import VotingVerification from "./pages/VotingVerification";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<PortalSelect />} />
                <Route path="/services" element={<ServiceSelect />} />
                <Route path="/dashboard" element={<Dashboard />} />

                <Route path="/login" element={<Login />} />
                <Route path="/login/otp" element={<LoginOtp />} />
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
            </Routes>
        </BrowserRouter>
    );
}

export default App;

import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";

import Dashboard from "./pages/Dashboard";
import Verify from "./pages/Verify";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ElectoralRoll from "./pages/ElectoralRoll";
import Admin from "./pages/Admin";
import EciLogin from "./pages/EciLogin";
import VotingVerification from "./pages/VotingVerification";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/electoral-roll" element={<ElectoralRoll />} />
                <Route path="/admin" element={<Admin />} />

                {/* Separate election-official portal */}
                <Route path="/eci/login" element={<EciLogin />} />
                <Route path="/eci/voting-verification" element={<VotingVerification />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;

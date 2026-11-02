import { useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import AgentAppointments from "../components/AgentAppointments";
import { apiMessage } from "../config/elections";

// Election agent: the candidate they represent, and the polling and counting agents they appoint
// on the candidate's behalf. Polling and counting agents see their own appointment here.

export default function AgentDesk() {
    const { logged, userData } = useContext(AuthContext);
    const [assignments, setAssignments] = useState([]);
    const [error, setError] = useState("");
    const role = userData?.role;
    const isAgent = logged && ["election_agent", "polling_agent", "counting_agent"].includes(role);

    useEffect(() => {
        if (!isAgent) return;
        api.get("/assignments/me").then(({ data }) => setAssignments(data.data.assignments)).catch((err) => setError(apiMessage(err, "Could not load your appointment.")));
    }, [isAgent]);

    if (!logged) return <Navigate to="/signin/election_agent" replace />;
    if (!isAgent) return <Navigate to="/home" replace />;
    const appointment = assignments.find((a) => a.appointedFor);

    return (
        <>
            <PageHead title="Agent desk" crumbs={[{ label: "Candidates and parties", to: "/candidates" }, { label: "Agent desk" }]}
                lede={appointment ? `You are ${appointment.agentType} agent for ${appointment.candidateName} (${appointment.party}), ${appointment.jurisdiction.constituency}.` : "You have no current appointment from a candidate."} />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {appointment?.jurisdiction.pollingStation && <p className="panel">Your polling station: part {appointment.jurisdiction.partNumber}, {appointment.jurisdiction.pollingStation}. <Link to="/poll-day">Open the poll-day view</Link></p>}
                    {appointment && role === "election_agent" && <AgentAppointments electionId={appointment.election} isCandidate={false} />}
                    {appointment && role === "counting_agent" && <p className="panel">Results are shown as received from the registered result source. <Link to="/results">Open results</Link> · <Link to="/counting">Counting rounds and discrepancy reports</Link></p>}
                </div>
            </section>
        </>
    );
}

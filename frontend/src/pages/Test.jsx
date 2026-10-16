
import { useState } from "react";
import api from "../api/axios";

export default function PersonaVerification() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inquiryId, setInquiryId] = useState("");

  // Temporary frontend-only login
  const dummyUser = {
    id: "dummy-voter-001",
    name: "Test Voter",
    epicNumber: "TEST1234567",
  };

  async function startVerification() {
    setLoading(true);
    setError("");
    setInquiryId("");

    try {
      const response = await api.post("/persona/start", {
        userId: dummyUser.id,
      });

      setInquiryId(response.data.inquiryId);

      if (response.data.verificationUrl) {
        window.location.assign(response.data.verificationUrl);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not start verification. Check your backend."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 440, margin: "40px auto", padding: 24 }}>
      <h2>Voter Identity Verification</h2>
      <p>Temporary Persona sandbox integration</p>

      {!loggedIn ? (
        <div>
          <p>
            Test account: <strong>{dummyUser.name}</strong>
          </p>
          <p>EPIC: {dummyUser.epicNumber}</p>

          <button onClick={() => setLoggedIn(true)}>
            Dummy Login
          </button>
        </div>
      ) : (
        <div>
          <p>Logged in as {dummyUser.name}</p>

          <button
            onClick={startVerification}
            disabled={loading}
          >
            {loading ? "Starting..." : "Verify Identity"}
          </button>

          <button
            onClick={() => setLoggedIn(false)}
            disabled={loading}
            style={{ marginLeft: 8 }}
          >
            Logout
          </button>
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
      {inquiryId && <p>Inquiry ID: {inquiryId}</p>}
    </div>
  );
}

import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import "./Login.css";

function Login() {
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        username: "",
        password: ""
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");

        if (!formData.username.trim() || !formData.password) {
            setError("Please enter your username and password.");
            return;
        }

        try {
            setLoading(true);

            const response = await api.post("/auth/login", {
                username: formData.username.trim(),
                password: formData.password
            });

            /*
             * Expected backend response:
             *
             * {
             *   token: "...",
             *   user: {
             *      username: "..."
             *   }
             * }
             *
             * Adjust these fields once we confirm
             * your actual backend response.
             */

            const token = response.data.token;
            const username =
                response.data.user?.username ||
                response.data.username ||
                formData.username;

            if (!token) {
                throw new Error("Authentication token was not returned.");
            }

            const userData = response.data.user || {};
            login(username, token, userData);

            if (userData.role === "blo" || userData.role === "admin") navigate("/admin");
            else navigate("/");
        } catch (err) {
            console.error("Login error:", err);

            const message =
                err.response?.data?.message ||
                err.response?.data?.error ||
                "Unable to sign in. Please check your credentials and try again.";

            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-page">

            <section className="login-card">

                <div className="login-header">
                    <p className="eyebrow">ELECTOR SERVICES</p>

                    <h1>Sign in</h1>

                    <p>
                        Sign in to access your election verification
                        services.
                    </p>
                </div>

                {error && (
                    <div className="login-error" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>

                    <div className="form-group">
                        <label htmlFor="username">
                            Username
                        </label>

                        <input
                            id="username"
                            name="username"
                            type="text"
                            value={formData.username}
                            onChange={handleChange}
                            autoComplete="username"
                            placeholder="Enter your username"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">
                            Password
                        </label>

                        <input
                            id="password"
                            name="password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                        disabled={loading}
                    >
                        {loading ? "Signing in..." : "Sign in"}
                    </button>

                </form>

                <div className="login-footer">
                    <Link to="/">
                        Return to home
                    </Link>
                </div>

            </section>

        </main>
    );
}

export default Login;

import { Link, useSearchParams, Navigate } from "react-router-dom";
import "./PortalSelect.css";

const roleInfo = {
    voter: {
        title: "Voter Services",
        description: "Choose what you want to do.",
        actions: [
            {
                title: "Sign in",
                description: "Access your existing voter account.",
                link: "/login",
                icon: "🔐",
            },
            {
                title: "Register",
                description: "Create your voter account or submit registration details.",
                link: "/register",
                icon: "✍️",
            },
            {
                title: "Electoral Roll",
                description: "Search and check electoral-roll records.",
                link: "/electoral-roll",
                icon: "📑",
            },
        ],
    },
    blo: {
        title: "BLO Portal",
        description: "Sign in to access your assigned area and voter requests.",
        actions: [
            {
                title: "BLO Sign in",
                description: "Continue to the voter and verification management portal.",
                link: "/login",
                icon: "🔐",
            },
        ],
    },
    eci: {
        title: "ECI Official Portal",
        description: "Sign in to access authorised election-day operations.",
        actions: [
            {
                title: "Official Sign in",
                description: "Continue to polling-station verification services.",
                link: "/eci/login",
                icon: "🏛️",
            },
        ],
    },
};

function ServiceSelect() {
    const [params] = useSearchParams();
    const role = params.get("role");
    const info = roleInfo[role];

    if (!info) return <Navigate to="/" replace />;

    return (
        <main className="portal-page">
            <header className="portal-header">
                <Link to="/" className="brand-mark">EC</Link>
                <div>
                    <strong>Election Management System</strong>
                    <p>Digital Electoral Services</p>
                </div>
                <Link to="/" className="back-link">Change portal</Link>
            </header>

            <section className="portal-content service-content">
                <p className="portal-eyebrow">
                    {role.toUpperCase()} PORTAL
                </p>
                <h1>{info.title}</h1>
                <p className="portal-subtitle">{info.description}</p>

                <div className="service-grid">
                    {info.actions.map((action, index) => (
                        <Link
                            to={action.link}
                            className="service-card"
                            key={action.title}
                        >
                            <div className="portal-card-top">
                                <span className="portal-icon">
                                    {action.icon}
                                </span>
                                <span className="portal-number">
                                    0{index + 1}
                                </span>
                            </div>

                            <h2>{action.title}</h2>
                            <p>{action.description}</p>
                            <span className="portal-continue">
                                Continue <span aria-hidden="true">→</span>
                            </span>
                        </Link>
                    ))}
                </div>

                <p className="portal-footer">
                    Choose an option to proceed. Protected services may require
                    authentication.
                </p>
            </section>
        </main>
    );
}

export default ServiceSelect;

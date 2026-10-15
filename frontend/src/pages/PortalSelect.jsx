
import { useNavigate } from "react-router-dom";
import "./PortalSelect.css";

const portals = [
    {
        id: "voter",
        number: "01",
        title: "Voter",
        description:
            "Access voter services, register, verify your identity, and check electoral records.",
        icon: "👤",
    },
    {
        id: "blo",
        number: "02",
        title: "Booth Level Officer",
        description:
            "Access voter records and verification requests for your assigned area.",
        icon: "📋",
    },
    {
        id: "eci",
        number: "03",
        title: "ECI Official",
        description:
            "Access the election-official portal and polling-station verification workflow.",
        icon: "🏛️",
    },
];

function PortalSelect() {
    const navigate = useNavigate();

    return (
        <main className="portal-page">
            <header className="portal-header">
                <div className="brand-mark">EC</div>
                <div>
                    <strong>Election Management System</strong>
                    <p>Digital Electoral Services</p>
                </div>
            </header>

            <section className="portal-content">
                <p className="portal-eyebrow">WELCOME TO ELECTOR SERVICES</p>
                <h1>How would you like to sign in?</h1>
                <p className="portal-subtitle">
                    Select your portal to continue to the services available
                    for your role.
                </p>

                <div className="portal-grid">
                    {portals.map((portal) => (
                        <button
                            className="portal-card"
                            key={portal.id}
                            onClick={() =>
                                navigate(`/services?role=${portal.id}`)
                            }
                        >
                            <div className="portal-card-top">
                                <span className="portal-icon">
                                    {portal.icon}
                                </span>
                                <span className="portal-number">
                                    {portal.number}
                                </span>
                            </div>

                            <h2>{portal.title}</h2>
                            <p>{portal.description}</p>

                            <span className="portal-continue">
                                Continue <span aria-hidden="true">→</span>
                            </span>
                        </button>
                    ))}
                </div>

                <p className="portal-footer">
                    Prototype environment · Official identity integrations
                    are not enabled
                </p>
            </section>
        </main>
    );
}

export default PortalSelect;

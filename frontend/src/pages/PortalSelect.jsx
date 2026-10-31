
import { useNavigate, Link } from "react-router-dom";
import "./PortalSelect.css";
import { useTranslation } from "react-i18next";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";

const portals = [
  {
    id: "voter",
    number: "01",
    titleKey: "portal.roles.voter",
    descriptionKey: "portal.descriptions.voter",
    icon: "👤"
  },
  {
    id: "blo",
    number: "02",
    titleKey: "portal.roles.blo",
    descriptionKey: "portal.descriptions.blo",
    icon: "📋"
  },
  {
    id: "eci",
    number: "03",
    titleKey: "portal.roles.eci",
    descriptionKey: "portal.descriptions.eci",
    icon: "🏛️"
  }
];

function PortalSelect() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="gov-page-root">
            <GovHeader />
            <div className="gov-breadcrumb-strip">
                <div className="gov-breadcrumb-container">
                    <Link to="/">Home</Link> &gt; <span>Select Official Portal</span>
                </div>
            </div>
            <main className="portal-page">

            <section className="portal-content">
                <p className="portal-eyebrow">{t("portal.welcome")}</p>
                <h1>{t("portal.chooseAction")}</h1>
                <p className="portal-subtitle">
                    {t("portal.selectPrompt")}
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

                            <h2>{t(portal.titleKey)}</h2>
                            <p>{t(portal.descriptionKey)}</p>

                            <span className="portal-continue">
                                {t("common.continue")} <span aria-hidden="true">→</span>
                            </span>
                        </button>
                    ))}
                </div>

                <p className="portal-footer">{t("portal.footer")}</p>
            </section>
        </main>
        <GovFooter />
    </div>
    );
}

export default PortalSelect;

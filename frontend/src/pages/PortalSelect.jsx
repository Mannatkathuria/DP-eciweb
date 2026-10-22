
import { useNavigate } from "react-router-dom";
import "./PortalSelect.css";
import { useTranslation } from "react-i18next";

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
        <main className="portal-page">
            <header className="portal-header">
                <div className="brand-mark">EC</div>
                <div>
                    <strong>{t("portal.title")}</strong>
                    <p>{t("portal.subtitle")}</p>
                </div>
            </header>

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
    );
}

export default PortalSelect;

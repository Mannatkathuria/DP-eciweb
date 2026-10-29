
import { Link, useSearchParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./PortalSelect.css";

const roleInfo = {
    voter: {
        titleKey: "service.voter.title",
        descriptionKey: "service.voter.description",
        actions: [
            {
                titleKey: "service.voter.signInTitle",
                descriptionKey: "service.voter.signInDescription",
                link: "/login?role=voter",
                icon: "🔐",
            },
            {
                titleKey: "service.voter.registerTitle",
                descriptionKey: "service.voter.registerDescription",
                link: "/register",
                icon: "✍️",
            },
            {
                titleKey: "service.voter.rollTitle",
                descriptionKey: "service.voter.rollDescription",
                link: "/electoral-roll",
                icon: "📑",
            },
            {
                titleKey: "register.checkRequest",
                descriptionKey: "service.voter.checkDescription",
                link: "/check-request",
                icon: "🔎",
            },
        ],
    },
    blo: {
        titleKey: "service.blo.title",
        descriptionKey: "service.blo.description",
        actions: [
            {
                titleKey: "service.blo.signInTitle",
                descriptionKey: "service.blo.signInDescription",
                link: "/blo/login",
                icon: "🔐",
            },
        ],
    },
    eci: {
        titleKey: "service.eci.title",
        descriptionKey: "service.eci.description",
        actions: [
            {
                titleKey: "service.eci.signInTitle",
                descriptionKey: "service.eci.signInDescription",
                link: "/eci/login",
                icon: "🏛️",
            },
        ],
    },
};

function ServiceSelect() {
    const [params] = useSearchParams();
    const { t } = useTranslation();
    const role = params.get("role");
    const info = roleInfo[role];

    if (!info) return <Navigate to="/" replace />;

    return (
        <main className="portal-page">
            <header className="portal-header">
                <Link to="/" className="brand-mark">EC</Link>
                <div>
                    <strong>{t("portal.title")}</strong>
                    <p>{t("portal.subtitle")}</p>
                </div>
                <Link to="/" className="back-link">{t("portal.changePortal")}</Link>
            </header>

            <section className="portal-content service-content">
                <p className="portal-eyebrow">
                    {t(`service.${role}.eyebrow`)}
                </p>
                <h1>{t(info.titleKey)}</h1>
                <p className="portal-subtitle">{t(info.descriptionKey)}</p>

                <div className="service-grid">
                    {info.actions.map((action, index) => (
                        <Link
                            to={action.link}
                            className="service-card"
                            key={action.titleKey}
                        >
                            <div className="portal-card-top">
                                <span className="portal-icon">
                                    {action.icon}
                                </span>
                                <span className="portal-number">
                                    0{index + 1}
                                </span>
                            </div>

                            <h2>{t(action.titleKey)}</h2>
                            <p>{t(action.descriptionKey)}</p>
                            <span className="portal-continue">
                                {t("common.continue")} <span aria-hidden="true">→</span>
                            </span>
                        </Link>
                    ))}
                </div>

                <p className="portal-footer">{t("service.footer")}</p>
            </section>
        </main>
    );
}

export default ServiceSelect;

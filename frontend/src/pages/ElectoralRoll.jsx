import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./ElectoralRoll.css";
import api from "../api/axios";

function ElectoralRoll() {
    const { t } = useTranslation();
    const [searchMethod, setSearchMethod] = useState("epic");

    const [formData, setFormData] = useState({
        epic: "",
        name: "",
        state: "",
        district: "",
        constituency: "",
        mobile: ""
    });

    const [elector, setElector] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSearch = async (e) => {
        e.preventDefault();

        setError("");
        setElector(null);

        // Basic validation
        if (searchMethod === "epic" && !formData.epic.trim()) {
            setError(t("electoral.enterEpic"));
            return;
        }

        if (searchMethod === "details") {
            if (!formData.name.trim() || !formData.state) {
                setError(t("electoral.enterDetails"));
                return;
            }
        }

        if (searchMethod === "mobile" && !formData.mobile.trim()) {
            setError(t("electoral.enterMobile"));
            return;
        }

        try {
            setLoading(true);

            console.log("Searching electoral roll:", {
                method: searchMethod,
                formData
            });

            const response = await api.post("/electors/search", {
                method: searchMethod,
                epic: formData.epic,
                name: formData.name,
                state: formData.state,
                district: formData.district,
                assemblyConstituency: formData.constituency,
                mobile: formData.mobile
            });

            console.log("Electoral API response:", response.data);

            setElector(response.data.data);

        } catch (error) {
            console.error("Electoral search failed:", error);

            setError(
                t("electoral.searchFailed")
            );

        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="electoral-page">

            <div className="electoral-container">

                <header className="electoral-header">

                    <p className="eyebrow">
                        {t("portal.voterServices")}
                    </p>

                    <h1>
                        {t("electoral.title")}
                    </h1>

                    <p>
                        {t("electoral.intro")}
                    </p>

                </header>

                <section className="electoral-card">

                    <div className="search-methods">

                        <button
                            type="button"
                            className={
                                searchMethod === "epic"
                                    ? "active"
                                    : ""
                            }
                            onClick={() => {
                                setSearchMethod("epic");
                                setError("");
                                setElector(null);
                            }}
                        >
                            {t("electoral.epicNumber")}
                        </button>

                        <button
                            type="button"
                            className={
                                searchMethod === "details"
                                    ? "active"
                                    : ""
                            }
                            onClick={() => {
                                setSearchMethod("details");
                                setError("");
                                setElector(null);
                            }}
                        >
                            {t("electoral.personalDetails")}
                        </button>

                        <button
                            type="button"
                            className={
                                searchMethod === "mobile"
                                    ? "active"
                                    : ""
                            }
                            onClick={() => {
                                setSearchMethod("mobile");
                                setError("");
                                setElector(null);
                            }}
                        >
                            {t("electoral.mobileNumber")}
                        </button>

                    </div>

                    {error && (
                        <div
                            className="search-error"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSearch}>

                        {/* EPIC */}

                        {searchMethod === "epic" && (
                            <div className="form-section">

                                <div className="form-group">

                                    <label htmlFor="epic">
                                        {t("electoral.epicNumber")}
                                    </label>

                                    <input
                                        id="epic"
                                        name="epic"
                                        type="text"
                                        value={formData.epic}
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                epic: e.target.value.toUpperCase()
                                            }))
                                        }
                                        placeholder={t("electoral.epicPlaceholder")}
                                        autoComplete="off"
                                        disabled={loading}
                                    />

                                    <span>
                                        {t("electoral.epicHelp")}
                                    </span>

                                </div>

                            </div>
                        )}

                        {/* PERSONAL DETAILS */}

                        {searchMethod === "details" && (
                            <div className="form-section">

                                <div className="form-group">

                                    <label htmlFor="name">
                                        Name
                                    </label>

                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder={t("electoral.namePlaceholder")}
                                        disabled={loading}
                                    />

                                </div>

                                <div className="form-row">

                                    <div className="form-group">

                                        <label htmlFor="state">
                                            {t("register.state")}
                                        </label>

                                        <select
                                            id="state"
                                            name="state"
                                            value={formData.state}
                                            onChange={handleChange}
                                            disabled={loading}
                                        >
                                            <option value="">
                                                {t("electoral.selectState")}
                                            </option>

                                            <option value="Himachal Pradesh">
                                                {t("electoral.states.himachal")}
                                            </option>

                                            <option value="Punjab">
                                                {t("electoral.states.punjab")}
                                            </option>

                                            <option value="Haryana">
                                                {t("electoral.states.haryana")}
                                            </option>

                                            <option value="Delhi">
                                                {t("electoral.states.delhi")}
                                            </option>

                                        </select>

                                    </div>

                                    <div className="form-group">

                                        <label htmlFor="district">
                                            {t("register.district")}
                                        </label>

                                        <input
                                            id="district"
                                            name="district"
                                            type="text"
                                            value={formData.district}
                                            onChange={handleChange}
                                            placeholder={t("electoral.districtPlaceholder")}
                                            disabled={loading}
                                        />

                                    </div>

                                </div>

                                <div className="form-group">

                                    <label htmlFor="constituency">
                                        {t("electoral.constituency")}
                                    </label>

                                    <input
                                        id="constituency"
                                        name="constituency"
                                        type="text"
                                        value={formData.constituency}
                                        onChange={handleChange}
                                        placeholder={t("electoral.constituencyPlaceholder")}
                                        disabled={loading}
                                    />

                                </div>

                            </div>
                        )}

                        {/* MOBILE */}

                        {searchMethod === "mobile" && (
                            <div className="form-section">

                                <div className="form-group">

                                    <label htmlFor="mobile">
                                        {t("electoral.registeredMobile")}
                                    </label>

                                    <input
                                        id="mobile"
                                        name="mobile"
                                        type="tel"
                                        value={formData.mobile}
                                        onChange={handleChange}
                                        placeholder={t("electoral.mobilePlaceholder")}
                                        autoComplete="tel"
                                        disabled={loading}
                                    />

                                    <span>
                                        {t("electoral.mobileHelp")}
                                    </span>

                                </div>

                            </div>
                        )}

                        <button
                            type="submit"
                            className="search-button"
                            disabled={loading}
                        >
                            {loading
                                ? t("electoral.searching")
                                : t("electoral.searchButton")}
                        </button>

                    </form>

                </section>

                {/* RESULT */}

                {elector && (
                    <section className="electoral-card">

                        <h2>
                            {t("electoral.recordFound")}
                        </h2>

                        <div className="record-box">

                            <div className="record-row">
                                <span>{t("register.fullName")}</span>
                                <strong>
                                    {elector.name || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("electoral.epicNumber")}</span>
                                <strong>
                                    {elector.epic || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("register.dateOfBirth")}</span>
                                <strong>
                                    {elector.dateOfBirth
                                        ? new Date(
                                            elector.dateOfBirth
                                        ).toLocaleDateString()
                                        : "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("register.gender")}</span>
                                <strong>
                                    {elector.gender ? t(`register.${elector.gender.toLowerCase()}`, { defaultValue: elector.gender }) : "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("register.state")}</span>
                                <strong>
                                    {elector.state || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("register.district")}</span>
                                <strong>
                                    {elector.district || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("electoral.constituency")}</span>
                                <strong>
                                    {elector.assemblyConstituency || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("register.partNumber")}</span>
                                <strong>
                                    {elector.partNumber || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>{t("register.pollingStation")}</span>
                                <strong>
                                    {elector.pollingStation || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>Election Day Status</span>
                                <strong>
                                    {elector.hasVoted ? (
                                        <span style={{ color: "#2e7d32", fontWeight: "700" }}>✓ Voted ({new Date(elector.votedAt).toLocaleDateString()})</span>
                                    ) : (
                                        <span style={{ color: "var(--accent, #ff9933)", fontWeight: "700" }}>Eligible to Vote</span>
                                    )}
                                </strong>
                            </div>

                        </div>

                    </section>
                )}

                <section className="electoral-information">

                    <h2>
                        {t("electoral.beforeSearch")}
                    </h2>

                    <ul>
                        <li>
                            {t("electoral.tipEpic")}
                        </li>

                        <li>
                            {t("electoral.tipMatch")}
                        </li>

                        <li>
                            {t("electoral.tipHelp")}
                        </li>
                    </ul>

                </section>

            </div>

        </main>
    );
}

export default ElectoralRoll;
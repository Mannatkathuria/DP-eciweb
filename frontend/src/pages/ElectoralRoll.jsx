import { useState } from "react";
import "./ElectoralRoll.css";
import api from "../api/axios";

function ElectoralRoll() {
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
            setError("Please enter your EPIC number.");
            return;
        }

        if (searchMethod === "details") {
            if (!formData.name.trim() || !formData.state) {
                setError("Please enter the required personal details.");
                return;
            }
        }

        if (searchMethod === "mobile" && !formData.mobile.trim()) {
            setError("Please enter your registered mobile number.");
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
                error.response?.data?.message ||
                "Unable to search the electoral record."
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
                        ELECTOR SERVICES
                    </p>

                    <h1>
                        Search Electoral Roll
                    </h1>

                    <p>
                        Search for your electoral record using an
                        available identification method.
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
                            EPIC Number
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
                            Personal Details
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
                            Mobile Number
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
                                        EPIC Number
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
                                        placeholder="Enter EPIC number"
                                        autoComplete="off"
                                        disabled={loading}
                                    />

                                    <span>
                                        Enter the EPIC number printed on
                                        your Elector Photo Identity Card.
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
                                        placeholder="Enter name"
                                        disabled={loading}
                                    />

                                </div>

                                <div className="form-row">

                                    <div className="form-group">

                                        <label htmlFor="state">
                                            State / UT
                                        </label>

                                        <select
                                            id="state"
                                            name="state"
                                            value={formData.state}
                                            onChange={handleChange}
                                            disabled={loading}
                                        >
                                            <option value="">
                                                Select State / UT
                                            </option>

                                            <option value="Himachal Pradesh">
                                                Himachal Pradesh
                                            </option>

                                            <option value="Punjab">
                                                Punjab
                                            </option>

                                            <option value="Haryana">
                                                Haryana
                                            </option>

                                            <option value="Delhi">
                                                Delhi
                                            </option>

                                        </select>

                                    </div>

                                    <div className="form-group">

                                        <label htmlFor="district">
                                            District
                                        </label>

                                        <input
                                            id="district"
                                            name="district"
                                            type="text"
                                            value={formData.district}
                                            onChange={handleChange}
                                            placeholder="Enter district"
                                            disabled={loading}
                                        />

                                    </div>

                                </div>

                                <div className="form-group">

                                    <label htmlFor="constituency">
                                        Assembly Constituency
                                    </label>

                                    <input
                                        id="constituency"
                                        name="constituency"
                                        type="text"
                                        value={formData.constituency}
                                        onChange={handleChange}
                                        placeholder="Enter constituency"
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
                                        Registered Mobile Number
                                    </label>

                                    <input
                                        id="mobile"
                                        name="mobile"
                                        type="tel"
                                        value={formData.mobile}
                                        onChange={handleChange}
                                        placeholder="Enter registered mobile number"
                                        autoComplete="tel"
                                        disabled={loading}
                                    />

                                    <span>
                                        This method will be available only
                                        where supported by the authorised
                                        electoral service.
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
                                ? "Searching..."
                                : "Search Electoral Roll"}
                        </button>

                    </form>

                </section>

                {/* RESULT */}

                {elector && (
                    <section className="electoral-card">

                        <h2>
                            Electoral Record Found
                        </h2>

                        <div className="record-box">

                            <div className="record-row">
                                <span>Name</span>
                                <strong>
                                    {elector.name || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>EPIC Number</span>
                                <strong>
                                    {elector.epic || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>Date of Birth</span>
                                <strong>
                                    {elector.dateOfBirth
                                        ? new Date(
                                            elector.dateOfBirth
                                        ).toLocaleDateString()
                                        : "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>Gender</span>
                                <strong>
                                    {elector.gender || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>State</span>
                                <strong>
                                    {elector.state || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>District</span>
                                <strong>
                                    {elector.district || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>Assembly Constituency</span>
                                <strong>
                                    {elector.assemblyConstituency || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>Part Number</span>
                                <strong>
                                    {elector.partNumber || "—"}
                                </strong>
                            </div>

                            <div className="record-row">
                                <span>Polling Station</span>
                                <strong>
                                    {elector.pollingStation || "—"}
                                </strong>
                            </div>

                        </div>

                    </section>
                )}

                <section className="electoral-information">

                    <h2>
                        Before you search
                    </h2>

                    <ul>
                        <li>
                            Keep your EPIC number available if possible.
                        </li>

                        <li>
                            Ensure that the information entered matches
                            your electoral record.
                        </li>

                        <li>
                            If your record cannot be located, seek
                            assistance through the appropriate electoral
                            authority.
                        </li>
                    </ul>

                </section>

            </div>

        </main>
    );
}

export default ElectoralRoll;
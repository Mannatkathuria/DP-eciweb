import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1",
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
        // Anti-forgery header the backend requires when the session travels in the cookie.
        "X-Requested-With": "XMLHttpRequest"
    }
});

// Request interceptor to add JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Re-authentication before sensitive approvals. The server answers 401 with code STEP_UP_REQUIRED;
// the StepUpDialog asks for a fresh one-time code, and the request is retried once with the
// short-lived step-up token. The token is kept in memory only, never in storage.
let stepUp = null; // { token, expiresAt }
let prompt = null;
export const setStepUpPrompt = (fn) => { prompt = fn; };
export const clearStepUp = () => { stepUp = null; };
export const rememberStepUp = (token, minutes) => { stepUp = { token, expiresAt: Date.now() + (minutes * 60 - 15) * 1000 }; };

api.interceptors.request.use((config) => {
    if (stepUp && stepUp.expiresAt > Date.now()) config.headers["X-Step-Up"] = stepUp.token;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const needsStepUp = error.response?.status === 401 && error.response.data?.errors?.[0]?.code === "STEP_UP_REQUIRED";
        if (needsStepUp) {
            stepUp = null;
            if (prompt && !error.config._steppedUp && (await prompt())) {
                return api({ ...error.config, _steppedUp: true });
            }
            return Promise.reject(error);
        }
        if (error.response?.status === 401) {
            localStorage.removeItem("token");
        }
        return Promise.reject(error);
    }
);

export default api;
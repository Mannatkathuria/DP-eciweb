// Deployment mode. APP_MODE=training runs a practice environment: every response says so, the
// screens show a banner, and nothing that could carry real personal data or official results can
// be connected (approved government data sources, official result feeds).
export const APP_MODE = process.env.APP_MODE === "training" ? "training" : "live";
export const isTraining = () => (process.env.APP_MODE === "training");

/**
 * Configuration checks run once at start-up. In production, a weak token secret or a demo switch
 * left on stops the server rather than running unsafely.
 */
export const checkConfig = (env = process.env) => {
    const problems = [];
    if (env.NODE_ENV === "production") {
        if (!env.ACCESS_TOKEN_SECRET || env.ACCESS_TOKEN_SECRET.length < 32) problems.push("ACCESS_TOKEN_SECRET must be at least 32 characters in production.");
        if (env.PERSONA_DEMO_MODE === "true" && env.APP_MODE !== "training") problems.push("PERSONA_DEMO_MODE must not be on in a live production deployment.");
        if (!env.CLIENT_URL) problems.push("CLIENT_URL must list the allowed web origins in production.");
    }
    return problems;
};

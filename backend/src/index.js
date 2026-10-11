import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";

const PORT = process.env.PORT || 8000;

connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("REDIS CONNECTION FAILED:", err.message);
        process.exit(1);
    });

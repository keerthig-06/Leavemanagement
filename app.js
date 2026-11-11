
const express = require("express");
const path = require("path");
const cors = require("cors");

const connectDB = require("./config/db");
const leaveRoutes = require("./routes/leaveRoutes");

const app = express();
const PORT = process.env.PORT || 5050;

// Allow GitHub Pages to connect to Render backend
app.use(cors({
    origin: "https://keerthig-06.github.io",
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Frontend files
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api", leaveRoutes);

// Start server
const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.log("Server startup error:", error);
    }
};

startServer();

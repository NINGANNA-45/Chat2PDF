require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const chatRoutes = require("./routes/chatRoutes");
const pdfRoutes = require("./routes/pdfRoutes");

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
  })
);
app.use(express.json({ limit: "2mb" }));

// Basic abuse protection: fetching remote pages and rendering PDFs are
// both relatively expensive operations.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please slow down and try again shortly." },
});
app.use("/api", apiLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", chatRoutes);
app.use("/api", pdfRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not found." });
});

// Central error handler (catches anything thrown outside controller try/catch blocks)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`Chat2PDF backend listening on port ${PORT}`);
});

module.exports = app;

const express = require("express");
const { generatePdfHandler } = require("../controllers/pdfController");

const router = express.Router();

router.post("/generate-pdf", generatePdfHandler);

module.exports = router;

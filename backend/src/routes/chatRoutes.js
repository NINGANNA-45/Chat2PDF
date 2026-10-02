const express = require("express");
const { fetchChatHandler } = require("../controllers/chatController");

const router = express.Router();

router.post("/fetch-chat", fetchChatHandler);

module.exports = router;

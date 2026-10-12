"use strict";

const express = require("express");

const {
    startConversation,
    sendFollowUp,
    listMessages,
} = require("../controllers/agent-chat.controller");

const router = express.Router();

router.post("/", startConversation);

router.post("/:conversationId/messages", sendFollowUp);

router.get("/:conversationId/messages", listMessages);

module.exports = router;
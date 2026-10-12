"use strict";

const express = require("express");

const {
    routeRequest,
    runChatMode,
    runAgentMode,
    classifyRequest,
} = require("../controllers/agent-routing.controller");

const router = express.Router();

// Automatically select Chat mode or Agent mode
router.post("/route", routeRequest);

// Force Genie Chat mode
router.post("/chat", runChatMode);

// Force Genie Agent mode
router.post("/reason", runAgentMode);

// Preview the routing decision without calling Databricks
router.post("/classify", classifyRequest);

module.exports = router;
"use strict";

const express = require("express");

const {
    getCustomerSummary,
    getProductSummary,
    getCategoryRanking,
} = require("../controllers/databricks-functions.controller");

const router = express.Router();

// Customer sales summary
router.get("/customer/:customerId", getCustomerSummary);

// Product sales summary
router.get("/product/:productId", getProductSummary);

// Category sales ranking for a date range
router.post("/category-ranking", getCategoryRanking);

module.exports = router;
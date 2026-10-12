const express = require("express");
const { databricksJson } = require("../services/databricks-auth.service.js");

const router = express.Router();

router.get("/test", async (request, response) => {
    try {
        const identity = await databricksJson(
            "/api/2.0/preview/scim/v2/Me",
            {
                method: "GET",
            },
        );

        response.json({
            success: true,
            message: "Databricks authentication succeeded.",
            identity: {
                id: identity.id,
                userName: identity.userName,
                active: identity.active,
            },
        });
    } catch (error) {
        console.error(
            "Databricks authentication test failed:",
            error.message,
        );

        response.status(error.status ?? 500).json({
            success: false,
            error: "Databricks authentication failed.",
            details: error.message,
        });
    }
});

module.exports = router
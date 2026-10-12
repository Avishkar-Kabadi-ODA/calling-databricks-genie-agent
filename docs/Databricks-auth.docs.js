"use strict";

module.exports = {
    tag: {
        name: "Databricks Auth",
        description: "Databricks authentication check",
    },

    paths: {
        "/databricks/test": {
            get: {
                tags: ["Databricks Auth"],
                summary: "Verify Databricks authentication",
                description:
                    "Calls the Databricks SCIM `Me` endpoint with the service principal token and returns the resolved identity.",
                responses: {
                    200: {
                        description: "Authentication succeeded",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/AuthTestResponse" },
                            },
                        },
                    },
                    default: {
                        description: "Authentication failed",
                        content: {
                            "application/json": {
                                schema: { $ref: "#/components/schemas/ErrorResponse" },
                            },
                        },
                    },
                },
            },
        },
    },

    schemas: {
        AuthTestResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                message: {
                    type: "string",
                    example: "Databricks authentication succeeded.",
                },
                identity: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        userName: { type: "string" },
                        active: { type: "boolean" },
                    },
                },
            },
        },
    },
};
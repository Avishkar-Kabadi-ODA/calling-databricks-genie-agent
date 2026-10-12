"use strict";

/**
 * Schemas and responses shared by more than one docs module.
 */
module.exports = {
    schemas: {
        ErrorResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: false },
                mode: { type: "string", example: "chat" },
                error: { type: "string", example: "Unable to complete the Genie request." },
                details: {
                    type: "string",
                    example: "Timed out while waiting for the Genie response.",
                },
            },
        },
    },

    responses: {
        BadRequest: {
            description: "Invalid request input",
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                    example: {
                        success: false,
                        error: "The question field is required.",
                    },
                },
            },
        },
    },
};
"use strict";

module.exports = {
    tag: { name: "Health", description: "Server status" },

    paths: {
        "/": {
            get: {
                tags: ["Health"],
                summary: "Server health check",
                responses: {
                    200: {
                        description: "Server is running",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        message: { type: "string", example: "Server is running" },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};
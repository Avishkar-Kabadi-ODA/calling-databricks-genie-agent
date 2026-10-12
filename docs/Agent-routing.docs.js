"use strict";

const BASE = "/api/agent";

const jsonContent = (schemaName) => ({
    "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
    },
});

const errorResponses = {
    400: { $ref: "#/components/responses/AgentBadRequest" },
    500: { $ref: "#/components/responses/AgentError" },
    502: { $ref: "#/components/responses/AgentError" },
    504: { $ref: "#/components/responses/AgentError" },
};

module.exports = {
    tag: {
        name: "Agent Routing",
        description:
            "Route questions to Genie Chat mode or Agent mode, or force a specific mode",
    },

    paths: {
        [`${BASE}/route`]: {
            post: {
                tags: ["Agent Routing"],
                summary: "Automatically route a question",
                description:
                    "Selects Chat mode or Agent mode (when `mode` is `auto`), runs the request and returns the result.",
                requestBody: {
                    required: true,
                    content: jsonContent("RouteRequest"),
                },
                responses: {
                    200: {
                        description: "Routed request result",
                        content: jsonContent("RouteResponse"),
                    },
                    ...errorResponses,
                },
            },
        },

        [`${BASE}/chat`]: {
            post: {
                tags: ["Agent Routing"],
                summary: "Force Genie Chat mode",
                requestBody: {
                    required: true,
                    content: jsonContent("AgentRequest"),
                },
                responses: {
                    200: {
                        description: "Chat mode result",
                        content: jsonContent("ForcedModeResponseChat"),
                    },
                    ...errorResponses,
                },
            },
        },

        [`${BASE}/reason`]: {
            post: {
                tags: ["Agent Routing"],
                summary: "Force Genie Agent mode",
                requestBody: {
                    required: true,
                    content: jsonContent("AgentRequest"),
                },
                responses: {
                    200: {
                        description: "Agent mode result",
                        content: jsonContent("ForcedModeResponseAgent"),
                    },
                    ...errorResponses,
                },
            },
        },

        [`${BASE}/classify`]: {
            post: {
                tags: ["Agent Routing"],
                summary: "Preview the routing decision",
                description:
                    "Returns which mode would be selected for the question and why. Nothing is sent to Databricks.",
                requestBody: {
                    required: true,
                    content: jsonContent("AgentRequest"),
                },
                responses: {
                    200: {
                        description: "Routing decision",
                        content: jsonContent("ClassifyResponse"),
                    },
                    400: { $ref: "#/components/responses/AgentBadRequest" },
                    500: { $ref: "#/components/responses/AgentError" },
                },
            },
        },
    },

    responses: {
        AgentBadRequest: {
            description: "Invalid request input",
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/AgentErrorResponse" },
                    example: {
                        success: false,
                        error: "Unable to route the Genie request.",
                        details: "The question field is required.",
                    },
                },
            },
        },
        AgentError: {
            description: "Routing or Databricks request failed",
            content: jsonContent("AgentErrorResponse"),
        },
    },

    schemas: {
        AgentErrorResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: false },
                error: { type: "string", example: "Unable to route the Genie request." },
                details: { type: "string", example: "The question field is required." },
            },
        },

        AgentRequest: {
            type: "object",
            required: ["question"],
            properties: {
                question: {
                    type: "string",
                    maxLength: 10000,
                    example: "Why did revenue decline and what drove it?",
                },
                conversationId: {
                    type: "string",
                    description: "Optional existing conversation to continue",
                },
                enableVisualization: { type: "boolean", default: false },
            },
        },

        RouteRequest: {
            allOf: [
                { $ref: "#/components/schemas/AgentRequest" },
                {
                    type: "object",
                    properties: {
                        mode: {
                            type: "string",
                            enum: ["auto", "chat", "agent"],
                            default: "auto",
                            description:
                                "`auto` lets the router decide; `chat` or `agent` request a specific mode.",
                        },
                    },
                },
            ],
        },

        RouteResponse: {
            type: "object",
            description:
                "`success` and `question` are set by the API. All other fields are spread from the routing service result.",
            additionalProperties: true,
            properties: {
                success: { type: "boolean", example: true },
                question: { type: "string" },
            },
        },

        ModeResult: {
            type: "object",
            description: "Result returned by the selected mode",
            additionalProperties: true,
        },

        ForcedModeResponseChat: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                requestedMode: { type: "string", example: "chat" },
                selectedMode: { type: "string", example: "chat" },
                question: { type: "string" },
                result: { $ref: "#/components/schemas/ModeResult" },
            },
        },

        ForcedModeResponseAgent: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                requestedMode: { type: "string", example: "agent" },
                selectedMode: { type: "string", example: "agent" },
                question: { type: "string" },
                result: { $ref: "#/components/schemas/ModeResult" },
            },
        },

        ClassifyResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                question: { type: "string" },
                selectedMode: { type: "string", example: "agent" },
                routingReason: { type: "string" },
                executed: { type: "boolean", example: false },
            },
        },
    },
};
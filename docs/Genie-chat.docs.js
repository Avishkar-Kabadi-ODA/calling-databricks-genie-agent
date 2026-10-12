const questionBody = {
    required: true,
    content: {
        "application/json": {
            schema: { $ref: "#/components/schemas/GenieQuestionRequest" },
        },
    },
};

const chatResponse = {
    description: "Genie response",
    content: {
        "application/json": {
            schema: { $ref: "#/components/schemas/GenieChatResponse" },
        },
    },
};

module.exports = {
    tag: {
        name: "Genie Chat",
        description: "Genie conversations and messages",
    },

    paths: {
        "/api/genie/chat": {
            post: {
                tags: ["Genie Chat"],
                summary: "Start a new Genie conversation",
                description:
                    "Starts a conversation, polls until Genie finishes, and returns the answer, generated SQL and query results.",
                requestBody: questionBody,
                responses: {
                    200: chatResponse,
                    400: { $ref: "#/components/responses/BadRequest" },
                    500: { $ref: "#/components/responses/GenieError" },
                    502: { $ref: "#/components/responses/GenieError" },
                    504: { $ref: "#/components/responses/GenieError" },
                },
            },
        },

        "/api/genie/chat/{conversationId}/messages": {
            parameters: [
                {
                    name: "conversationId",
                    in: "path",
                    required: true,
                    description: "Genie conversation ID",
                    schema: { type: "string" },
                },
            ],
            post: {
                tags: ["Genie Chat"],
                summary: "Send a follow-up message",
                description:
                    "Sends a follow-up question in an existing conversation and waits for the completed answer.",
                requestBody: questionBody,
                responses: {
                    200: chatResponse,
                    400: { $ref: "#/components/responses/BadRequest" },
                    500: { $ref: "#/components/responses/GenieError" },
                    502: { $ref: "#/components/responses/GenieError" },
                    504: { $ref: "#/components/responses/GenieError" },
                },
            },
            get: {
                tags: ["Genie Chat"],
                summary: "List messages in a conversation",
                responses: {
                    200: {
                        description: "Conversation messages (raw Databricks response)",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        success: { type: "boolean", example: true },
                                        mode: { type: "string", example: "chat" },
                                        conversationId: { type: "string" },
                                        data: {
                                            type: "object",
                                            additionalProperties: true,
                                            description: "Messages as returned by Databricks",
                                        },
                                    },
                                },
                            },
                        },
                    },
                    400: { $ref: "#/components/responses/BadRequest" },
                    500: { $ref: "#/components/responses/GenieError" },
                },
            },
        },
    },

    responses: {
        GenieError: {
            description: "Genie or Databricks request failed",
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
            },
        },
    },

    schemas: {
        GenieQuestionRequest: {
            type: "object",
            required: ["question"],
            properties: {
                question: { type: "string", example: "Summarize customer CUST0001" },
                enableVisualization: { type: "boolean", default: false },
            },
        },

        GenieAttachment: {
            type: "object",
            properties: {
                attachmentId: { type: "string", nullable: true },
                answer: { type: "string" },
                generatedSql: { type: "string" },
                queryResult: { type: "object", additionalProperties: true },
            },
        },

        GenieData: {
            type: "object",
            properties: {
                conversationId: { type: "string", nullable: true },
                messageId: { type: "string", nullable: true },
                status: { type: "string", example: "COMPLETED" },
                answers: { type: "array", items: { type: "string" } },
                generatedSql: { type: "array", items: { type: "string" } },
                queryResults: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                },
                attachments: {
                    type: "array",
                    items: { $ref: "#/components/schemas/GenieAttachment" },
                },
            },
        },

        GenieChatResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                mode: { type: "string", example: "chat" },
                question: { type: "string" },
                data: { $ref: "#/components/schemas/GenieData" },
            },
        },
    },
};
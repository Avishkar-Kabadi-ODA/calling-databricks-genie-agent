"use strict";

const {
    selectMode,
    executeChatMode,
    executeAgentMode,
    routeGenieRequest,
} = require("../services/agent-routing.service");

const MAX_QUESTION_LENGTH = 10000;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Send a consistent API error response.
 */
function sendError(response, error, defaultMessage) {
    console.error(defaultMessage, error.message);

    return response.status(error.status ?? 500).json({
        success: false,
        error: defaultMessage,
        details: error.message,
    });
}

/**
 * Create an Error that carries an HTTP status code.
 */
function createHttpError(message, status) {
    const error = new Error(message);
    error.status = status;

    return error;
}

/**
 * Trim a value if it is a string; otherwise return undefined.
 */
function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Validate the common request body.
 */
function validateRequest(request) {
    const question = toTrimmedString(request.body?.question);

    if (!question) {
        throw createHttpError("The question field is required.", 400);
    }

    if (question.length > MAX_QUESTION_LENGTH) {
        throw createHttpError(
            "The question must not exceed 10,000 characters.",
            400,
        );
    }

    return {
        question,
        conversationId: toTrimmedString(request.body?.conversationId) || undefined,
        enableVisualization: request.body?.enableVisualization === true,
    };
}

/* -------------------------------------------------------------------------- */
/* Controllers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * POST /route
 *
 * Automatically select Chat mode or Agent mode.
 *
 * Body:
 * {
 *   "question": "Why did revenue decline and what drove it?",
 *   "mode": "auto",
 *   "conversationId": "optional",
 *   "enableVisualization": false
 * }
 */
async function routeRequest(request, response) {
    try {
        const input = validateRequest(request);

        const requestedMode = request.body?.mode ?? "auto";

        const result = await routeGenieRequest({
            ...input,
            requestedMode,
        });

        return response.status(200).json({
            success: true,
            question: input.question,
            ...result,
        });
    } catch (error) {
        return sendError(response, error, "Unable to route the Genie request.");
    }
}

/**
 * POST /chat
 *
 * Force Genie Chat mode.
 */
async function runChatMode(request, response) {
    try {
        const input = validateRequest(request);

        const result = await executeChatMode(input);

        return response.status(200).json({
            success: true,
            requestedMode: "chat",
            selectedMode: "chat",
            question: input.question,
            result,
        });
    } catch (error) {
        return sendError(
            response,
            error,
            "Unable to complete the Chat mode request.",
        );
    }
}

/**
 * POST /reason
 *
 * Force Genie Agent mode.
 */
async function runAgentMode(request, response) {
    try {
        const input = validateRequest(request);

        const result = await executeAgentMode(input);

        

        return response.status(200).json({
            success: true,
            requestedMode: "agent",
            selectedMode: "agent",
            question: input.question,
            result,
        });
    } catch (error) {
        return sendError(
            response,
            error,
            "Unable to complete the Agent mode request.",
        );
    }
}

/**
 * POST /classify
 *
 * Preview the routing decision without calling Databricks.
 */
function classifyRequest(request, response) {
    try {
        const { question } = validateRequest(request);

        const decision = selectMode(question);

        return response.status(200).json({
            success: true,
            question,
            selectedMode: decision.mode,
            routingReason: decision.reason,
            executed: false,
        });
    } catch (error) {
        return sendError(response, error, "Unable to classify the request.");
    }
}

module.exports = {
    routeRequest,
    runChatMode,
    runAgentMode,
    classifyRequest,
};
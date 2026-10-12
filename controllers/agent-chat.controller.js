"use strict";

const {
    databricksJson,
    getDatabricksConfiguration,
} = require("../services/databricks-auth.service");

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

const SUCCESS_STATES = new Set(["COMPLETED", "SUCCEEDED"]);
const FAILURE_STATES = new Set(["FAILED", "CANCELED", "CANCELLED", "ERROR"]);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pause execution between Genie status checks.
 */
function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Create an Error that carries an HTTP status code.
 */
function createHttpError(message, status, databricksResponse) {
    const error = new Error(message);
    error.status = status;

    if (databricksResponse !== undefined) {
        error.databricksResponse = databricksResponse;
    }

    return error;
}

/**
 * Validate that the Genie Space ID is configured and return it.
 */
function getGenieSpaceId() {
    const { genieSpaceId } = getDatabricksConfiguration();
    const spaceId = genieSpaceId?.trim();

    if (!spaceId) {
        throw createHttpError("DATABRICKS_GENIE_SPACE_ID is not configured.", 500);
    }

    return spaceId;
}

/**
 * Normalize a Genie message status.
 */
function getMessageStatus(message) {
    const status = message?.status ?? message?.state ?? "UNKNOWN";

    return String(status).toUpperCase();
}

/**
 * Build the error for a Genie message that ended in a failure state.
 */
function createFailureError(message, status) {
    return createHttpError(
        message?.error?.message ??
        message?.error_message ??
        `Genie request ended with status ${status}.`,
        502,
        message,
    );
}

/**
 * Build the Databricks API path for a Genie space, with optional
 * conversation and message segments.
 */
function genieSpacePath(spaceId, ...segments) {
    const base = `/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}`;

    return segments.length > 0 ? `${base}/${segments.join("/")}` : base;
}

/**
 * Extract text, SQL, IDs, and attachment metadata from a completed
 * Genie response.
 */
function formatGenieMessage(message) {
    const attachments = Array.isArray(message?.attachments)
        ? message.attachments
        : [];

    const answers = [];
    const generatedSql = [];
    const queryResults = [];
    const formattedAttachments = [];

    for (const attachment of attachments) {
        const formattedAttachment = {
            attachmentId: attachment.attachment_id ?? attachment.id ?? null,
        };

        const textContent =
            attachment?.text?.content ?? attachment?.text?.text ?? null;

        if (textContent) {
            answers.push(textContent);
            formattedAttachment.answer = textContent;
        }

        const sql = attachment?.query?.query ?? attachment?.query?.sql ?? null;

        if (sql) {
            generatedSql.push(sql);
            formattedAttachment.generatedSql = sql;
        }

        if (attachment?.query_result) {
            queryResults.push(attachment.query_result);
            formattedAttachment.queryResult = attachment.query_result;
        }

        formattedAttachments.push(formattedAttachment);
    }

    return {
        conversationId: message?.conversation_id ?? null,
        messageId: message?.id ?? message?.message_id ?? null,
        status: getMessageStatus(message),
        answers,
        generatedSql,
        queryResults,
        attachments: formattedAttachments,
    };
}

/**
 * Poll Databricks until a Genie message reaches a terminal state.
 */
async function waitForGenieMessage({ spaceId, conversationId, messageId }) {
    const startedAt = Date.now();

    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            throw createHttpError(
                "Timed out while waiting for the Genie response.",
                504,
            );
        }

        const message = await databricksJson(
            genieSpacePath(
                spaceId,
                "conversations",
                encodeURIComponent(conversationId),
                "messages",
                encodeURIComponent(messageId),
            ),
            { method: "GET" },
        );

        const status = getMessageStatus(message);

        if (SUCCESS_STATES.has(status)) {
            return message;
        }

        if (FAILURE_STATES.has(status)) {
            throw createFailureError(message, status);
        }

        await sleep(POLL_INTERVAL_MS);
    }
}

/**
 * Some Genie responses are already complete. Others provide IDs that
 * must be polled.
 */
async function resolveGenieMessage(initialResponse) {
    const status = getMessageStatus(initialResponse);

    if (SUCCESS_STATES.has(status)) {
        return initialResponse;
    }

    if (FAILURE_STATES.has(status)) {
        throw createFailureError(initialResponse, status);
    }

    const conversationId = initialResponse?.conversation_id;
    const messageId = initialResponse?.message_id ?? initialResponse?.id;

    if (!conversationId || !messageId) {
        throw createHttpError(
            "Genie did not return the conversation and message IDs required for polling.",
            502,
            initialResponse,
        );
    }

    return waitForGenieMessage({
        spaceId: getGenieSpaceId(),
        conversationId,
        messageId,
    });
}

/**
 * Send a consistent JSON error response.
 */
function sendError(response, logLabel, publicMessage, error) {
    console.error(`${logLabel}:`, error.message);

    return response.status(error.status ?? 500).json({
        success: false,
        mode: "chat",
        error: publicMessage,
        details: error.message,
    });
}

/**
 * Send a 400 response for invalid request input.
 */
function sendBadRequest(response, message) {
    return response.status(400).json({
        success: false,
        error: message,
    });
}

/* -------------------------------------------------------------------------- */
/* Controllers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * POST /
 *
 * Start a new independent Genie Chat mode conversation.
 *
 * Body: { "question": "...", "enableVisualization": false }
 */
async function startConversation(request, response) {
    try {
        const question = request.body?.question?.trim();
        const enableVisualization = request.body?.enableVisualization === true;

        if (!question) {
            return sendBadRequest(response, "The question field is required.");
        }

        const spaceId = getGenieSpaceId();

        const initialResponse = await databricksJson(
            genieSpacePath(spaceId, "start-conversation"),
            {
                method: "POST",
                body: JSON.stringify({
                    content: question,
                    enable_visualization: enableVisualization,
                }),
            },
        );

        const completedMessage = await resolveGenieMessage(initialResponse);

        return response.status(200).json({
            success: true,
            mode: "chat",
            question,
            data: formatGenieMessage(completedMessage),
        });
    } catch (error) {
        return sendError(
            response,
            "Failed to start Genie conversation",
            "Unable to complete the Genie request.",
            error,
        );
    }
}

/**
 * POST /:conversationId/messages
 *
 * Send a follow-up message in an existing conversation.
 *
 * Body: { "question": "...", "enableVisualization": false }
 */
async function sendFollowUp(request, response) {
    try {
        const conversationId = request.params.conversationId?.trim();
        const question = request.body?.question?.trim();
        const enableVisualization = request.body?.enableVisualization === true;

        if (!conversationId) {
            return sendBadRequest(response, "The conversation ID is required.");
        }

        if (!question) {
            return sendBadRequest(response, "The question field is required.");
        }

        const spaceId = getGenieSpaceId();

        const initialResponse = await databricksJson(
            genieSpacePath(
                spaceId,
                "conversations",
                encodeURIComponent(conversationId),
                "messages",
            ),
            {
                method: "POST",
                body: JSON.stringify({
                    content: question,
                    enable_visualization: enableVisualization,
                }),
            },
        );

        // Some send-message responses omit conversation_id because it is
        // already part of the URL.
        const normalizedInitialResponse = {
            ...initialResponse,
            conversation_id: initialResponse?.conversation_id ?? conversationId,
        };

        const completedMessage = await resolveGenieMessage(
            normalizedInitialResponse,
        );

        return response.status(200).json({
            success: true,
            mode: "chat",
            question,
            data: formatGenieMessage(completedMessage),
        });
    } catch (error) {
        return sendError(
            response,
            "Failed to send Genie follow-up",
            "Unable to complete the Genie follow-up request.",
            error,
        );
    }
}

/**
 * GET /:conversationId/messages
 *
 * List messages in an existing Genie conversation.
 */
async function listMessages(request, response) {
    try {
        const conversationId = request.params.conversationId?.trim();

        if (!conversationId) {
            return sendBadRequest(response, "The conversation ID is required.");
        }

        const spaceId = getGenieSpaceId();

        const result = await databricksJson(
            genieSpacePath(
                spaceId,
                "conversations",
                encodeURIComponent(conversationId),
                "messages",
            ),
            { method: "GET" },
        );

        return response.status(200).json({
            success: true,
            mode: "chat",
            conversationId,
            data: result,
        });
    } catch (error) {
        return sendError(
            response,
            "Failed to list Genie messages",
            "Unable to retrieve Genie conversation messages.",
            error,
        );
    }
}

module.exports = {
    startConversation,
    sendFollowUp,
    listMessages,
};
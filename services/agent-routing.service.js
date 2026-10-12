const {
    databricksFetch,
    databricksJson,
    getDatabricksConfiguration,
} = require("./databricks-auth.service");

const CHAT_POLL_INTERVAL_MS = 2000;
const CHAT_TIMEOUT_MS = 120000;

const CHAT_SUCCESS_STATES = new Set([
    "COMPLETED",
    "SUCCEEDED",
]);

const CHAT_FAILURE_STATES = new Set([
    "FAILED",
    "CANCELED",
    "CANCELLED",
    "ERROR",
]);

const VALID_MODES = new Set([
    "auto",
    "chat",
    "agent",
]);


/**
 * Pause execution between Chat mode status checks.
 */
function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}


/**
 * Obtain the configured Genie Agent identifier.
 *
 * Chat mode calls this a space ID.
 * Agent mode calls this an agent ID.
 * The same configured Genie resource ID is used.
 */
function getGenieAgentId() {
    const configuration =
        getDatabricksConfiguration();

    const agentId =
        configuration.genieSpaceId?.trim();

    if (!agentId) {
        const error = new Error(
            "DATABRICKS_GENIE_SPACE_ID is not configured.",
        );

        error.status = 500;
        throw error;
    }

    return agentId;
}


/**
 * Normalize requested mode.
 */
function normalizeMode(mode) {
    const normalizedMode = String(
        mode || "auto",
    )
        .trim()
        .toLowerCase();

    if (!VALID_MODES.has(normalizedMode)) {
        const error = new Error(
            'mode must be "auto", "chat", or "agent".',
        );

        error.status = 400;
        throw error;
    }

    return normalizedMode;
}


/**
 * Route questions based on complexity.
 *
 * Chat mode:
 * - Direct lookups
 * - One trusted function
 * - Simple comparisons
 * - Specific customer or product questions
 *
 * Agent mode:
 * - Multi-step investigations
 * - Several comparisons or time periods
 * - Root-cause or driver analysis
 * - Executive reports
 * - Requests requiring multiple SQL queries
 */
function selectMode(question) {
    const normalizedQuestion =
        question.toLowerCase();

    const agentModePatterns = [
        /\broot cause\b/,
        /\bwhy did\b/,
        /\bdrivers?\b/,
        /\binvestigate\b/,
        /\bdeep analysis\b/,
        /\bcomprehensive\b/,
        /\bexecutive report\b/,
        /\bmanagement report\b/,
        /\bmultiple periods?\b/,
        /\bacross periods?\b/,
        /\byear over year\b/,
        /\bmonth over month\b/,
        /\btrend and explain\b/,
        /\bcompare.*and.*explain\b/,
        /\brecommendations?\b/,
        /\baction plan\b/,
        /\bsummarize.*insights?\b/,
    ];

    const matchedPattern =
        agentModePatterns.find((pattern) =>
            pattern.test(normalizedQuestion),
        );

    if (matchedPattern) {
        return {
            mode: "agent",
            reason:
                "The request appears to require multi-step analysis or a synthesized report.",
        };
    }

    const conjunctionCount = (
        normalizedQuestion.match(
            /\b(and|then|also|followed by)\b/g,
        ) || []
    ).length;

    if (
        normalizedQuestion.length > 350 ||
        conjunctionCount >= 3
    ) {
        return {
            mode: "agent",
            reason:
                "The request contains multiple analytical tasks.",
        };
    }

    return {
        mode: "chat",
        reason:
            "The request appears suitable for a direct grounded Genie answer.",
    };
}


/**
 * Extract useful content from a Chat mode message.
 */
function formatChatMessage(message) {
    const attachments =
        Array.isArray(message?.attachments)
            ? message.attachments
            : [];

    const answers = [];
    const generatedSql = [];
    const queryResults = [];

    for (const attachment of attachments) {
        const answer =
            attachment?.text?.content ??
            attachment?.text?.text;

        if (answer) {
            answers.push(answer);
        }

        const sql =
            attachment?.query?.query ??
            attachment?.query?.sql;

        if (sql) {
            generatedSql.push(sql);
        }

        if (attachment?.query_result) {
            queryResults.push(
                attachment.query_result,
            );
        }
    }

    return {
        conversationId:
            message?.conversation_id ?? null,

        messageId:
            message?.id ??
            message?.message_id ??
            null,

        status: String(
            message?.status ?? "UNKNOWN",
        ).toUpperCase(),

        answers,
        generatedSql,
        queryResults,
        attachments,
    };
}


/**
 * Poll a Chat mode response to completion.
 */
async function waitForChatMessage({
    agentId,
    conversationId,
    messageId,
}) {
    const startedAt = Date.now();

    while (true) {
        if (
            Date.now() - startedAt >
            CHAT_TIMEOUT_MS
        ) {
            const error = new Error(
                "Timed out while waiting for the Genie Chat mode response.",
            );

            error.status = 504;
            throw error;
        }

        const message = await databricksJson(
            `/api/2.0/genie/spaces/${encodeURIComponent(
                agentId,
            )}/conversations/${encodeURIComponent(
                conversationId,
            )}/messages/${encodeURIComponent(
                messageId,
            )}`,
            {
                method: "GET",
            },
        );

        const status = String(
            message?.status ?? "UNKNOWN",
        ).toUpperCase();

        if (CHAT_SUCCESS_STATES.has(status)) {
            return message;
        }

        if (CHAT_FAILURE_STATES.has(status)) {
            const error = new Error(
                message?.error?.message ??
                message?.error_message ??
                `Genie Chat mode failed with status ${status}.`,
            );

            error.status = 502;
            error.databricksResponse = message;

            throw error;
        }

        await sleep(CHAT_POLL_INTERVAL_MS);
    }
}


/**
 * Execute a request using Genie Chat mode.
 */
async function executeChatMode({
    question,
    conversationId,
    enableVisualization = false,
}) {
    const agentId = getGenieAgentId();

    let initialResponse;

    if (conversationId) {
        initialResponse =
            await databricksJson(
                `/api/2.0/genie/spaces/${encodeURIComponent(
                    agentId,
                )}/conversations/${encodeURIComponent(
                    conversationId,
                )}/messages`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        content: question,
                        enable_visualization:
                            enableVisualization,
                    }),
                },
            );

        initialResponse = {
            ...initialResponse,
            conversation_id:
                initialResponse
                    ?.conversation_id ??
                conversationId,
        };
    } else {
        initialResponse =
            await databricksJson(
                `/api/2.0/genie/spaces/${encodeURIComponent(
                    agentId,
                )}/start-conversation`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        content: question,
                        enable_visualization:
                            enableVisualization,
                    }),
                },
            );
    }

    const status = String(
        initialResponse?.status ?? "UNKNOWN",
    ).toUpperCase();

    let completedMessage;

    if (CHAT_SUCCESS_STATES.has(status)) {
        completedMessage = initialResponse;
    } else {
        const resolvedConversationId =
            initialResponse?.conversation_id;

        const messageId =
            initialResponse?.message_id ??
            initialResponse?.id;

        if (
            !resolvedConversationId ||
            !messageId
        ) {
            const error = new Error(
                "Genie Chat mode did not return the IDs required for polling.",
            );

            error.status = 502;
            error.databricksResponse =
                initialResponse;

            throw error;
        }

        completedMessage =
            await waitForChatMessage({
                agentId,
                conversationId:
                    resolvedConversationId,
                messageId,
            });
    }

    return {
        mode: "chat",
        ...formatChatMessage(
            completedMessage,
        ),
    };
}


/**
 * Parse a single Server-Sent Events data block.
 */
function parseSseDataBlock(dataLines) {
    const rawData = dataLines
        .map((line) =>
            line.replace(/^data:\s?/, ""),
        )
        .join("\n")
        .trim();

    if (
        !rawData ||
        rawData === "[DONE]"
    ) {
        return null;
    }

    try {
        return JSON.parse(rawData);
    } catch {
        return {
            type: "unparsed",
            rawData,
        };
    }
}


/**
 * Parse the complete Agent mode SSE stream.
 */
function parseAgentModeStream(streamText) {
    const blocks = streamText
        .split(/\r?\n\r?\n/)
        .filter(Boolean);

    const events = [];
    let completedResponse = null;
    let failedResponse = null;

    for (const block of blocks) {
        const lines = block.split(/\r?\n/);

        const eventLine = lines.find(
            (line) =>
                line.startsWith("event:"),
        );

        const eventName = eventLine
            ? eventLine
                .replace(/^event:\s?/, "")
                .trim()
            : null;

        const dataLines = lines.filter(
            (line) =>
                line.startsWith("data:"),
        );

        const data =
            parseSseDataBlock(dataLines);

        if (!data) {
            continue;
        }

        const event = {
            event: eventName ?? data.type,
            data,
        };

        events.push(event);

        if (
            event.event ===
            "response.completed"
        ) {
            completedResponse =
                data.response ?? data;
        }

        if (
            event.event ===
            "response.failed"
        ) {
            failedResponse =
                data.response ?? data;
        }
    }

    return {
        events,
        completedResponse,
        failedResponse,
    };
}


/**
 * Extract reports, SQL calls, reasoning summaries, and tables
 * from the final Agent mode response.
 */
function formatAgentModeResponse(
    response,
    events,
) {
    const output = Array.isArray(
        response?.output,
    )
        ? response.output
        : [];

    const reports = [];
    const reasoning = [];
    const sqlCalls = [];
    const functionOutputs = [];
    const otherItems = [];

    for (const item of output) {
        if (item?.type === "reasoning") {
            const reasoningText = (
                item.content ?? []
            )
                .map((content) =>
                    content?.text ??
                    content?.reasoning_text ??
                    "",
                )
                .filter(Boolean)
                .join("\n");

            if (reasoningText) {
                reasoning.push(reasoningText);
            }

            continue;
        }

        if (
            item?.type === "function_call"
        ) {
            let argumentsValue =
                item.arguments;

            if (
                typeof argumentsValue ===
                "string"
            ) {
                try {
                    argumentsValue =
                        JSON.parse(argumentsValue);
                } catch {
                    // Preserve the original value.
                }
            }

            sqlCalls.push({
                callId:
                    item.call_id ?? item.id,
                name: item.name,
                arguments: argumentsValue,
                status: item.status,
            });

            continue;
        }

        if (
            item?.type ===
            "function_call_output"
        ) {
            functionOutputs.push({
                id: item.id,
                callId: item.call_id,
                output: item.output,
                status: item.status,
            });

            continue;
        }

        if (item?.type === "message") {
            const text = (
                item.content ?? []
            )
                .map((content) =>
                    content?.text ??
                    content?.output_text ??
                    "",
                )
                .filter(Boolean)
                .join("\n");

            if (text) {
                reports.push(text);
            }

            continue;
        }

        otherItems.push(item);
    }

    return {
        mode: "agent",
        conversationId:
            response?.conversation_id ??
            null,
        responseId:
            response?.id ?? null,
        status:
            response?.status ??
            "completed",
        reports,
        reasoning,
        sqlCalls,
        functionOutputs,
        output,
        eventCount: events.length,
        otherItems,
    };
}


/**
 * Execute a question using Databricks Genie Agent mode.
 *
 * Agent mode is returned as SSE by Databricks. The backend
 * consumes the stream and returns one normalized JSON response.
 */
async function executeAgentMode({
    question,
    conversationId,
    enableVisualization = false,
}) {
    const agentId = getGenieAgentId();

    const body = {
        input: [
            {
                type: "message",
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: question,
                    },
                ],
            },
        ],
        enable_viz: enableVisualization,
    };

    if (conversationId) {
        body.conversation_id =
            conversationId;
    }

    const response =
        await databricksFetch(
            `/api/2.0/genie/agents/${encodeURIComponent(
                agentId,
            )}/responses`,
            {
                method: "POST",
                headers: {
                    Accept: "text/event-stream",
                },
                body: JSON.stringify(body),
                signal:
                    AbortSignal.timeout(
                        30 * 60 * 1000,
                    ),
            },
        );

    const streamText =
        await response.text();

    if (!response.ok) {
        const error = new Error(
            `Databricks Agent mode failed with HTTP ${response.status}: ${streamText}`,
        );

        error.status = response.status;
        throw error;
    }

    const {
        events,
        completedResponse,
        failedResponse,
    } = parseAgentModeStream(
        streamText,
    );

    if (failedResponse) {
        const error = new Error(
            failedResponse?.error?.message ??
            "Databricks Agent mode failed.",
        );

        error.status = 502;
        error.databricksResponse =
            failedResponse;

        throw error;
    }

    if (!completedResponse) {
        const error = new Error(
            "Agent mode stream ended without a response.completed event.",
        );

        error.status = 502;
        error.eventCount = events.length;

        throw error;
    }

    return formatAgentModeResponse(
        completedResponse,
        events,
    );
}


/**
 * Select and execute Chat mode or Agent mode.
 */
async function routeGenieRequest({
    question,
    requestedMode = "auto",
    conversationId,
    enableVisualization = false,
}) {
    const normalizedMode =
        normalizeMode(requestedMode);

    const routingDecision =
        normalizedMode === "auto"
            ? selectMode(question)
            : {
                mode: normalizedMode,
                reason:
                    "The caller explicitly selected the mode.",
            };

    let result;

    if (
        routingDecision.mode === "agent"
    ) {
        result =
            await executeAgentMode({
                question,
                conversationId,
                enableVisualization,
            });
    } else {
        result =
            await executeChatMode({
                question,
                conversationId,
                enableVisualization,
            });
    }

    return {
        requestedMode: normalizedMode,
        selectedMode:
            routingDecision.mode,
        routingReason:
            routingDecision.reason,
        result,
    };
}


module.exports = {
    normalizeMode,
    selectMode,
    executeChatMode,
    executeAgentMode,
    routeGenieRequest,
};
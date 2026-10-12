"use strict";

const REQUIRED_ENVIRONMENT_VARIABLES = [
    "DATABRICKS_HOST",
    "DATABRICKS_CLIENT_ID",
    "DATABRICKS_CLIENT_SECRET",
];


const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let cachedToken = null;
let tokenExpiresAt = 0;
let pendingTokenRequest = null;

function validateConfiguration() {
    const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
        (variableName) => !process.env[variableName]?.trim(),
    );

    if (missingVariables.length > 0) {
        throw new Error(
            `Missing required Databricks configuration: ${missingVariables.join(", ")}`,
        );
    }

    if (!process.env.DATABRICKS_HOST.startsWith("https://")) {
        throw new Error(
            "DATABRICKS_HOST must be a Databricks workspace URL beginning with https://",
        );
    }
}

function getWorkspaceHost() {
    validateConfiguration();

    return process.env.DATABRICKS_HOST.replace(/\/+$/, "");
}

function isCachedTokenValid() {
    return (
        typeof cachedToken === "string" &&
        cachedToken.length > 0 &&
        Date.now() < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS
    );
}

async function requestAccessToken() {
    const host = getWorkspaceHost();
    const clientId = process.env.DATABRICKS_CLIENT_ID;
    const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

    const basicCredentials = Buffer.from(
        `${clientId}:${clientSecret}`,
        "utf8",
    ).toString("base64");

    const requestBody = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "all-apis",
    });

    const response = await fetch(`${host}/oidc/v1/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${basicCredentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: requestBody.toString(),
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const responseText = await response.text();

        throw new Error(
            `Databricks OAuth failed with HTTP ${response.status}: ${responseText}`,
        );
    }

    const tokenResponse = await response.json();

    if (!tokenResponse.access_token) {
        throw new Error(
            "Databricks OAuth response did not contain an access token.",
        );
    }

    const expiresInSeconds = Number(tokenResponse.expires_in ?? 3600);

    cachedToken = tokenResponse.access_token;
    tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

    return cachedToken;
}

async function getAccessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && isCachedTokenValid()) {
        return cachedToken;
    }

    // Prevent multiple simultaneous requests from independently
    // requesting an OAuth token.
    if (!pendingTokenRequest) {
        pendingTokenRequest = requestAccessToken().finally(() => {
            pendingTokenRequest = null;
        });
    }

    return pendingTokenRequest;
}

function clearAccessTokenCache() {
    cachedToken = null;
    tokenExpiresAt = 0;
    pendingTokenRequest = null;
}

async function getAuthorizationHeader() {
    const accessToken = await getAccessToken();

    return {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
}

async function databricksFetch(path, options = {}) {
    const host = getWorkspaceHost();

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    const executeRequest = async (forceRefresh = false) => {
        const accessToken = await getAccessToken({ forceRefresh });

        return fetch(`${host}${normalizedPath}`, {
            ...options,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...options.headers,
                Authorization: `Bearer ${accessToken}`,
            },
            signal: options.signal ?? AbortSignal.timeout(120_000),
        });
    };

    let response = await executeRequest();

    // Retry once with a newly acquired token if Databricks
    // rejects the cached token.
    if (response.status === 401) {
        clearAccessTokenCache();
        response = await executeRequest(true);
    }

    return response;
}

async function databricksJson(path, options = {}) {
    const response = await databricksFetch(path, options);

    const responseBodyText = await response.text();

    let responseBody = null;

    if (responseBodyText) {
        try {
            responseBody = JSON.parse(responseBodyText);
        } catch {
            responseBody = { rawResponse: responseBodyText };
        }
    }

    if (!response.ok) {
        const error = new Error(
            responseBody?.message ??
            responseBody?.error ??
            `Databricks request failed with HTTP ${response.status}`,
        );

        error.status = response.status;
        error.databricksResponse = responseBody;

        throw error;
    }

    return responseBody;
}

function getDatabricksConfiguration() {
    validateConfiguration();

    return {
        host: getWorkspaceHost(),
        warehouseId: process.env.DATABRICKS_WAREHOUSE_ID,
        genieSpaceId: process.env.DATABRICKS_GENIE_SPACE_ID,
    };
}

module.exports = {
    getAccessToken,
    clearAccessTokenCache,
    getAuthorizationHeader,
    databricksFetch,
    databricksJson,
    getDatabricksConfiguration,
};
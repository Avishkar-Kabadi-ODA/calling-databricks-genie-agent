"use strict";

const {
    databricksJson,
    getDatabricksConfiguration,
} = require("./databricks-auth.service");

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

const SUCCESS_STATES = new Set(["SUCCEEDED"]);

const FAILURE_STATES = new Set(["FAILED", "CANCELED", "CLOSED"]);


/**
 * Pause execution between statement status checks.
 */
function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}


/**
 * Read and validate the configured SQL warehouse ID.
 */
function getWarehouseId() {
    const configuration = getDatabricksConfiguration();

    const warehouseId = configuration.warehouseId?.trim();

    if (!warehouseId) {
        const error = new Error(
            "DATABRICKS_WAREHOUSE_ID is not configured.",
        );

        error.status = 500;
        throw error;
    }

    return warehouseId;
}


/**
 * Convert the Databricks statement status into a plain
 * uppercase string.
 */
function getStatementState(statementResponse) {
    const state = statementResponse?.status?.state ?? "UNKNOWN";

    return String(state).toUpperCase();
}


/**
 * Extract a useful Databricks SQL error message.
 */
function getStatementError(statementResponse) {
    const error = statementResponse?.status?.error;

    if (!error) {
        return "Databricks SQL execution failed.";
    }

    const message = error.message ?? "Databricks SQL execution failed.";

    const sqlState = error.sql_state ?? error.sqlState;

    if (sqlState) {
        return `SQLSTATE ${sqlState}: ${message}`;
    }

    return message;
}


/**
 * Poll a submitted Databricks SQL statement until it reaches
 * a terminal state.
 */
async function waitForStatement(statementId) {
    const startedAt = Date.now();

    while (true) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
            const error = new Error(
                "Timed out while waiting for the Databricks SQL statement.",
            );

            error.status = 504;
            throw error;
        }

        const statementResponse = await databricksJson(
            `/api/2.0/sql/statements/${encodeURIComponent(statementId)}`,
            {
                method: "GET",
            },
        );

        const state = getStatementState(statementResponse);

        if (SUCCESS_STATES.has(state)) {
            return statementResponse;
        }

        if (FAILURE_STATES.has(state)) {
            const error = new Error(getStatementError(statementResponse));

            error.status = 502;
            error.statementId = statementId;
            error.databricksResponse = statementResponse;

            throw error;
        }

        await sleep(POLL_INTERVAL_MS);
    }
}


/**
 * Convert the Databricks inline result into an array of
 * JavaScript objects.
 */
function parseInlineResult(statementResponse) {
    const columns = statementResponse?.manifest?.schema?.columns ?? [];

    const columnNames = columns.map((column) => column.name);

    const dataArray = statementResponse?.result?.data_array ?? [];

    return dataArray.map((row) => {
        return columnNames.reduce((record, columnName, index) => {
            record[columnName] = row[index] ?? null;

            return record;
        }, {});
    });
}


/**
 * Execute one parameterized SQL statement.
 */
async function executeSqlStatement({ statement, parameters = [] }) {
    const warehouseId = getWarehouseId();

    const initialResponse = await databricksJson(
        "/api/2.0/sql/statements",
        {
            method: "POST",
            body: JSON.stringify({
                warehouse_id: warehouseId,
                statement,
                parameters,
                wait_timeout: "0s",
                disposition: "INLINE",
                format: "JSON_ARRAY",
            }),
        },
    );

    const statementId = initialResponse?.statement_id;

    if (!statementId) {
        const error = new Error(
            "Databricks did not return a statement ID.",
        );

        error.status = 502;
        error.databricksResponse = initialResponse;

        throw error;
    }

    const initialState = getStatementState(initialResponse);

    let completedResponse;

    if (SUCCESS_STATES.has(initialState)) {
        completedResponse = initialResponse;
    } else if (FAILURE_STATES.has(initialState)) {
        const error = new Error(getStatementError(initialResponse));

        error.status = 502;
        error.statementId = statementId;
        error.databricksResponse = initialResponse;

        throw error;
    } else {
        completedResponse = await waitForStatement(statementId);
    }

    return {
        statementId,
        status: getStatementState(completedResponse),
        rows: parseInlineResult(completedResponse),
        rowCount:
            completedResponse?.manifest?.total_row_count ??
            completedResponse?.result?.data_array?.length ??
            0,
    };
}


/**
 * Call:
 * my_catalog.demo.customer_sales_summary
 */
async function getCustomerSalesSummary(customerId) {
    return executeSqlStatement({
        statement: `
      SELECT *
      FROM my_catalog.demo.customer_sales_summary(
        :customer_id
      )
    `,
        parameters: [
            {
                name: "customer_id",
                value: customerId,
                type: "STRING",
            },
        ],
    });
}


/**
 * Call:
 * my_catalog.demo.product_sales_summary
 */
async function getProductSalesSummary(productId) {
    return executeSqlStatement({
        statement: `
      SELECT *
      FROM my_catalog.demo.product_sales_summary(
        :product_id
      )
    `,
        parameters: [
            {
                name: "product_id",
                value: productId,
                type: "STRING",
            },
        ],
    });
}


/**
 * Call:
 * my_catalog.demo.category_sales_ranking
 */
async function getCategorySalesRanking({ startDate, endDate, limit }) {
    return executeSqlStatement({
        statement: `
      SELECT *
      FROM my_catalog.demo.category_sales_ranking(
        :start_date,
        :end_date,
        :result_limit
      )
    `,
        parameters: [
            {
                name: "start_date",
                value: startDate,
                type: "STRING",
            },
            {
                name: "end_date",
                value: endDate,
                type: "STRING",
            },
            {
                name: "result_limit",
                value: String(limit),
                type: "INT",
            },
        ],
    });
}


module.exports = {
    executeSqlStatement,
    getCustomerSalesSummary,
    getProductSalesSummary,
    getCategorySalesRanking,
};
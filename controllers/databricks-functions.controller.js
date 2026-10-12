"use strict";

const {
    getCustomerSalesSummary,
    getProductSalesSummary,
    getCategorySalesRanking,
} = require("../services/databricks-functions.service");

const CUSTOMER_ID_PATTERN = /^CUST\d{4}$/;
const PRODUCT_ID_PATTERN = /^PROD\d{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_RANKING_LIMIT = 5;
const MAX_RANKING_LIMIT = 100;

const FUNCTION_NAMES = {
    customer: "my_catalog.demo.customer_sales_summary",
    product: "my_catalog.demo.product_sales_summary",
    categoryRanking: "my_catalog.demo.category_sales_ranking",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Return a consistent API error response.
 */
function sendError(response, error, defaultMessage) {
    console.error(defaultMessage, error.message);

    return response.status(error.status ?? 500).json({
        success: false,
        error: defaultMessage,
        details: error.message,
        statementId: error.statementId ?? null,
    });
}

/**
 * Return a 400 response for invalid input.
 */
function sendBadRequest(response, message) {
    return response.status(400).json({
        success: false,
        error: message,
    });
}

/**
 * Trim a value if it is a string; otherwise return undefined.
 */
function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Build the metadata block returned with every successful result.
 */
function buildMetadata(result) {
    return {
        statementId: result.statementId,
        status: result.status,
        rowCount: result.rowCount,
    };
}

/**
 * Validate a YYYY-MM-DD date string.
 */
function isValidDateString(value) {
    if (!DATE_PATTERN.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    return date.toISOString().slice(0, 10) === value;
}

/* -------------------------------------------------------------------------- */
/* Controllers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * GET /customer/:customerId
 *
 * Example: GET /api/databricks/functions/customer/CUST0001
 */
async function getCustomerSummary(request, response) {
    try {
        const customerId = toTrimmedString(request.params.customerId)?.toUpperCase();

        if (!customerId || !CUSTOMER_ID_PATTERN.test(customerId)) {
            return sendBadRequest(
                response,
                "customerId must follow the format CUST0001.",
            );
        }

        const result = await getCustomerSalesSummary(customerId);

        if (result.rows.length === 0) {
            return response.status(404).json({
                success: false,
                function: FUNCTION_NAMES.customer,
                customerId,
                error: "No matching synthetic customer was found.",
                data: [],
            });
        }

        return response.status(200).json({
            success: true,
            function: FUNCTION_NAMES.customer,
            customerId,
            syntheticData: true,
            data: result.rows,
            metadata: buildMetadata(result),
        });
    } catch (error) {
        return sendError(
            response,
            error,
            "Unable to retrieve the customer sales summary.",
        );
    }
}

/**
 * GET /product/:productId
 *
 * Example: GET /api/databricks/functions/product/PROD001
 */
async function getProductSummary(request, response) {
    try {
        const productId = toTrimmedString(request.params.productId)?.toUpperCase();

        if (!productId || !PRODUCT_ID_PATTERN.test(productId)) {
            return sendBadRequest(
                response,
                "productId must follow the format PROD001.",
            );
        }

        const result = await getProductSalesSummary(productId);

        if (result.rows.length === 0) {
            return response.status(404).json({
                success: false,
                function: FUNCTION_NAMES.product,
                productId,
                error: "No matching synthetic product was found.",
                data: [],
            });
        }

        return response.status(200).json({
            success: true,
            function: FUNCTION_NAMES.product,
            productId,
            syntheticData: true,
            data: result.rows,
            metadata: buildMetadata(result),
        });
    } catch (error) {
        return sendError(
            response,
            error,
            "Unable to retrieve the product sales summary.",
        );
    }
}

/**
 * POST /category-ranking
 *
 * Body: { "startDate": "2024-10-11", "endDate": "2026-10-11", "limit": 5 }
 */
async function getCategoryRanking(request, response) {
    try {
        const startDate = toTrimmedString(request.body?.startDate);
        const endDate = toTrimmedString(request.body?.endDate);

        const limit =
            request.body?.limit === undefined
                ? DEFAULT_RANKING_LIMIT
                : Number(request.body.limit);

        if (!startDate || !isValidDateString(startDate)) {
            return sendBadRequest(
                response,
                "startDate must be a valid date in YYYY-MM-DD format.",
            );
        }

        if (!endDate || !isValidDateString(endDate)) {
            return sendBadRequest(
                response,
                "endDate must be a valid date in YYYY-MM-DD format.",
            );
        }

        if (startDate > endDate) {
            return sendBadRequest(response, "startDate must not be after endDate.");
        }

        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RANKING_LIMIT) {
            return sendBadRequest(
                response,
                `limit must be an integer between 1 and ${MAX_RANKING_LIMIT}.`,
            );
        }

        const result = await getCategorySalesRanking({
            startDate,
            endDate,
            limit,
        });

        return response.status(200).json({
            success: true,
            function: FUNCTION_NAMES.categoryRanking,
            parameters: { startDate, endDate, limit },
            syntheticData: true,
            data: result.rows,
            metadata: buildMetadata(result),
        });
    } catch (error) {
        return sendError(
            response,
            error,
            "Unable to retrieve the category sales ranking.",
        );
    }
}

module.exports = {
    getCustomerSummary,
    getProductSummary,
    getCategoryRanking,
};
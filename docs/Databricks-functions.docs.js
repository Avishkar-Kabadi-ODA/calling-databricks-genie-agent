"use strict";

const BASE = "/api/databricks/functions";

const jsonContent = (schemaName) => ({
    "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
    },
});

module.exports = {
    tag: {
        name: "Databricks Functions",
        description:
            "Sales summaries and rankings returned by Unity Catalog SQL functions (synthetic demo data)",
    },

    paths: {
        [`${BASE}/customer/{customerId}`]: {
            get: {
                tags: ["Databricks Functions"],
                summary: "Get a customer sales summary",
                description:
                    "Calls `my_catalog.demo.customer_sales_summary` for one customer. The ID is trimmed and upper-cased, so `cust0001` is accepted.",
                parameters: [
                    {
                        name: "customerId",
                        in: "path",
                        required: true,
                        description: "Customer ID in the format CUST0001",
                        schema: { type: "string", example: "CUST0001" },
                    },
                ],
                responses: {
                    200: {
                        description: "Customer sales summary",
                        content: jsonContent("CustomerSalesSummaryResponse"),
                    },
                    400: { $ref: "#/components/responses/FunctionsBadRequest" },
                    404: {
                        description: "No matching customer",
                        content: jsonContent("FunctionsNotFoundResponse"),
                    },
                    500: { $ref: "#/components/responses/FunctionsError" },
                    502: { $ref: "#/components/responses/FunctionsError" },
                    504: { $ref: "#/components/responses/FunctionsError" },
                },
            },
        },

        [`${BASE}/product/{productId}`]: {
            get: {
                tags: ["Databricks Functions"],
                summary: "Get a product sales summary",
                description:
                    "Calls `my_catalog.demo.product_sales_summary` for one product. The ID is trimmed and upper-cased, so `prod001` is accepted.",
                parameters: [
                    {
                        name: "productId",
                        in: "path",
                        required: true,
                        description: "Product ID in the format PROD001",
                        schema: { type: "string", example: "PROD001" },
                    },
                ],
                responses: {
                    200: {
                        description: "Product sales summary",
                        content: jsonContent("ProductSalesSummaryResponse"),
                    },
                    400: { $ref: "#/components/responses/FunctionsBadRequest" },
                    404: {
                        description: "No matching product",
                        content: jsonContent("FunctionsNotFoundResponse"),
                    },
                    500: { $ref: "#/components/responses/FunctionsError" },
                    502: { $ref: "#/components/responses/FunctionsError" },
                    504: { $ref: "#/components/responses/FunctionsError" },
                },
            },
        },

        [`${BASE}/category-ranking`]: {
            post: {
                tags: ["Databricks Functions"],
                summary: "Get the category sales ranking for a date range",
                description:
                    "Calls `my_catalog.demo.category_sales_ranking`. `startDate` must not be after `endDate`.",
                requestBody: {
                    required: true,
                    content: jsonContent("CategoryRankingRequest"),
                },
                responses: {
                    200: {
                        description: "Category sales ranking",
                        content: jsonContent("CategoryRankingResponse"),
                    },
                    400: { $ref: "#/components/responses/FunctionsBadRequest" },
                    500: { $ref: "#/components/responses/FunctionsError" },
                    502: { $ref: "#/components/responses/FunctionsError" },
                    504: { $ref: "#/components/responses/FunctionsError" },
                },
            },
        },
    },

    responses: {
        FunctionsBadRequest: {
            description: "Invalid request input",
            content: {
                "application/json": {
                    schema: { $ref: "#/components/schemas/FunctionsBadRequestResponse" },
                    example: {
                        success: false,
                        error: "customerId must follow the format CUST0001.",
                    },
                },
            },
        },
        FunctionsError: {
            description: "Databricks SQL execution failed or timed out",
            content: jsonContent("FunctionsErrorResponse"),
        },
    },

    schemas: {
        FunctionsBadRequestResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: false },
                error: { type: "string" },
            },
        },

        FunctionsErrorResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: false },
                error: {
                    type: "string",
                    example: "Unable to retrieve the customer sales summary.",
                },
                details: {
                    type: "string",
                    example: "Timed out while waiting for the Databricks SQL statement.",
                },
                statementId: { type: "string", nullable: true },
            },
        },

        FunctionsNotFoundResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: false },
                function: {
                    type: "string",
                    example: "my_catalog.demo.customer_sales_summary",
                },
                customerId: { type: "string", example: "CUST9999" },
                productId: { type: "string", example: "PROD999" },
                error: {
                    type: "string",
                    example: "No matching synthetic customer was found.",
                },
                data: { type: "array", items: {}, example: [] },
            },
        },

        FunctionRows: {
            type: "array",
            description:
                "Result rows as objects keyed by column name. Columns depend on the SQL function.",
            items: { type: "object", additionalProperties: true },
        },

        FunctionMetadata: {
            type: "object",
            properties: {
                statementId: { type: "string" },
                status: { type: "string", example: "SUCCEEDED" },
                rowCount: { type: "integer", example: 1 },
            },
        },

        CustomerSalesSummaryResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                function: {
                    type: "string",
                    example: "my_catalog.demo.customer_sales_summary",
                },
                customerId: { type: "string", example: "CUST0001" },
                syntheticData: { type: "boolean", example: true },
                data: { $ref: "#/components/schemas/FunctionRows" },
                metadata: { $ref: "#/components/schemas/FunctionMetadata" },
            },
        },

        ProductSalesSummaryResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                function: {
                    type: "string",
                    example: "my_catalog.demo.product_sales_summary",
                },
                productId: { type: "string", example: "PROD001" },
                syntheticData: { type: "boolean", example: true },
                data: { $ref: "#/components/schemas/FunctionRows" },
                metadata: { $ref: "#/components/schemas/FunctionMetadata" },
            },
        },

        CategoryRankingRequest: {
            type: "object",
            required: ["startDate", "endDate"],
            properties: {
                startDate: {
                    type: "string",
                    format: "date",
                    example: "2024-10-11",
                },
                endDate: {
                    type: "string",
                    format: "date",
                    example: "2026-10-11",
                },
                limit: {
                    type: "integer",
                    minimum: 1,
                    maximum: 100,
                    default: 5,
                },
            },
        },

        CategoryRankingResponse: {
            type: "object",
            properties: {
                success: { type: "boolean", example: true },
                function: {
                    type: "string",
                    example: "my_catalog.demo.category_sales_ranking",
                },
                parameters: {
                    type: "object",
                    properties: {
                        startDate: { type: "string", example: "2024-10-11" },
                        endDate: { type: "string", example: "2026-10-11" },
                        limit: { type: "integer", example: 5 },
                    },
                },
                syntheticData: { type: "boolean", example: true },
                data: { $ref: "#/components/schemas/FunctionRows" },
                metadata: { $ref: "#/components/schemas/FunctionMetadata" },
            },
        },
    },
};
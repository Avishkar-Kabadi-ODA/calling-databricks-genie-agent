"use strict";

const common = require("./Common.docs");
const health = require("./Health.docs");
const databricksAuth = require("./Databricks-auth.docs");
const genieChat = require("./Genie-chat.docs");
const databricksFunctions = require("./Databricks-functions.docs");
const agentRouting = require("./Agent-routing.docs");

/**
 * Register new docs modules here. Each module may export:
 *   tag, paths, schemas, responses
 */
const modules = [
  health,
  databricksAuth,
  genieChat,
  databricksFunctions,
  agentRouting,
];

function mergeSection(section) {
  return Object.assign(
    {},
    common[section],
    ...modules.map((docsModule) => docsModule[section]),
  );
}

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "Databricks Genie API",
    version: "1.0.0",
    description:
      "Express service that authenticates to Databricks with OAuth (client credentials) and exposes Genie Chat endpoints.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: modules.map((docsModule) => docsModule.tag),
  paths: mergeSection("paths"),
  components: {
    schemas: mergeSection("schemas"),
    responses: mergeSection("responses"),
  },
};
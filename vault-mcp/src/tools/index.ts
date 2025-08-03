/**
 * MCP Tools Registry
 * 모든 MCP 도구들을 등록하고 관리합니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "../logger.js";
import { VaultClient } from "../vault-client.js";
import { registerBasicTools } from "./basic-tools.js";
import { registerBulkTools } from "./bulk-tools.js";
import { registerDryRunTools } from "./dry-run-tools.js";
import { registerExplorationTools } from "./exploration-tools.js";
import { registerTransactionTools } from "./transaction-tools.js";

/**
 * 모든 도구를 서버에 등록합니다.
 */
export function registerAllTools(
  server: McpServer,
  vaultClient: VaultClient
): void {
  log.info("Registering MCP tools", "TOOLS");

  try {
    // 기본 CRUD 도구들
    registerBasicTools(server, vaultClient);
    log.debug("Basic tools registered", "TOOLS");

    // 트랜잭션 도구들
    registerTransactionTools(server, vaultClient);
    log.debug("Transaction tools registered", "TOOLS");

    // 탐색 및 YAML 도구들
    registerExplorationTools(server, vaultClient);
    log.debug("Exploration tools registered", "TOOLS");

    // 벌크 작업 도구들
    registerBulkTools(server, vaultClient);
    log.debug("Bulk operation tools registered", "TOOLS");

    // Dry Run 시뮬레이션 도구들
    registerDryRunTools(server, vaultClient);
    log.debug("Dry run simulation tools registered", "TOOLS");

    log.info("All MCP tools registered successfully", "TOOLS");
  } catch (error) {
    log.error("Failed to register MCP tools", "TOOLS", error);
    throw error;
  }
}

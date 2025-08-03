#!/usr/bin/env node

/**
 * Vault MCP Server
 * HashiCorp Vault integration for Model Context Protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { VaultConfigurationError } from "./errors.js";
import { log, LogLevel } from "./logger.js";
import { registerResources } from "./resources.js";
import { registerAllTools } from "./tools/index.js";
import { VaultClient } from "./vault-client.js";

// 환경 변수에 따른 로그 레벨 설정
const logLevel = process.env.LOG_LEVEL?.toUpperCase();
if (logLevel) {
  switch (logLevel) {
    case "ERROR":
      log.setLogLevel(LogLevel.ERROR);
      break;
    case "WARN":
      log.setLogLevel(LogLevel.WARN);
      break;
    case "INFO":
      log.setLogLevel(LogLevel.INFO);
      break;
    case "DEBUG":
      log.setLogLevel(LogLevel.DEBUG);
      break;
  }
}

/**
 * 서버 초기화 및 실행
 */
async function main(): Promise<void> {
  log.info("Starting Vault MCP Server", "MAIN");

  try {
    // 설정 로드 및 검증
    log.info("Loading configuration", "MAIN");
    const config = loadConfig();

    // Vault 클라이언트 초기화
    log.info("Initializing Vault client", "MAIN");
    const vaultClient = new VaultClient(config);

    // MCP 서버 생성
    log.info("Creating MCP server", "MAIN");
    const server = new McpServer({
      name: "vault-mcp-server",
      version: "1.0.0",
    });

    // 리소스 등록
    log.info("Registering resources", "MAIN");
    registerResources(server, vaultClient, config);

    // 도구 등록
    log.info("Registering tools", "MAIN");
    registerAllTools(server, vaultClient);

    // Vault 연결 테스트
    log.info("Testing Vault connection", "MAIN");
    try {
      await vaultClient.getHealth();
      log.info(`Connected to Vault successfully`, "MAIN", {
        endpoint: config.endpoint,
        permissions: config.permissions,
        allowedPathsCount: config.allowedPaths?.length || 0,
      });
    } catch (error: any) {
      log.warn(`Could not connect to Vault: ${error.message}`, "MAIN");
      // 연결 실패해도 서버는 시작 (나중에 연결될 수 있음)
    }

    // 서버 시작
    log.info("Starting MCP server transport", "MAIN");
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log.info("Vault MCP Server is running on stdio", "MAIN");
  } catch (error: any) {
    if (error instanceof VaultConfigurationError) {
      log.error(`Configuration error: ${error.message}`, "MAIN", error);
      console.error(`Configuration error: ${error.message}`);
      process.exit(1);
    } else {
      log.error(`Fatal error during startup: ${error.message}`, "MAIN", error);
      console.error(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

/**
 * 전역 에러 핸들러 설정
 */
function setupErrorHandlers(): void {
  process.on("uncaughtException", (error) => {
    log.error("Uncaught Exception", "PROCESS", error);
    console.error("Uncaught Exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    log.error("Unhandled Rejection", "PROCESS", reason, { promise });
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down gracefully", "PROCESS");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down gracefully", "PROCESS");
    process.exit(0);
  });
}

// 에러 핸들러 설정
setupErrorHandlers();

// 서버 시작
main().catch((error) => {
  log.error("Failed to start server", "MAIN", error);
  console.error("Failed to start server:", error);
  process.exit(1);
});

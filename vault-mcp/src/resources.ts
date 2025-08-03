/**
 * MCP Resources
 * MCP 리소스들을 등록하고 관리합니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "./logger.js";
import { VaultConfig } from "./types.js";
import { VaultClient } from "./vault-client.js";

export function registerResources(
  server: McpServer,
  vaultClient: VaultClient,
  config: VaultConfig
): void {
  log.info("Registering MCP resources", "RESOURCES");

  // Vault 상태 확인 리소스
  server.registerResource(
    "vault-health",
    "vault://health",
    {
      title: "Vault Health Status",
      description: "Current health status of the Vault server",
      mimeType: "application/json",
    },
    async () => {
      log.debug("Fetching Vault health status resource", "RESOURCES");

      try {
        const health = await vaultClient.getHealth();
        return {
          contents: [
            {
              uri: "vault://health",
              text: JSON.stringify(health, null, 2),
            },
          ],
        };
      } catch (error: any) {
        log.error("Failed to fetch Vault health status", "RESOURCES", error);
        return {
          contents: [
            {
              uri: "vault://health",
              text: JSON.stringify({ error: error.message }, null, 2),
            },
          ],
        };
      }
    }
  );

  // 서버 설정 정보 리소스
  server.registerResource(
    "vault-config",
    "vault://config",
    {
      title: "Vault Server Configuration",
      description: "Current configuration and permissions",
      mimeType: "application/json",
    },
    async () => {
      log.debug("Fetching Vault configuration resource", "RESOURCES");

      const configInfo = {
        endpoint: config.endpoint,
        permissions: config.permissions,
        allowedPaths: config.allowedPaths || ["All paths allowed"],
        allowedWorkingDirectory:
          config.allowedWorkingDirectory || "Current working directory",
      };

      return {
        contents: [
          {
            uri: "vault://config",
            text: JSON.stringify(configInfo, null, 2),
          },
        ],
      };
    }
  );

  log.info("MCP resources registered successfully", "RESOURCES");
}

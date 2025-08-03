/**
 * Exploration and YAML Tools
 * 탐색 및 YAML 가져오기/내보내기를 위한 MCP 도구들입니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToMCPResponse } from "../errors.js";
import { log } from "../logger.js";
import { formatTree } from "../utils.js";
import { VaultClient } from "../vault-client.js";

export function registerExplorationTools(
  server: McpServer,
  vaultClient: VaultClient
): void {
  // 재귀적 경로 탐색 도구
  server.registerTool(
    "explore-secrets",
    {
      title: "Explore Vault Secrets Tree",
      description:
        "Recursively explore Vault paths and return a tree structure of secrets and folders",
      inputSchema: {
        basePath: z
          .string()
          .describe(
            'Base path to start exploration from (e.g., "secret/metadata/")'
          ),
        maxDepth: z
          .number()
          .default(10)
          .describe("Maximum depth to explore (default: 10, max: 20)"),
      },
    },
    async ({
      basePath,
      maxDepth = 10,
    }: {
      basePath: string;
      maxDepth?: number;
    }) => {
      log.info(`Exploring secrets tree from: ${basePath}`, "EXPLORE", {
        maxDepth,
      });

      try {
        // 최대 깊이 제한
        const limitedDepth = Math.min(Math.max(maxDepth, 1), 20);

        const result = await vaultClient.exploreSecrets(basePath, limitedDepth);

        const treeText = formatTree(result.tree);
        const summaryText = `\n📊 Summary:
- Total secrets: ${result.totalSecrets}
- Total folders: ${result.totalFolders}
- Max depth reached: ${result.depth}
- Base path: ${basePath}`;

        log.info(`Exploration completed`, "EXPLORE", {
          totalSecrets: result.totalSecrets,
          totalFolders: result.totalFolders,
          depth: result.depth,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `🌳 Vault Secrets Tree:\n\n${treeText}${summaryText}`,
            },
          ],
        };
      } catch (error: any) {
        log.error(
          `Failed to explore secrets from: ${basePath}`,
          "EXPLORE",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // YAML 내보내기 도구
  server.registerTool(
    "export-secrets-yaml",
    {
      title: "Export Secrets to YAML",
      description:
        "Export secrets from a Vault path to a YAML file on the local filesystem",
      inputSchema: {
        basePath: z
          .string()
          .describe('Vault path to export from (e.g., "secret/data/app1/")'),
        outputPath: z
          .string()
          .describe(
            'Local file path to save YAML (e.g., "./secrets-export.yaml")'
          ),
        recursive: z
          .boolean()
          .default(true)
          .describe(
            "Whether to recursively export nested paths (default: true)"
          ),
      },
    },
    async ({
      basePath,
      outputPath,
      recursive = true,
    }: {
      basePath: string;
      outputPath: string;
      recursive?: boolean;
    }) => {
      log.info(`Exporting secrets to YAML`, "YAML_EXPORT", {
        basePath,
        outputPath,
        recursive,
      });

      try {
        const result = await vaultClient.exportSecretsToYaml(
          basePath,
          outputPath,
          recursive
        );

        if (result.success) {
          log.info(
            `Successfully exported ${result.secretsCount} secrets`,
            "YAML_EXPORT",
            {
              filePath: result.filePath,
              secretsCount: result.secretsCount,
            }
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `✅ Successfully exported ${result.secretsCount} secrets to ${result.filePath}`,
              },
            ],
          };
        } else {
          log.error(`Export failed: ${result.error}`, "YAML_EXPORT");
          return {
            content: [
              {
                type: "text" as const,
                text: `❌ Export failed: ${result.error}`,
              },
            ],
            isError: true,
          };
        }
      } catch (error: any) {
        log.error("YAML export failed", "YAML_EXPORT", error);
        return errorToMCPResponse(error);
      }
    }
  );

  // YAML 가져오기 도구
  server.registerTool(
    "import-secrets-yaml",
    {
      title: "Import Secrets from YAML",
      description:
        "Import secrets from a YAML file to Vault at the specified base path",
      inputSchema: {
        yamlFilePath: z
          .string()
          .describe(
            'Local YAML file path to import from (e.g., "./secrets-import.yaml")'
          ),
        basePath: z
          .string()
          .describe('Vault base path to import to (e.g., "secret/data/app1/")'),
        overwrite: z
          .boolean()
          .default(false)
          .describe("Whether to overwrite existing secrets (default: false)"),
      },
    },
    async ({
      yamlFilePath,
      basePath,
      overwrite = false,
    }: {
      yamlFilePath: string;
      basePath: string;
      overwrite?: boolean;
    }) => {
      log.info(`Importing secrets from YAML`, "YAML_IMPORT", {
        yamlFilePath,
        basePath,
        overwrite,
      });

      try {
        const result = await vaultClient.importSecretsFromYaml(
          yamlFilePath,
          basePath,
          overwrite
        );

        const statusText = result.success
          ? "✅ ALL SUCCESSFUL"
          : "⚠️ PARTIALLY SUCCESSFUL";
        const summaryText = `\n📊 Summary:
- Successfully imported: ${result.imported}
- Failed imports: ${result.failed}
- Overwrite mode: ${overwrite ? "enabled" : "disabled"}`;

        let detailsText = "";
        if (result.errors.length > 0) {
          detailsText += "\n\n❌ Errors:\n";
          result.errors.forEach((error, idx) => {
            detailsText += `${idx + 1}. ${error.path}: ${error.error}\n`;
          });
        }

        log.info(`YAML import completed`, "YAML_IMPORT", {
          imported: result.imported,
          failed: result.failed,
          success: result.success,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `YAML Import: ${statusText}${summaryText}${detailsText}`,
            },
          ],
        };
      } catch (error: any) {
        log.error("YAML import failed", "YAML_IMPORT", error);
        return errorToMCPResponse(error);
      }
    }
  );
}

/**
 * Bulk Operation Tools
 * 대량 작업을 위한 MCP 도구들입니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToMCPResponse } from "../errors.js";
import { log } from "../logger.js";
import { BulkOperation } from "../types.js";
import { VaultClient } from "../vault-client.js";

export function registerBulkTools(
  server: McpServer,
  vaultClient: VaultClient
): void {
  // 벌크 읽기 도구
  server.registerTool(
    "bulk-read-secrets",
    {
      title: "Bulk Read Vault Secrets",
      description:
        "Read multiple secrets from Vault in a single operation. Best-effort execution - continues even if some paths fail.",
      inputSchema: {
        paths: z
          .array(z.string())
          .describe(
            'Array of secret paths to read from (e.g., ["secret/data/app1/config", "secret/data/app2/database"])'
          ),
      },
    },
    async ({ paths }: { paths: string[] }) => {
      log.info(`Starting bulk read for ${paths.length} paths`, "BULK_READ");

      try {
        const result = await vaultClient.bulkReadSecrets(paths);

        const statusText = result.success
          ? "✅ ALL SUCCESSFUL"
          : "⚠️ PARTIALLY SUCCESSFUL";
        const summaryText = `\n📊 Summary:
- Total paths: ${result.summary.total}
- Succeeded: ${result.summary.succeeded}
- Failed: ${result.summary.failed}
- Duration: ${result.summary.duration}ms`;

        let detailsText = "\n\n📋 Results:\n";
        result.results.forEach((res: any, idx: number) => {
          const icon = res.success ? "✅" : "❌";
          detailsText += `${idx + 1}. ${icon} ${res.path}\n`;
          if (res.success && res.data) {
            detailsText += `   Data: ${JSON.stringify(res.data, null, 2)}\n`;
          } else if (res.error) {
            detailsText += `   Error: ${res.error}\n`;
          }
        });

        log.info(`Bulk read completed`, "BULK_READ", {
          total: result.summary.total,
          succeeded: result.summary.succeeded,
          failed: result.summary.failed,
          duration: result.summary.duration,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Bulk Read Operation: ${statusText}${summaryText}${detailsText}`,
            },
          ],
        };
      } catch (error: any) {
        log.error("Bulk read operation failed", "BULK_READ", error);
        return errorToMCPResponse(error);
      }
    }
  );

  // 벌크 쓰기 도구
  server.registerTool(
    "bulk-write-secrets",
    {
      title: "Bulk Write Vault Secrets",
      description:
        "Write multiple secrets to Vault in a single operation. Best-effort execution - continues even if some operations fail.",
      inputSchema: {
        operations: z
          .array(
            z.object({
              path: z
                .string()
                .describe(
                  'Path where to store the secret (e.g., "secret/data/app1/config")'
                ),
              data: z
                .record(z.any())
                .describe(
                  'Secret data as key-value pairs (e.g., {"username": "admin", "password": "secret123"})'
                ),
              type: z
                .enum(["create", "update"])
                .optional()
                .describe(
                  'Operation type: "create" for new secrets, "update" for existing ones (optional - defaults to create/update)'
                ),
            })
          )
          .describe(
            'Array of write operations. Each operation must have "path" and "data" fields. Example: [{"path": "secret/data/app1", "data": {"key": "value"}}]'
          ),
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, simulate the operations without making actual changes"
          ),
      },
    },
    async ({
      operations,
      dryRun,
    }: {
      operations: BulkOperation[];
      dryRun?: boolean;
    }) => {
      const modeText = dryRun ? "DRY RUN" : "BULK WRITE";
      log.info(
        `Starting ${modeText.toLowerCase()} for ${
          operations.length
        } operations`,
        "BULK_WRITE"
      );

      try {
        const result = await vaultClient.bulkWriteSecrets(operations, dryRun);

        const statusText = dryRun
          ? result.success
            ? "✅ DRY RUN: ALL WOULD SUCCEED"
            : "⚠️ DRY RUN: SOME WOULD FAIL"
          : result.success
          ? "✅ ALL SUCCESSFUL"
          : "⚠️ PARTIALLY SUCCESSFUL";
        const summaryText = `\n📊 Summary:
- Total operations: ${result.summary.total}
- ${dryRun ? "Would succeed" : "Succeeded"}: ${result.summary.succeeded}
- ${dryRun ? "Would fail" : "Failed"}: ${result.summary.failed}
- Duration: ${result.summary.duration}ms`;

        let detailsText = "\n\n📋 Results:\n";
        result.results.forEach((res: any, idx: number) => {
          const icon = res.success ? "✅" : "❌";
          detailsText += `${idx + 1}. ${icon} ${res.path}\n`;
          if (res.error) {
            detailsText += `   Error: ${res.error}\n`;
          }
        });

        log.info(`Bulk write completed`, "BULK_WRITE", {
          total: result.summary.total,
          succeeded: result.summary.succeeded,
          failed: result.summary.failed,
          duration: result.summary.duration,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Bulk Write Operation: ${statusText}${summaryText}${detailsText}`,
            },
          ],
        };
      } catch (error: any) {
        log.error("Bulk write operation failed", "BULK_WRITE", error);
        return errorToMCPResponse(error);
      }
    }
  );

  // 벌크 삭제 도구
  server.registerTool(
    "bulk-delete-secrets",
    {
      title: "Bulk Delete Vault Secrets",
      description:
        "Delete multiple secrets from Vault in a single operation. Best-effort execution - continues even if some deletions fail.",
      inputSchema: {
        paths: z
          .array(z.string())
          .describe(
            'Array of secret paths to delete (e.g., ["secret/data/app1/config", "secret/data/app2/database"])'
          ),
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, simulate the operations without making actual changes"
          ),
      },
    },
    async ({ paths, dryRun }: { paths: string[]; dryRun?: boolean }) => {
      const modeText = dryRun ? "DRY RUN" : "BULK DELETE";
      log.info(
        `Starting ${modeText.toLowerCase()} for ${paths.length} paths`,
        "BULK_DELETE"
      );

      try {
        const result = await vaultClient.bulkDeleteSecrets(paths, dryRun);

        const statusText = dryRun
          ? result.success
            ? "✅ DRY RUN: ALL WOULD SUCCEED"
            : "⚠️ DRY RUN: SOME WOULD FAIL"
          : result.success
          ? "✅ ALL SUCCESSFUL"
          : "⚠️ PARTIALLY SUCCESSFUL";
        const summaryText = `\n📊 Summary:
- Total paths: ${result.summary.total}
- ${dryRun ? "Would succeed" : "Succeeded"}: ${result.summary.succeeded}
- ${dryRun ? "Would fail" : "Failed"}: ${result.summary.failed}
- Duration: ${result.summary.duration}ms`;

        let detailsText = "\n\n📋 Results:\n";
        result.results.forEach((res: any, idx: number) => {
          const icon = res.success ? "✅" : "❌";
          detailsText += `${idx + 1}. ${icon} ${res.path}\n`;
          if (res.error) {
            detailsText += `   Error: ${res.error}\n`;
          }
        });

        log.info(`Bulk delete completed`, "BULK_DELETE", {
          total: result.summary.total,
          succeeded: result.summary.succeeded,
          failed: result.summary.failed,
          duration: result.summary.duration,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Bulk Delete Operation: ${statusText}${summaryText}${detailsText}`,
            },
          ],
        };
      } catch (error: any) {
        log.error("Bulk delete operation failed", "BULK_DELETE", error);
        return errorToMCPResponse(error);
      }
    }
  );
}

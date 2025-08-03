/**
 * Transaction Tools
 * 가상 트랜잭션 작업을 위한 MCP 도구들입니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToMCPResponse } from "../errors.js";
import { log } from "../logger.js";
import { TransactionOperation } from "../types.js";
import { VaultClient } from "../vault-client.js";

export function registerTransactionTools(
  server: McpServer,
  vaultClient: VaultClient
): void {
  // 트랜잭션 실행 도구 (롤백 자동 계산)
  server.registerTool(
    "execute-transaction",
    {
      title: "Execute Virtual Transaction",
      description:
        "Execute a virtual transaction with automatic rollback calculation. Just specify what you want to do - the system will automatically figure out how to undo it if something goes wrong. All operations succeed or all are rolled back.",
      inputSchema: {
        operations: z
          .array(
            z.object({
              type: z
                .enum(["create", "update", "delete", "read"])
                .describe(
                  'Operation type: "create" (new secret), "update" (modify existing), "delete" (remove secret), "read" (read secret)'
                ),
              path: z
                .string()
                .describe(
                  'Path to the secret (e.g., "secret/data/app1/config")'
                ),
              data: z
                .record(z.any())
                .optional()
                .describe(
                  'Data for create/update operations. Example: {"username": "admin", "password": "secret123"}'
                ),
            })
          )
          .describe(
            'Array of operations to execute. The system will automatically calculate rollback operations. Example: [{"type": "create", "path": "secret/data/test", "data": {"key": "value"}}]'
          ),
      },
    },
    async ({ operations }: { operations: TransactionOperation[] }) => {
      log.info(
        `Starting transaction with ${operations.length} operations`,
        "TRANSACTION"
      );

      try {
        const result = await vaultClient.executeTransaction(operations);

        let statusText = result.success ? "✅ COMMITTED" : "❌ ROLLED BACK";
        let summaryText = `\n📊 Summary:
- Total operations: ${result.summary.total}
- Succeeded: ${result.summary.succeeded}
- Failed: ${result.summary.failed}
- Rolled back: ${result.summary.rolledBack}
- Duration: ${result.summary.duration}ms`;

        let detailsText = "\n\n📋 Operation Details:\n";
        result.results.forEach((res: any, idx: number) => {
          const icon = res.success ? "✅" : "❌";
          const rollbackInfo =
            res.rollbackExecuted !== undefined
              ? res.rollbackExecuted
                ? " [ROLLED BACK]"
                : " [ROLLBACK FAILED]"
              : "";
          detailsText += `${idx + 1}. ${icon} ${res.path}${rollbackInfo}\n`;
          if (res.error) {
            detailsText += `   Error: ${res.error}\n`;
          }
        });

        if (result.rollbackResults && result.rollbackResults.length > 0) {
          detailsText += "\n🔄 Rollback Operations:\n";
          result.rollbackResults.forEach((res: any, idx: number) => {
            const icon = res.rollbackExecuted ? "✅" : "❌";
            detailsText += `${idx + 1}. ${icon} Rollback ${res.path}\n`;
          });
        }

        log.info(
          `Transaction ${result.transactionId} ${
            result.success ? "committed" : "rolled back"
          }`,
          "TRANSACTION",
          {
            total: result.summary.total,
            succeeded: result.summary.succeeded,
            failed: result.summary.failed,
            duration: result.summary.duration,
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Virtual Transaction ${result.transactionId}: ${statusText}${summaryText}${detailsText}`,
            },
          ],
        };
      } catch (error: any) {
        log.error("Transaction execution failed", "TRANSACTION", error);
        return errorToMCPResponse(error);
      }
    }
  );
}

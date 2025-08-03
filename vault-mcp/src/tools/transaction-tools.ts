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
        "Execute a virtual transaction with automatic rollback calculation. Just specify what you want to do - the system will automatically figure out how to undo it if something goes wrong. All operations succeed or all are rolled back. Use dryRun to simulate the transaction without making actual changes.",
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
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, simulate the transaction without making actual changes"
          ),
      },
    },
    async ({
      operations,
      dryRun = false,
    }: {
      operations: TransactionOperation[];
      dryRun?: boolean;
    }) => {
      log.info(
        `Starting ${dryRun ? "dry run " : ""}transaction with ${
          operations.length
        } operations`,
        "TRANSACTION"
      );

      try {
        const result = await vaultClient.executeTransaction(operations, dryRun);

        if (dryRun && "dryRun" in result) {
          // Dry run 결과 처리
          const dryRunResult = result as any;
          const statusIcon = dryRunResult.wouldSucceed ? "✅" : "❌";
          const statusText = dryRunResult.wouldSucceed
            ? "WOULD SUCCEED"
            : "WOULD FAIL";

          let responseText = `${statusIcon} DRY RUN: Transaction ${statusText}\n\n`;
          responseText += `🆔 Transaction ID: ${dryRunResult.transactionId}\n`;

          // 검증 요약
          responseText += `\n📊 Validation Summary:
- Total operations: ${dryRunResult.validationSummary.totalOperations}
- Would succeed: ${dryRunResult.validationSummary.wouldSucceed}
- Would fail: ${dryRunResult.validationSummary.wouldFail}
- Duration: ${dryRunResult.summary.duration}ms\n`;

          // 각 작업별 시뮬레이션 결과
          responseText += "\n📋 Operation Simulation Results:\n";
          dryRunResult.results.forEach((res: any, idx: number) => {
            const icon = res.wouldSucceed ? "✅" : "❌";
            const operation = operations[idx];
            responseText += `${
              idx + 1
            }. ${icon} ${operation.type.toUpperCase()} ${res.path}\n`;

            if (res.wouldSucceed) {
              if (res.data.pathExists) {
                responseText += `   📄 Current data exists\n`;
              } else {
                responseText += `   📄 Path does not exist\n`;
              }
            } else {
              if (res.validationErrors) {
                responseText += `   ❌ ${res.validationErrors.join(", ")}\n`;
              }
            }
          });

          // 전체 검증 오류
          if (dryRunResult.validationSummary.validationErrors.length > 0) {
            responseText += "\n❌ Validation Errors:\n";
            dryRunResult.validationSummary.validationErrors.forEach(
              (error: any) => {
                responseText += `• ${error.path}: ${error.errors.join(", ")}\n`;
              }
            );
          }

          if (dryRunResult.wouldSucceed) {
            responseText +=
              "\n✅ All operations would succeed if executed for real.";
          } else {
            responseText +=
              "\n❌ Transaction would fail. Fix the validation errors above before executing.";
          }

          log.info(
            `Transaction dry run ${dryRunResult.transactionId} completed: ${dryRunResult.validationSummary.wouldSucceed}/${dryRunResult.validationSummary.totalOperations} would succeed`,
            "TRANSACTION"
          );

          return {
            content: [
              {
                type: "text" as const,
                text: responseText,
              },
            ],
          };
        } else {
          // 실제 트랜잭션 결과 처리
          const realResult = result as any;
          let statusText = realResult.success
            ? "✅ COMMITTED"
            : "❌ ROLLED BACK";
          let summaryText = `\n📊 Summary:
- Total operations: ${realResult.summary.total}
- Succeeded: ${realResult.summary.succeeded}
- Failed: ${realResult.summary.failed}
- Rolled back: ${realResult.summary.rolledBack}
- Duration: ${realResult.summary.duration}ms`;

          let detailsText = "\n\n📋 Operation Details:\n";
          realResult.results.forEach((res: any, idx: number) => {
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

          if (
            realResult.rollbackResults &&
            realResult.rollbackResults.length > 0
          ) {
            detailsText += "\n🔄 Rollback Operations:\n";
            realResult.rollbackResults.forEach((res: any, idx: number) => {
              const icon = res.rollbackExecuted ? "✅" : "❌";
              detailsText += `${idx + 1}. ${icon} Rollback ${res.path}\n`;
            });
          }

          log.info(
            `Transaction ${realResult.transactionId} ${
              realResult.success ? "committed" : "rolled back"
            }`,
            "TRANSACTION",
            {
              total: realResult.summary.total,
              succeeded: realResult.summary.succeeded,
              failed: realResult.summary.failed,
              duration: realResult.summary.duration,
            }
          );

          return {
            content: [
              {
                type: "text" as const,
                text: `Virtual Transaction ${realResult.transactionId}: ${statusText}${summaryText}${detailsText}`,
              },
            ],
          };
        }
      } catch (error: any) {
        log.error("Transaction execution failed", "TRANSACTION", error);
        return errorToMCPResponse(error);
      }
    }
  );
}

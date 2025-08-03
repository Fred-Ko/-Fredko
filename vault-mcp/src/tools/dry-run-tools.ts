/**
 * Dry Run Tools
 * 시뮬레이션 전용 MCP 도구들입니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToMCPResponse } from "../errors.js";
import { log } from "../logger.js";
import { TransactionOperation } from "../types.js";
import { VaultClient } from "../vault-client.js";

export function registerDryRunTools(
  server: McpServer,
  vaultClient: VaultClient
): void {
  // 쓰기 시뮬레이션 도구
  server.registerTool(
    "simulate-write-secret",
    {
      title: "Simulate Write Vault Secret",
      description:
        "Simulate writing a secret to Vault without making actual changes. Shows what would happen if the operation were executed.",
      inputSchema: {
        path: z
          .string()
          .describe("The path where to store the secret in Vault"),
        data: z.record(z.any()).describe("The secret data as key-value pairs"),
      },
    },
    async ({ path, data }: { path: string; data: Record<string, any> }) => {
      log.debug(`Simulating write operation for: ${path}`, "SIMULATE_WRITE");

      try {
        const result = await vaultClient.writeSecret(path, data, true);
        const dryRunResult = result as any;

        const statusIcon = dryRunResult.wouldSucceed ? "✅" : "❌";
        const statusText = dryRunResult.wouldSucceed
          ? "WOULD SUCCEED"
          : "WOULD FAIL";

        let responseText = `${statusIcon} SIMULATION: Write operation ${statusText}\n\n`;
        responseText += `📍 Path: ${path}\n`;

        if (dryRunResult.pathExists) {
          responseText += `\n📄 Current data exists at path:\n${JSON.stringify(
            dryRunResult.existingData,
            null,
            2
          )}\n`;
          responseText += `\n🔄 Would overwrite with:\n${JSON.stringify(
            data,
            null,
            2
          )}`;
        } else {
          responseText += `\n📄 Path does not currently exist - would create new secret\n`;
          responseText += `\n📝 Would create with data:\n${JSON.stringify(
            data,
            null,
            2
          )}`;
        }

        if (dryRunResult.validationErrors) {
          responseText += `\n\n❌ Validation errors:\n${dryRunResult.validationErrors
            .map((e: string) => `• ${e}`)
            .join("\n")}`;
        }

        if (dryRunResult.wouldSucceed) {
          responseText += `\n\n💡 To execute this operation for real, use the 'write-secret' tool without dryRun parameter.`;
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        log.error(
          `Failed to simulate write for: ${path}`,
          "SIMULATE_WRITE",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // 삭제 시뮬레이션 도구
  server.registerTool(
    "simulate-delete-secret",
    {
      title: "Simulate Delete Vault Secret",
      description:
        "Simulate deleting a secret from Vault without making actual changes. Shows what would happen if the operation were executed.",
      inputSchema: {
        path: z.string().describe("The path to the secret to delete in Vault"),
      },
    },
    async ({ path }: { path: string }) => {
      log.debug(`Simulating delete operation for: ${path}`, "SIMULATE_DELETE");

      try {
        const result = await vaultClient.deleteSecret(path, true);
        const dryRunResult = result as any;

        const statusIcon = dryRunResult.wouldSucceed ? "✅" : "❌";
        const statusText = dryRunResult.wouldSucceed
          ? "WOULD SUCCEED"
          : "WOULD FAIL";

        let responseText = `${statusIcon} SIMULATION: Delete operation ${statusText}\n\n`;
        responseText += `📍 Path: ${path}\n`;

        if (dryRunResult.pathExists && dryRunResult.existingData) {
          responseText += `\n📄 Current data that would be deleted:\n${JSON.stringify(
            dryRunResult.existingData,
            null,
            2
          )}`;
        } else {
          responseText += `\n📄 No data exists at this path - nothing to delete`;
        }

        if (dryRunResult.validationErrors) {
          responseText += `\n\n❌ Validation errors:\n${dryRunResult.validationErrors
            .map((e: string) => `• ${e}`)
            .join("\n")}`;
        }

        if (dryRunResult.wouldSucceed) {
          responseText += `\n\n💡 To execute this operation for real, use the 'delete-secret' tool without dryRun parameter.`;
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        log.error(
          `Failed to simulate delete for: ${path}`,
          "SIMULATE_DELETE",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // 트랜잭션 시뮬레이션 도구
  server.registerTool(
    "simulate-transaction",
    {
      title: "Simulate Virtual Transaction",
      description:
        "Simulate a virtual transaction without making actual changes. Shows what would happen if the transaction were executed, including dependency analysis between operations.",
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
            'Array of operations to simulate. Example: [{"type": "create", "path": "secret/data/test", "data": {"key": "value"}}]'
          ),
      },
    },
    async ({ operations }: { operations: TransactionOperation[] }) => {
      log.info(
        `Starting transaction simulation with ${operations.length} operations`,
        "SIMULATE_TRANSACTION"
      );

      try {
        const result = await vaultClient.executeTransactionDryRun(operations);

        const statusIcon = result.wouldSucceed ? "✅" : "❌";
        const statusText = result.wouldSucceed ? "WOULD SUCCEED" : "WOULD FAIL";

        let responseText = `${statusIcon} TRANSACTION SIMULATION: ${statusText}\n\n`;
        responseText += `🆔 Transaction ID: ${result.transactionId}\n`;

        // 검증 요약
        responseText += `\n📊 Simulation Summary:
- Total operations: ${result.validationSummary.totalOperations}
- Would succeed: ${result.validationSummary.wouldSucceed}
- Would fail: ${result.validationSummary.wouldFail}
- Simulation duration: ${result.summary.duration}ms\n`;

        // 각 작업별 시뮬레이션 결과
        responseText += "\n📋 Operation Simulation Details:\n";
        result.results.forEach((res: any, idx: number) => {
          const icon = res.wouldSucceed ? "✅" : "❌";
          const operation = operations[idx];
          responseText += `\n${
            idx + 1
          }. ${icon} ${operation.type.toUpperCase()} ${res.path}\n`;

          if (res.wouldSucceed) {
            if (operation.type === "read") {
              responseText += `   📖 Would read existing data\n`;
            } else if (operation.type === "create") {
              responseText += `   📝 Would create new secret\n`;
            } else if (operation.type === "update") {
              responseText += `   🔄 Would update existing secret\n`;
            } else if (operation.type === "delete") {
              responseText += `   🗑️ Would delete existing secret\n`;
            }

            if (res.data.pathExists) {
              responseText += `   📄 Current data exists at path\n`;
            } else {
              responseText += `   📄 Path does not currently exist\n`;
            }
          } else {
            if (res.validationErrors) {
              responseText += `   ❌ Errors: ${res.validationErrors.join(
                ", "
              )}\n`;
            }
          }
        });

        // 의존성 분석
        responseText += "\n🔗 Dependency Analysis:\n";
        const pathOperations = new Map<string, number[]>();
        operations.forEach((op, idx) => {
          if (!pathOperations.has(op.path)) {
            pathOperations.set(op.path, []);
          }
          pathOperations.get(op.path)!.push(idx);
        });

        let hasDependencies = false;
        pathOperations.forEach((opIndices, path) => {
          if (opIndices.length > 1) {
            hasDependencies = true;
            responseText += `• Path ${path} has ${opIndices.length} operations: `;
            responseText += opIndices
              .map((i) => `#${i + 1}(${operations[i].type})`)
              .join(" → ");
            responseText += "\n";
          }
        });

        if (!hasDependencies) {
          responseText +=
            "• No path dependencies detected - all operations target different paths\n";
        }

        // 전체 검증 오류
        if (result.validationSummary.validationErrors.length > 0) {
          responseText += "\n❌ Validation Errors Summary:\n";
          result.validationSummary.validationErrors.forEach((error: any) => {
            responseText += `• ${error.path}: ${error.errors.join(", ")}\n`;
          });
        }

        if (result.wouldSucceed) {
          responseText +=
            "\n✅ All operations would succeed if executed for real.";
          responseText +=
            "\n💡 To execute this transaction, use the 'execute-transaction' tool without dryRun parameter.";
        } else {
          responseText +=
            "\n❌ Transaction would fail. Fix the validation errors above before executing.";
        }

        log.info(
          `Transaction simulation ${result.transactionId} completed: ${result.validationSummary.wouldSucceed}/${result.validationSummary.totalOperations} would succeed`,
          "SIMULATE_TRANSACTION"
        );

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        log.error(
          "Transaction simulation failed",
          "SIMULATE_TRANSACTION",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // 일괄 검증 도구
  server.registerTool(
    "validate-operations",
    {
      title: "Validate Multiple Operations",
      description:
        "Validate multiple Vault operations without executing them. Useful for checking if a series of operations would succeed before running them.",
      inputSchema: {
        operations: z
          .array(
            z.object({
              type: z
                .enum(["create", "update", "delete", "read"])
                .describe("Operation type"),
              path: z.string().describe("Path to the secret"),
              data: z
                .record(z.any())
                .optional()
                .describe("Data for create/update operations"),
            })
          )
          .describe("Array of operations to validate"),
        checkDependencies: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to check for dependencies between operations"),
      },
    },
    async ({
      operations,
      checkDependencies = true,
    }: {
      operations: TransactionOperation[];
      checkDependencies?: boolean;
    }) => {
      log.info(
        `Validating ${operations.length} operations`,
        "VALIDATE_OPERATIONS"
      );

      try {
        // 개별 검증과 의존성 검증을 분리하여 수행
        const individualResults = await Promise.all(
          operations.map(async (op, idx) => {
            try {
              const result = await vaultClient.simulateOperation(op);
              return { index: idx, operation: op, result };
            } catch (error: any) {
              return {
                index: idx,
                operation: op,
                result: {
                  path: op.path,
                  success: false,
                  dryRun: true,
                  data: {
                    dryRun: true,
                    wouldSucceed: false,
                    validationErrors: [`Validation error: ${error.message}`],
                    pathExists: false,
                  },
                  wouldSucceed: false,
                  validationErrors: [`Validation error: ${error.message}`],
                },
              };
            }
          })
        );

        let responseText = `📋 VALIDATION RESULTS FOR ${operations.length} OPERATIONS\n\n`;

        // 개별 결과 요약
        const successCount = individualResults.filter(
          (r) => r.result.wouldSucceed
        ).length;
        const failCount = operations.length - successCount;

        responseText += `📊 Summary:
- Total operations: ${operations.length}
- Would succeed individually: ${successCount}
- Would fail individually: ${failCount}\n`;

        // 개별 작업 결과
        responseText += "\n📝 Individual Operation Results:\n";
        individualResults.forEach(({ index, operation, result }) => {
          const icon = result.wouldSucceed ? "✅" : "❌";
          responseText += `${
            index + 1
          }. ${icon} ${operation.type.toUpperCase()} ${operation.path}\n`;

          if (!result.wouldSucceed && result.validationErrors) {
            responseText += `   ❌ ${result.validationErrors.join(", ")}\n`;
          }
        });

        // 의존성 분석
        if (checkDependencies) {
          responseText += "\n🔗 Dependency Analysis:\n";
          const pathGroups = new Map<
            string,
            Array<{ index: number; operation: TransactionOperation }>
          >();

          operations.forEach((op, idx) => {
            if (!pathGroups.has(op.path)) {
              pathGroups.set(op.path, []);
            }
            pathGroups.get(op.path)!.push({ index: idx, operation: op });
          });

          let hasConflicts = false;
          pathGroups.forEach((opGroup, path) => {
            if (opGroup.length > 1) {
              responseText += `\n• Path ${path} has ${opGroup.length} operations:\n`;
              opGroup.forEach(({ index, operation }) => {
                responseText += `  ${
                  index + 1
                }. ${operation.type.toUpperCase()}\n`;
              });

              // 충돌 검사
              const types = opGroup.map((g) => g.operation.type);
              if (types.includes("create") && types.includes("create")) {
                responseText += `  ⚠️ Multiple CREATE operations on same path will conflict\n`;
                hasConflicts = true;
              }
              if (types.includes("delete") && types.includes("delete")) {
                responseText += `  ⚠️ Multiple DELETE operations on same path will conflict\n`;
                hasConflicts = true;
              }
              if (
                types.includes("delete") &&
                (types.includes("update") || types.includes("read"))
              ) {
                const deleteIndex = opGroup.find(
                  (g) => g.operation.type === "delete"
                )?.index;
                const otherIndices = opGroup
                  .filter((g) => g.operation.type !== "delete")
                  .map((g) => g.index);
                if (otherIndices.some((i) => i > deleteIndex!)) {
                  responseText += `  ⚠️ Operations after DELETE will fail\n`;
                  hasConflicts = true;
                }
              }
            }
          });

          if (!hasConflicts && pathGroups.size === operations.length) {
            responseText +=
              "• No dependencies or conflicts detected - all operations target different paths\n";
          } else if (!hasConflicts) {
            responseText += "• Dependencies detected but no conflicts found\n";
          }
        }

        // 최종 권장사항
        responseText += "\n💡 Recommendations:\n";
        if (failCount === 0 && !checkDependencies) {
          responseText += "• All operations would succeed individually\n";
        } else if (failCount === 0 && checkDependencies) {
          responseText +=
            "• All operations would succeed and no conflicts detected\n";
          responseText += "• Safe to execute as a transaction\n";
        } else {
          responseText += "• Fix validation errors before executing\n";
          if (checkDependencies) {
            responseText += "• Consider operation order to avoid conflicts\n";
          }
        }

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        log.error("Operation validation failed", "VALIDATE_OPERATIONS", error);
        return errorToMCPResponse(error);
      }
    }
  );
}

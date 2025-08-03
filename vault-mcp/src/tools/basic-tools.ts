/**
 * Basic Vault Operations Tools
 * 기본적인 Vault CRUD 작업을 위한 MCP 도구들입니다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorToMCPResponse } from "../errors.js";
import { log } from "../logger.js";
import { VaultClient } from "../vault-client.js";

export function registerBasicTools(
  server: McpServer,
  vaultClient: VaultClient
): void {
  // Secret 읽기 도구
  server.registerTool(
    "read-secret",
    {
      title: "Read Vault Secret",
      description: "Read a secret from Vault at the specified path",
      inputSchema: {
        path: z
          .string()
          .describe(
            "The path to the secret in Vault (e.g., secret/data/myapp)"
          ),
      },
    },
    async ({ path }: { path: string }) => {
      log.debug(`Reading secret from path: ${path}`, "READ_SECRET");

      try {
        const secret = await vaultClient.readSecret(path);

        if (!secret) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Secret not found at path: ${path}`,
              },
            ],
          };
        }

        log.debug(`Successfully read secret from: ${path}`, "READ_SECRET");
        return {
          content: [
            {
              type: "text",
              text: `Secret at ${path}:\n${JSON.stringify(
                secret.data,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        log.error(`Failed to read secret from: ${path}`, "READ_SECRET", error);
        return errorToMCPResponse(error);
      }
    }
  );

  // Secret 쓰기 도구
  server.registerTool(
    "write-secret",
    {
      title: "Write Vault Secret",
      description:
        "Write a secret to Vault at the specified path. Use dryRun to simulate the operation without making actual changes.",
      inputSchema: {
        path: z
          .string()
          .describe("The path where to store the secret in Vault"),
        data: z.record(z.any()).describe("The secret data as key-value pairs"),
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, simulate the operation without making actual changes"
          ),
      },
    },
    async ({
      path,
      data,
      dryRun = false,
    }: {
      path: string;
      data: Record<string, any>;
      dryRun?: boolean;
    }) => {
      log.debug(
        `${dryRun ? "Simulating write" : "Writing"} secret to path: ${path}`,
        "WRITE_SECRET"
      );

      try {
        const result = await vaultClient.writeSecret(path, data, dryRun);

        if (dryRun && result) {
          // Dry run 결과 처리
          const dryRunResult = result as any;
          const statusIcon = dryRunResult.wouldSucceed ? "✅" : "❌";
          const statusText = dryRunResult.wouldSucceed
            ? "WOULD SUCCEED"
            : "WOULD FAIL";

          let responseText = `${statusIcon} DRY RUN: Write operation ${statusText}\n\nPath: ${path}\n`;

          if (dryRunResult.pathExists) {
            responseText += `\n📄 Current data exists at path:\n${JSON.stringify(
              dryRunResult.existingData,
              null,
              2
            )}\n`;
          } else {
            responseText += `\n📄 Path does not currently exist - would create new secret\n`;
          }

          if (dryRunResult.wouldSucceed) {
            responseText += `\n📝 Would write data:\n${JSON.stringify(
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

          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
          };
        } else {
          // 실제 쓰기 완료
          log.debug(`Successfully wrote secret to: ${path}`, "WRITE_SECRET");
          return {
            content: [
              {
                type: "text",
                text: `✅ Successfully wrote secret to ${path}`,
              },
            ],
          };
        }
      } catch (error: any) {
        log.error(
          `Failed to ${dryRun ? "simulate" : "write"} secret to: ${path}`,
          "WRITE_SECRET",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // Secret 삭제 도구
  server.registerTool(
    "delete-secret",
    {
      title: "Delete Vault Secret",
      description:
        "Delete a secret from Vault at the specified path. Use dryRun to simulate the operation without making actual changes.",
      inputSchema: {
        path: z.string().describe("The path to the secret to delete in Vault"),
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, simulate the operation without making actual changes"
          ),
      },
    },
    async ({ path, dryRun = false }: { path: string; dryRun?: boolean }) => {
      log.debug(
        `${
          dryRun ? "Simulating delete" : "Deleting"
        } secret from path: ${path}`,
        "DELETE_SECRET"
      );

      try {
        const result = await vaultClient.deleteSecret(path, dryRun);

        if (dryRun && result) {
          // Dry run 결과 처리
          const dryRunResult = result as any;
          const statusIcon = dryRunResult.wouldSucceed ? "✅" : "❌";
          const statusText = dryRunResult.wouldSucceed
            ? "WOULD SUCCEED"
            : "WOULD FAIL";

          let responseText = `${statusIcon} DRY RUN: Delete operation ${statusText}\n\nPath: ${path}\n`;

          if (dryRunResult.pathExists && dryRunResult.existingData) {
            responseText += `\n📄 Current data that would be deleted:\n${JSON.stringify(
              dryRunResult.existingData,
              null,
              2
            )}`;
          } else {
            responseText += `\n📄 No data exists at this path`;
          }

          if (dryRunResult.validationErrors) {
            responseText += `\n\n❌ Validation errors:\n${dryRunResult.validationErrors
              .map((e: string) => `• ${e}`)
              .join("\n")}`;
          }

          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
          };
        } else {
          // 실제 삭제 완료
          log.debug(
            `Successfully deleted secret from: ${path}`,
            "DELETE_SECRET"
          );
          return {
            content: [
              {
                type: "text",
                text: `✅ Successfully deleted secret at ${path}`,
              },
            ],
          };
        }
      } catch (error: any) {
        log.error(
          `Failed to ${dryRun ? "simulate" : "delete"} secret from: ${path}`,
          "DELETE_SECRET",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // Secret 목록 조회 도구
  server.registerTool(
    "list-secrets",
    {
      title: "List Vault Secrets",
      description: "List all secrets at the specified path in Vault",
      inputSchema: {
        path: z
          .string()
          .describe("The path to list secrets from (e.g., secret/metadata/)"),
      },
    },
    async ({ path }: { path: string }) => {
      log.debug(`Listing secrets from path: ${path}`, "LIST_SECRETS");

      try {
        const secrets = await vaultClient.listSecrets(path);

        if (secrets.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No secrets found at path: ${path}`,
              },
            ],
          };
        }

        log.debug(
          `Found ${secrets.length} secrets at: ${path}`,
          "LIST_SECRETS"
        );
        return {
          content: [
            {
              type: "text",
              text: `Secrets at ${path}:\n${secrets
                .map((s) => `- ${s}`)
                .join("\n")}`,
            },
          ],
        };
      } catch (error: any) {
        log.error(
          `Failed to list secrets from: ${path}`,
          "LIST_SECRETS",
          error
        );
        return errorToMCPResponse(error);
      }
    }
  );

  // Vault 상태 확인 도구
  server.registerTool(
    "vault-health",
    {
      title: "Check Vault Health",
      description: "Check the health status of the Vault server",
      inputSchema: {},
    },
    async () => {
      log.debug("Checking Vault health status", "VAULT_HEALTH");

      try {
        const health = await vaultClient.getHealth();

        const status = health.sealed
          ? "SEALED"
          : !health.initialized
          ? "UNINITIALIZED"
          : health.standby
          ? "STANDBY"
          : "ACTIVE";

        log.debug(`Vault status: ${status}`, "VAULT_HEALTH");
        return {
          content: [
            {
              type: "text",
              text: `Vault Status: ${status}\n${JSON.stringify(
                health,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        log.error("Failed to check Vault health", "VAULT_HEALTH", error);
        return errorToMCPResponse(error);
      }
    }
  );
}

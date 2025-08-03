import { z } from "zod";
import { VaultConfigurationError } from "./errors.js";
import { log } from "./logger.js";
import { VaultConfig } from "./types.js";

const ConfigSchema = z.object({
  vault: z.object({
    endpoint: z.string().url().default("http://127.0.0.1:8200"),
    token: z.string(),
    permissions: z
      .object({
        read: z.boolean().default(true),
        write: z.boolean().default(false),
      })
      .default({ read: true, write: false }),
    allowedPaths: z.array(z.string()).optional(),
    allowedWorkingDirectory: z.string().optional(),
  }),
});

export function loadConfig(): VaultConfig {
  log.info("Loading configuration from environment variables", "CONFIG");

  const config = {
    vault: {
      endpoint: process.env.VAULT_ADDR || "http://127.0.0.1:8200",
      token: process.env.VAULT_TOKEN || "",
      permissions: {
        read: process.env.VAULT_ALLOW_READ !== "false",
        write: process.env.VAULT_ALLOW_WRITE === "true",
      },
      allowedPaths: process.env.VAULT_ALLOWED_PATHS?.split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      allowedWorkingDirectory: process.env.VAULT_ALLOWED_WORKING_DIR,
    },
  };

  try {
    const parsed = ConfigSchema.parse(config);
    const vaultConfig = parsed.vault;

    // 설정 검증
    if (!vaultConfig.token) {
      throw new VaultConfigurationError(
        "VAULT_TOKEN environment variable is required"
      );
    }

    log.info("Configuration loaded successfully", "CONFIG", {
      endpoint: vaultConfig.endpoint,
      permissions: vaultConfig.permissions,
      allowedPathsCount: vaultConfig.allowedPaths?.length || 0,
      hasWorkingDirectory: !!vaultConfig.allowedWorkingDirectory,
    });

    return vaultConfig;
  } catch (error) {
    if (error instanceof VaultConfigurationError) {
      throw error;
    }
    throw new VaultConfigurationError(`Invalid configuration: ${error}`);
  }
}

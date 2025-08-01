import { z } from 'zod';

export interface VaultConfig {
  endpoint: string;
  token: string;
  permissions: {
    read: boolean;
    write: boolean;
  };
  allowedPaths?: string[];
}

const ConfigSchema = z.object({
  vault: z.object({
    endpoint: z.string().url().default('http://127.0.0.1:8200'),
    token: z.string(),
    permissions: z.object({
      read: z.boolean().default(true),
      write: z.boolean().default(false),
    }).default({ read: true, write: false }),
    allowedPaths: z.array(z.string()).optional(),
  }),
});

export function loadConfig(): VaultConfig {
  const config = {
    vault: {
      endpoint: process.env.VAULT_ADDR || 'http://127.0.0.1:8200',
      token: process.env.VAULT_TOKEN || '',
      permissions: {
        read: process.env.VAULT_ALLOW_READ !== 'false',
        write: process.env.VAULT_ALLOW_WRITE === 'true',
      },
      allowedPaths: process.env.VAULT_ALLOWED_PATHS?.split(',').map(p => p.trim()),
    },
  };

  try {
    const parsed = ConfigSchema.parse(config);
    return parsed.vault;
  } catch (error) {
    throw new Error(`Invalid configuration: ${error}`);
  }
}
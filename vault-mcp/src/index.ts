#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { VaultClient } from './vault-client.js';

// 설정 로드
const config = loadConfig();
const vaultClient = new VaultClient(config);

// MCP 서버 생성
const server = new McpServer({
  name: 'vault-mcp-server',
  version: '1.0.0',
});

// Vault 상태 확인 리소스
server.registerResource(
  'vault-health',
  'vault://health',
  {
    title: 'Vault Health Status',
    description: 'Current health status of the Vault server',
    mimeType: 'application/json',
  },
  async () => {
    try {
      const health = await vaultClient.getHealth();
      return {
        contents: [{
          uri: 'vault://health',
          text: JSON.stringify(health, null, 2),
        }],
      };
    } catch (error: any) {
      return {
        contents: [{
          uri: 'vault://health',
          text: JSON.stringify({ error: error.message }, null, 2),
        }],
      };
    }
  }
);

// 서버 설정 정보 리소스
server.registerResource(
  'vault-config',
  'vault://config',
  {
    title: 'Vault Server Configuration',
    description: 'Current configuration and permissions',
    mimeType: 'application/json',
  },
  async () => {
    const configInfo = {
      endpoint: config.endpoint,
      permissions: config.permissions,
      allowedPaths: config.allowedPaths || ['All paths allowed'],
    };

    return {
      contents: [{
        uri: 'vault://config',
        text: JSON.stringify(configInfo, null, 2),
      }],
    };
  }
);

// Secret 읽기 도구
server.registerTool(
  'read-secret',
  {
    title: 'Read Vault Secret',
    description: 'Read a secret from Vault at the specified path',
    inputSchema: {
      path: z.string().describe('The path to the secret in Vault (e.g., secret/data/myapp)'),
    },
  },
  async ({ path }: { path: string }) => {
    try {
      const secret = await vaultClient.readSecret(path);

      if (!secret) {
        return {
          content: [{
            type: 'text',
            text: `Secret not found at path: ${path}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Secret at ${path}:\n${JSON.stringify(secret.data, null, 2)}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error reading secret: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// Secret 쓰기 도구
server.registerTool(
  'write-secret',
  {
    title: 'Write Vault Secret',
    description: 'Write a secret to Vault at the specified path',
    inputSchema: {
      path: z.string().describe('The path where to store the secret in Vault'),
      data: z.record(z.any()).describe('The secret data as key-value pairs'),
    },
  },
  async ({ path, data }: { path: string; data: Record<string, any> }) => {
    try {
      await vaultClient.writeSecret(path, data);

      return {
        content: [{
          type: 'text',
          text: `Successfully wrote secret to ${path}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error writing secret: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// Secret 삭제 도구
server.registerTool(
  'delete-secret',
  {
    title: 'Delete Vault Secret',
    description: 'Delete a secret from Vault at the specified path',
    inputSchema: {
      path: z.string().describe('The path to the secret to delete in Vault'),
    },
  },
  async ({ path }: { path: string }) => {
    try {
      await vaultClient.deleteSecret(path);

      return {
        content: [{
          type: 'text',
          text: `Successfully deleted secret at ${path}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error deleting secret: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// Secret 목록 조회 도구
server.registerTool(
  'list-secrets',
  {
    title: 'List Vault Secrets',
    description: 'List all secrets at the specified path in Vault',
    inputSchema: {
      path: z.string().describe('The path to list secrets from (e.g., secret/metadata/)'),
    },
  },
  async ({ path }: { path: string }) => {
    try {
      const secrets = await vaultClient.listSecrets(path);

      if (secrets.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No secrets found at path: ${path}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Secrets at ${path}:\n${secrets.map(s => `- ${s}`).join('\n')}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error listing secrets: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// Vault 상태 확인 도구
server.registerTool(
  'vault-health',
  {
    title: 'Check Vault Health',
    description: 'Check the health status of the Vault server',
    inputSchema: {},
  },
  async () => {
    try {
      const health = await vaultClient.getHealth();

      const status = health.sealed ? 'SEALED' :
                    !health.initialized ? 'UNINITIALIZED' :
                    health.standby ? 'STANDBY' : 'ACTIVE';

      return {
        content: [{
          type: 'text',
          text: `Vault Status: ${status}\n${JSON.stringify(health, null, 2)}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error checking Vault health: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

async function main() {
  try {
    // 설정 검증
    if (!config.token) {
      console.error('Error: VAULT_TOKEN environment variable is required');
      process.exit(1);
    }

    // Vault 연결 테스트
    try {
      await vaultClient.getHealth();
      console.error(`Connected to Vault at ${config.endpoint}`);
      console.error(`Permissions: read=${config.permissions.read}, write=${config.permissions.write}`);
      if (config.allowedPaths) {
        console.error(`Allowed paths: ${config.allowedPaths.join(', ')}`);
      }
    } catch (error: any) {
      console.error(`Warning: Could not connect to Vault: ${error.message}`);
    }

    // 서버 시작
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Vault MCP Server running on stdio');

  } catch (error: any) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('Main error:', error);
  process.exit(1);
});
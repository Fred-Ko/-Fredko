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

// === 가상 트랜잭션 도구들 ===

// 가상 트랜잭션 실행 도구
server.registerTool(
  'execute-transaction',
  {
    title: 'Execute Virtual Transaction',
    description: 'Execute a virtual transaction with rollback operations for atomicity. All operations succeed or all are rolled back.',
    inputSchema: {
      operations: z.array(z.object({
        forward: z.object({
          type: z.enum(['create', 'update', 'delete', 'read']).describe('Type of forward operation: "create" (new secret), "update" (modify existing), "delete" (remove secret), "read" (read secret)'),
          path: z.string().describe('Path to the secret (e.g., "secret/data/app1/config")'),
          data: z.record(z.any()).optional().describe('Data for create/update operations (required for create/update). Example: {"username": "admin", "password": "secret123"}')
        }).describe('Forward operation to execute - the main operation you want to perform'),
        rollback: z.object({
          type: z.enum(['create', 'update', 'delete', 'read']).describe('Type of rollback operation: "create" (restore deleted), "update" (restore original data), "delete" (remove created), "read" (no rollback needed)'),
          path: z.string().describe('Path for rollback operation (usually same as forward path)'),
          data: z.record(z.any()).optional().describe('Data for rollback create operation (when restoring a deleted secret)'),
          originalData: z.record(z.any()).optional().describe('Original data to restore for update/delete rollback (backup of existing data before modification)')
        }).describe('Rollback operation to execute if forward operation fails - this undoes the forward operation')
      })).describe('Array of transactional operations. Each operation has "forward" (main action) and "rollback" (undo action) parts. Example: [{"forward": {"type": "create", "path": "secret/data/test", "data": {"key": "value"}}, "rollback": {"type": "delete", "path": "secret/data/test"}}]')
    },
  },
  async ({ operations }: { operations: Array<{
    forward: { type: 'create' | 'update' | 'delete' | 'read'; path: string; data?: Record<string, any> };
    rollback: { type: 'create' | 'update' | 'delete' | 'read'; path: string; data?: Record<string, any>; originalData?: Record<string, any> };
  }> }) => {
    try {
      const result = await vaultClient.executeTransaction(operations);

      let statusText = result.success ? '✅ COMMITTED' : '❌ ROLLED BACK';
      let summaryText = `\n📊 Summary:
- Total operations: ${result.summary.total}
- Succeeded: ${result.summary.succeeded}
- Failed: ${result.summary.failed}
- Rolled back: ${result.summary.rolledBack}
- Duration: ${result.summary.duration}ms`;

      let detailsText = '\n\n📋 Operation Details:\n';
      result.results.forEach((res: any, idx: number) => {
        const icon = res.success ? '✅' : '❌';
        const rollbackInfo = res.rollbackExecuted !== undefined ?
          (res.rollbackExecuted ? ' [ROLLED BACK]' : ' [ROLLBACK FAILED]') : '';
        detailsText += `${idx + 1}. ${icon} ${res.path}${rollbackInfo}\n`;
        if (res.error) {
          detailsText += `   Error: ${res.error}\n`;
        }
      });

      if (result.rollbackResults && result.rollbackResults.length > 0) {
        detailsText += '\n🔄 Rollback Operations:\n';
        result.rollbackResults.forEach((res: any, idx: number) => {
          const icon = res.rollbackExecuted ? '✅' : '❌';
          detailsText += `${idx + 1}. ${icon} Rollback ${res.path}\n`;
        });
      }

      return {
        content: [{
          type: 'text',
          text: `Virtual Transaction ${result.transactionId}: ${statusText}${summaryText}${detailsText}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error executing transaction: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// === 벌크 오퍼레이션 도구들 ===

// 벌크 읽기 도구
server.registerTool(
  'bulk-read-secrets',
  {
    title: 'Bulk Read Vault Secrets',
    description: 'Read multiple secrets from Vault in a single operation. Best-effort execution - continues even if some paths fail.',
    inputSchema: {
      paths: z.array(z.string()).describe('Array of secret paths to read from (e.g., ["secret/data/app1/config", "secret/data/app2/database"])')
    },
  },
  async ({ paths }: { paths: string[] }) => {
    try {
      const result = await vaultClient.bulkReadSecrets(paths);

      const statusText = result.success ? '✅ ALL SUCCESSFUL' : '⚠️ PARTIALLY SUCCESSFUL';
      const summaryText = `\n📊 Summary:
- Total paths: ${result.summary.total}
- Succeeded: ${result.summary.succeeded}
- Failed: ${result.summary.failed}
- Duration: ${result.summary.duration}ms`;

      let detailsText = '\n\n📋 Results:\n';
      result.results.forEach((res: any, idx: number) => {
        const icon = res.success ? '✅' : '❌';
        detailsText += `${idx + 1}. ${icon} ${res.path}\n`;
        if (res.success && res.data) {
          detailsText += `   Data: ${JSON.stringify(res.data, null, 2)}\n`;
        } else if (res.error) {
          detailsText += `   Error: ${res.error}\n`;
        }
      });

      return {
        content: [{
          type: 'text',
          text: `Bulk Read Operation: ${statusText}${summaryText}${detailsText}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error in bulk read: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// 벌크 쓰기 도구
server.registerTool(
  'bulk-write-secrets',
  {
    title: 'Bulk Write Vault Secrets',
    description: 'Write multiple secrets to Vault in a single operation. Best-effort execution - continues even if some operations fail.',
    inputSchema: {
      operations: z.array(z.object({
        path: z.string().describe('Path where to store the secret (e.g., "secret/data/app1/config")'),
        data: z.record(z.any()).describe('Secret data as key-value pairs (e.g., {"username": "admin", "password": "secret123"})'),
        type: z.enum(['create', 'update']).optional().describe('Operation type: "create" for new secrets, "update" for existing ones (optional - defaults to create/update)')
      })).describe('Array of write operations. Each operation must have "path" and "data" fields. Example: [{"path": "secret/data/app1", "data": {"key": "value"}}]')
    },
  },
  async ({ operations }: { operations: Array<{ path: string; data: Record<string, any>; type?: 'create' | 'update' }> }) => {
    try {
      const result = await vaultClient.bulkWriteSecrets(operations);

      const statusText = result.success ? '✅ ALL SUCCESSFUL' : '⚠️ PARTIALLY SUCCESSFUL';
      const summaryText = `\n📊 Summary:
- Total operations: ${result.summary.total}
- Succeeded: ${result.summary.succeeded}
- Failed: ${result.summary.failed}
- Duration: ${result.summary.duration}ms`;

      let detailsText = '\n\n📋 Results:\n';
      result.results.forEach((res: any, idx: number) => {
        const icon = res.success ? '✅' : '❌';
        detailsText += `${idx + 1}. ${icon} ${res.path}\n`;
        if (res.error) {
          detailsText += `   Error: ${res.error}\n`;
        }
      });

      return {
        content: [{
          type: 'text',
          text: `Bulk Write Operation: ${statusText}${summaryText}${detailsText}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error in bulk write: ${error.message}`,
        }],
        isError: true,
      };
    }
  }
);

// 벌크 삭제 도구
server.registerTool(
  'bulk-delete-secrets',
  {
    title: 'Bulk Delete Vault Secrets',
    description: 'Delete multiple secrets from Vault in a single operation. Best-effort execution - continues even if some deletions fail.',
    inputSchema: {
      paths: z.array(z.string()).describe('Array of secret paths to delete (e.g., ["secret/data/app1/config", "secret/data/app2/database"])')
    },
  },
  async ({ paths }: { paths: string[] }) => {
    try {
      const result = await vaultClient.bulkDeleteSecrets(paths);

      const statusText = result.success ? '✅ ALL SUCCESSFUL' : '⚠️ PARTIALLY SUCCESSFUL';
      const summaryText = `\n📊 Summary:
- Total paths: ${result.summary.total}
- Succeeded: ${result.summary.succeeded}
- Failed: ${result.summary.failed}
- Duration: ${result.summary.duration}ms`;

      let detailsText = '\n\n📋 Results:\n';
      result.results.forEach((res: any, idx: number) => {
        const icon = res.success ? '✅' : '❌';
        detailsText += `${idx + 1}. ${icon} ${res.path}\n`;
        if (res.error) {
          detailsText += `   Error: ${res.error}\n`;
        }
      });

      return {
        content: [{
          type: 'text',
          text: `Bulk Delete Operation: ${statusText}${summaryText}${detailsText}`,
        }],
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error in bulk delete: ${error.message}`,
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
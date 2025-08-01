import vault from 'node-vault';
import { VaultConfig } from './config.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface VaultSecret {
  path: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export type OperationType = 'create' | 'update' | 'delete' | 'read';

export interface RollbackOperation {
  type: OperationType;
  path: string;
  data?: Record<string, any>;
  originalData?: Record<string, any>; // 원본 데이터 (update/delete 시 복원용)
}

export interface TransactionalOperation {
  // Forward operation (실행할 작업)
  forward: {
    type: OperationType;
    path: string;
    data?: Record<string, any>;
  };
  // Rollback operation (실패 시 롤백 작업)
  rollback: RollbackOperation;
}

export interface BulkOperation {
  path: string;
  data?: Record<string, any>;
  type?: OperationType;
}

export interface BulkOperationResult {
  path: string;
  success: boolean;
  error?: string;
  data?: any;
  rollbackExecuted?: boolean;
}

export interface BulkOperationSummary {
  success: boolean;
  results: BulkOperationResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    duration: number;
  };
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'secret';
  children?: TreeNode[];
}

export interface ExploreResult {
  tree: TreeNode[];
  totalSecrets: number;
  totalFolders: number;
  depth: number;
}

export interface YamlExportResult {
  success: boolean;
  filePath: string;
  secretsCount: number;
  error?: string;
}

export interface YamlImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
}

export interface TransactionResult {
  success: boolean;
  transactionId: string;
  results: BulkOperationResult[];
  rollbackResults?: BulkOperationResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    rolledBack: number;
    duration: number;
  };
}

export interface BatchState {
  id: string;
  operations: (BulkOperation | TransactionalOperation)[];
  completed: number;
  failed: Array<{index: number, path: string, error: string}>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial' | 'rolling_back' | 'rolled_back';
  startTime: number;
  endTime?: number;
  rollbackStartTime?: number;
  rollbackEndTime?: number;
}

export class VaultClient {
  private client: any;
  private config: VaultConfig;
  private batchStates: Map<string, BatchState> = new Map();

  constructor(config: VaultConfig) {
    this.config = config;
    this.client = vault({
      endpoint: config.endpoint,
      token: config.token,
    });
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isPathAllowed(path: string): boolean {
    if (!this.config.allowedPaths || this.config.allowedPaths.length === 0) {
      return true;
    }

    return this.config.allowedPaths.some(allowedPath =>
      path.startsWith(allowedPath)
    );
  }

  private checkReadPermission(): void {
    if (!this.config.permissions.read) {
      throw new Error('Read operations are not permitted');
    }
  }

  private checkWritePermission(): void {
    if (!this.config.permissions.write) {
      throw new Error('Write operations are not permitted');
    }
  }

  async readSecret(path: string): Promise<VaultSecret | null> {
    this.checkReadPermission();

    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      const result = await this.client.read(path);

      return {
        path,
        data: result.data?.data || result.data || {},
        metadata: result.data?.metadata,
      };
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return null;
      }
      throw new Error(`Failed to read secret at '${path}': ${error.message}`);
    }
  }

  async writeSecret(path: string, data: Record<string, any>): Promise<void> {
    this.checkWritePermission();

    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      // KV v2 엔진의 경우 data 래핑이 필요
      await this.client.write(path, { data });
    } catch (error: any) {
      throw new Error(`Failed to write secret to '${path}': ${error.message}`);
    }
  }

  async deleteSecret(path: string): Promise<void> {
    this.checkWritePermission();

    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      await this.client.delete(path);
    } catch (error: any) {
      throw new Error(`Failed to delete secret at '${path}': ${error.message}`);
    }
  }

  async listSecrets(path: string): Promise<string[]> {
    this.checkReadPermission();

    if (!this.isPathAllowed(path)) {
      throw new Error(`Access to path '${path}' is not allowed`);
    }

    try {
      const result = await this.client.list(path);
      return result.data?.keys || [];
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        return [];
      }
      throw new Error(`Failed to list secrets at '${path}': ${error.message}`);
    }
  }

  async getHealth(): Promise<{ initialized: boolean; sealed: boolean; standby: boolean }> {
    try {
      const result = await this.client.health();
      return {
        initialized: result.initialized,
        sealed: result.sealed,
        standby: result.standby,
      };
    } catch (error: any) {
      throw new Error(`Failed to get Vault health: ${error.message}`);
    }
  }

  // === 가상 트랜잭션 메서드들 ===

  /**
   * 가상 트랜잭션 실행 - 롤백 오퍼레이션과 함께
   */
  async executeTransaction(operations: TransactionalOperation[]): Promise<TransactionResult> {
    const transactionId = this.generateBatchId();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    const completedOperations: Array<{index: number, operation: TransactionalOperation}> = [];

    console.error(`[Transaction ${transactionId}] Starting with ${operations.length} operations`);

    try {
      // Phase 1: Execute forward operations
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const { forward } = operation;

        if (!this.isPathAllowed(forward.path)) {
          throw new Error(`Access to path '${forward.path}' is not allowed`);
        }

        try {
          let result: any = null;

          switch (forward.type) {
            case 'create':
            case 'update':
              this.checkWritePermission();
              await this.client.write(forward.path, { data: forward.data });
              result = { written: true };
              break;

            case 'delete':
              this.checkWritePermission();
              await this.client.delete(forward.path);
              result = { deleted: true };
              break;

            case 'read':
              this.checkReadPermission();
              const readResult = await this.client.read(forward.path);
              result = readResult.data?.data || readResult.data || {};
              break;

            default:
              throw new Error(`Unsupported operation type: ${forward.type}`);
          }

          results.push({
            path: forward.path,
            success: true,
            data: result
          });

          completedOperations.push({ index: i, operation });
          console.error(`[Transaction ${transactionId}] ✓ ${forward.type} ${forward.path}`);

        } catch (error: any) {
          console.error(`[Transaction ${transactionId}] ✗ ${forward.type} ${forward.path}: ${error.message}`);

          results.push({
            path: forward.path,
            success: false,
            error: error.message
          });

          // 실패 시 롤백 실행
          await this.executeRollback(transactionId, completedOperations, results);

          const duration = Date.now() - startTime;
          return {
            success: false,
            transactionId,
            results,
            rollbackResults: results.filter(r => r.rollbackExecuted),
            summary: {
              total: operations.length,
              succeeded: completedOperations.length,
              failed: 1,
              rolledBack: completedOperations.length,
              duration
            }
          };
        }
      }

      // 모든 작업이 성공한 경우
      const duration = Date.now() - startTime;
      console.error(`[Transaction ${transactionId}] ✓ All operations completed successfully in ${duration}ms`);

      return {
        success: true,
        transactionId,
        results,
        summary: {
          total: operations.length,
          succeeded: operations.length,
          failed: 0,
          rolledBack: 0,
          duration
        }
      };

    } catch (error: any) {
      console.error(`[Transaction ${transactionId}] Fatal error: ${error.message}`);

      // 치명적 오류 시에도 롤백 시도
      await this.executeRollback(transactionId, completedOperations, results);

      const duration = Date.now() - startTime;
      return {
        success: false,
        transactionId,
        results,
        rollbackResults: results.filter(r => r.rollbackExecuted),
        summary: {
          total: operations.length,
          succeeded: completedOperations.length,
          failed: operations.length - completedOperations.length,
          rolledBack: completedOperations.length,
          duration
        }
      };
    }
  }

  /**
   * 롤백 실행
   */
  private async executeRollback(
    transactionId: string,
    completedOperations: Array<{index: number, operation: TransactionalOperation}>,
    results: BulkOperationResult[]
  ): Promise<void> {
    console.error(`[Transaction ${transactionId}] Starting rollback for ${completedOperations.length} operations`);

    // 역순으로 롤백 실행 (LIFO)
    for (let i = completedOperations.length - 1; i >= 0; i--) {
      const { operation } = completedOperations[i];
      const { rollback } = operation;

      try {
        switch (rollback.type) {
          case 'create':
            // 롤백: 생성된 것을 삭제
            if (rollback.data) {
              await this.client.write(rollback.path, { data: rollback.data });
              console.error(`[Transaction ${transactionId}] Rollback: Created ${rollback.path}`);
            }
            break;

          case 'update':
            // 롤백: 원본 데이터로 복원
            if (rollback.originalData) {
              await this.client.write(rollback.path, { data: rollback.originalData });
              console.error(`[Transaction ${transactionId}] Rollback: Restored ${rollback.path}`);
            }
            break;

          case 'delete':
            // 롤백: 삭제된 것을 복원
            if (rollback.originalData) {
              await this.client.write(rollback.path, { data: rollback.originalData });
              console.error(`[Transaction ${transactionId}] Rollback: Restored deleted ${rollback.path}`);
            }
            break;

          case 'read':
            // 읽기는 롤백할 필요 없음
            console.error(`[Transaction ${transactionId}] Rollback: Skipping read operation ${rollback.path}`);
            break;

          default:
            console.error(`[Transaction ${transactionId}] Rollback: Unknown type ${rollback.type} for ${rollback.path}`);
        }

        // 결과에 롤백 실행 표시
        const resultIndex = results.findIndex(r => r.path === operation.forward.path);
        if (resultIndex >= 0) {
          results[resultIndex].rollbackExecuted = true;
        }

      } catch (rollbackError: any) {
        console.error(`[Transaction ${transactionId}] Rollback failed for ${rollback.path}: ${rollbackError.message}`);

        // 롤백 실패도 결과에 기록
        const resultIndex = results.findIndex(r => r.path === operation.forward.path);
        if (resultIndex >= 0) {
          results[resultIndex].rollbackExecuted = false;
          results[resultIndex].error = `${results[resultIndex].error}; Rollback failed: ${rollbackError.message}`;
        }
      }
    }

    console.error(`[Transaction ${transactionId}] Rollback completed`);
  }

  // === 새로운 탐색 및 YAML 기능들 ===

  /**
   * 재귀적으로 경로를 탐색하여 트리 구조로 반환
   */
  async exploreSecrets(basePath: string, maxDepth: number = 10): Promise<ExploreResult> {
    this.checkReadPermission();

    if (!this.isPathAllowed(basePath)) {
      throw new Error(`Access to path '${basePath}' is not allowed`);
    }

    console.error(`[Explore] Starting exploration of ${basePath} with max depth ${maxDepth}`);

    const tree: TreeNode[] = [];
    let totalSecrets = 0;
    let totalFolders = 0;
    let currentDepth = 0;

    const exploreRecursive = async (currentPath: string, depth: number): Promise<TreeNode[]> => {
      if (depth > maxDepth) {
        console.error(`[Explore] Max depth ${maxDepth} reached at ${currentPath}`);
        return [];
      }

      currentDepth = Math.max(currentDepth, depth);

      try {
        const keys = await this.client.list(currentPath);
        const children: TreeNode[] = [];

        if (!keys.data?.keys) {
          return [];
        }

        for (const key of keys.data.keys) {
          const fullPath = currentPath.endsWith('/') ? `${currentPath}${key}` : `${currentPath}/${key}`;

          if (key.endsWith('/')) {
            // 폴더인 경우
            totalFolders++;
            const subChildren = await exploreRecursive(fullPath, depth + 1);
            children.push({
              name: key.slice(0, -1), // '/' 제거
              path: fullPath,
              type: 'folder',
              children: subChildren
            });
          } else {
            // 시크릿인 경우
            totalSecrets++;
            children.push({
              name: key,
              path: fullPath,
              type: 'secret'
            });
          }
        }

        return children;
      } catch (error: any) {
        if (error.response?.statusCode === 404) {
          return [];
        }
        console.error(`[Explore] Error exploring ${currentPath}: ${error.message}`);
        return [];
      }
    };

    const rootChildren = await exploreRecursive(basePath, 0);
    tree.push(...rootChildren);

    console.error(`[Explore] Completed: ${totalSecrets} secrets, ${totalFolders} folders, depth ${currentDepth}`);

    return {
      tree,
      totalSecrets,
      totalFolders,
      depth: currentDepth
    };
  }

  /**
   * 지정된 경로의 시크릿들을 YAML 파일로 내보내기
   */
  async exportSecretsToYaml(basePath: string, outputPath: string, recursive: boolean = true): Promise<YamlExportResult> {
    this.checkReadPermission();

    if (!this.isPathAllowed(basePath)) {
      throw new Error(`Access to path '${basePath}' is not allowed`);
    }

    // 출력 경로가 허용된 워킹 디렉토리 내에 있는지 확인 (보안상 제한)
    const allowedWorkingDir = this.config.allowedWorkingDirectory || process.cwd();
    const resolvedOutputPath = path.resolve(outputPath);
    const resolvedWorkingDir = path.resolve(allowedWorkingDir);

    if (!resolvedOutputPath.startsWith(resolvedWorkingDir)) {
      throw new Error(`Output path must be within the allowed working directory: ${resolvedWorkingDir}`);
    }

    console.error(`[Export] Starting YAML export from ${basePath} to ${resolvedOutputPath}`);

    try {
      const secrets: Record<string, any> = {};
      let secretsCount = 0;

      // Vault KV v2 경로 변환 함수
      const convertToDataPath = (metadataPath: string): string => {
        if (metadataPath.startsWith('secret/metadata/')) {
          return metadataPath.replace('secret/metadata/', 'secret/data/');
        }
        return metadataPath;
      };

      const collectSecrets = async (currentPath: string, targetObject: Record<string, any>) => {
        try {
          const keys = await this.client.list(currentPath);

          if (!keys.data?.keys) {
            return;
          }

          for (const key of keys.data.keys) {
            const fullPath = currentPath.endsWith('/') ? `${currentPath}${key}` : `${currentPath}/${key}`;

            if (key.endsWith('/') && recursive) {
              // 폴더인 경우 - 재귀적으로 탐색
              const folderName = key.slice(0, -1);
              targetObject[folderName] = {};
              await collectSecrets(fullPath, targetObject[folderName]);
            } else if (!key.endsWith('/')) {
              // 시크릿인 경우
              try {
                // 메타데이터 경로를 데이터 경로로 변환
                const dataPath = convertToDataPath(fullPath);
                console.error(`[Export] Reading secret from data path: ${dataPath}`);

                const secret = await this.client.read(dataPath);
                const secretData = secret.data?.data || secret.data || {};
                targetObject[key] = secretData;
                secretsCount++;
                console.error(`[Export] Collected secret: ${dataPath}`);
              } catch (secretError: any) {
                console.error(`[Export] Failed to read secret ${fullPath}: ${secretError.message}`);
                targetObject[key] = { error: `Failed to read: ${secretError.message}` };
              }
            }
          }
        } catch (error: any) {
          if (error.response?.statusCode !== 404) {
            console.error(`[Export] Error listing ${currentPath}: ${error.message}`);
          }
        }
      };

      await collectSecrets(basePath, secrets);

      // YAML로 변환하고 파일에 저장
      const yamlContent = yaml.dump(secrets, {
        indent: 2,
        sortKeys: true,
        lineWidth: -1 // 무제한 너비
      });

      // 출력 디렉토리 생성
      const outputDir = path.dirname(resolvedOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(resolvedOutputPath, yamlContent, 'utf8');

      console.error(`[Export] Successfully exported ${secretsCount} secrets to ${resolvedOutputPath}`);

      return {
        success: true,
        filePath: resolvedOutputPath,
        secretsCount
      };

    } catch (error: any) {
      console.error(`[Export] Export failed: ${error.message}`);
      return {
        success: false,
        filePath: resolvedOutputPath,
        secretsCount: 0,
        error: error.message
      };
    }
  }

  /**
   * YAML 파일에서 시크릿들을 Vault로 가져오기
   */
  async importSecretsFromYaml(yamlFilePath: string, basePath: string, overwrite: boolean = false): Promise<YamlImportResult> {
    this.checkWritePermission();

    if (!this.isPathAllowed(basePath)) {
      throw new Error(`Access to path '${basePath}' is not allowed`);
    }

    // 입력 파일이 허용된 워킹 디렉토리 내에 있는지 확인 (보안상 제한)
    const allowedWorkingDir = this.config.allowedWorkingDirectory || process.cwd();
    const resolvedYamlPath = path.resolve(yamlFilePath);
    const resolvedWorkingDir = path.resolve(allowedWorkingDir);

    if (!resolvedYamlPath.startsWith(resolvedWorkingDir)) {
      throw new Error(`Input file must be within the allowed working directory: ${resolvedWorkingDir}`);
    }

    console.error(`[Import] Starting YAML import from ${resolvedYamlPath} to ${basePath}`);

    try {
      if (!fs.existsSync(resolvedYamlPath)) {
        throw new Error(`YAML file not found: ${resolvedYamlPath}`);
      }

      const yamlContent = fs.readFileSync(resolvedYamlPath, 'utf8');
      const data = yaml.load(yamlContent) as Record<string, any>;

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid YAML content: expected object at root level');
      }

      let imported = 0;
      let failed = 0;
      const errors: Array<{ path: string; error: string }> = [];

      const importRecursive = async (obj: Record<string, any>, currentPath: string) => {
        for (const [key, value] of Object.entries(obj)) {
          const secretPath = currentPath.endsWith('/') ? `${currentPath}${key}` : `${currentPath}/${key}`;

          if (!this.isPathAllowed(secretPath)) {
            errors.push({
              path: secretPath,
              error: `Access to path '${secretPath}' is not allowed`
            });
            failed++;
            continue;
          }

          try {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              // 중첩된 객체인 경우 - 폴더 구조로 처리할지 단일 시크릿으로 처리할지 결정
              const hasSimpleValues = Object.values(value).some(v =>
                typeof v !== 'object' || Array.isArray(v) || v === null
              );

              if (hasSimpleValues) {
                // 단일 시크릿으로 처리
                if (!overwrite) {
                  // 기존 시크릿 확인
                  try {
                    await this.client.read(secretPath);
                    console.error(`[Import] Skipping existing secret: ${secretPath}`);
                    continue;
                  } catch (readError: any) {
                    // 404는 정상 (시크릿이 존재하지 않음)
                    if (readError.response?.statusCode !== 404) {
                      throw readError;
                    }
                  }
                }

                await this.client.write(secretPath, { data: value });
                imported++;
                console.error(`[Import] Imported secret: ${secretPath}`);
              } else {
                // 폴더 구조로 재귀 처리
                await importRecursive(value, secretPath);
              }
            } else {
              // 단순 값인 경우
              if (!overwrite) {
                try {
                  await this.client.read(secretPath);
                  console.error(`[Import] Skipping existing secret: ${secretPath}`);
                  continue;
                } catch (readError: any) {
                  if (readError.response?.statusCode !== 404) {
                    throw readError;
                  }
                }
              }

              await this.client.write(secretPath, { data: { value } });
              imported++;
              console.error(`[Import] Imported simple secret: ${secretPath}`);
            }
          } catch (error: any) {
            errors.push({
              path: secretPath,
              error: error.message
            });
            failed++;
            console.error(`[Import] Failed to import ${secretPath}: ${error.message}`);
          }
        }
      };

      await importRecursive(data, basePath);

      console.error(`[Import] Completed: ${imported} imported, ${failed} failed`);

      return {
        success: failed === 0,
        imported,
        failed,
        errors
      };

    } catch (error: any) {
      console.error(`[Import] Import failed: ${error.message}`);
      return {
        success: false,
        imported: 0,
        failed: 1,
        errors: [{ path: yamlFilePath, error: error.message }]
      };
    }
  }

  // === 기존 벌크 오퍼레이션 메서드들 ===

  /**
   * 벌크 읽기 (Best-Effort)
   */
  async bulkReadSecrets(paths: string[]): Promise<BulkOperationSummary> {
    this.checkReadPermission();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    let succeeded = 0;

    console.error(`Starting bulk read for ${paths.length} paths`);

    for (const path of paths) {
      if (!this.isPathAllowed(path)) {
        results.push({
          path,
          success: false,
          error: `Access to path '${path}' is not allowed`
        });
        continue;
      }

      try {
        const result = await this.client.read(path);
        results.push({
          path,
          success: true,
          data: result.data?.data || result.data || {}
        });
        succeeded++;
      } catch (error: any) {
        results.push({
          path,
          success: false,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.error(`Bulk read completed: ${succeeded}/${paths.length} successful in ${duration}ms`);

    return {
      success: succeeded === paths.length,
      results,
      summary: {
        total: paths.length,
        succeeded,
        failed: paths.length - succeeded,
        duration
      }
    };
  }

  /**
   * 벌크 쓰기 (Best-Effort)
   */
  async bulkWriteSecrets(operations: BulkOperation[]): Promise<BulkOperationSummary> {
    this.checkWritePermission();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    let succeeded = 0;

    console.error(`Starting bulk write for ${operations.length} operations`);

    for (const operation of operations) {
      if (!this.isPathAllowed(operation.path)) {
        results.push({
          path: operation.path,
          success: false,
          error: `Access to path '${operation.path}' is not allowed`
        });
        continue;
      }

      try {
        await this.client.write(operation.path, { data: operation.data });
        results.push({
          path: operation.path,
          success: true,
          data: { written: true }
        });
        succeeded++;
      } catch (error: any) {
        results.push({
          path: operation.path,
          success: false,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.error(`Bulk write completed: ${succeeded}/${operations.length} successful in ${duration}ms`);

    return {
      success: succeeded === operations.length,
      results,
      summary: {
        total: operations.length,
        succeeded,
        failed: operations.length - succeeded,
        duration
      }
    };
  }

  /**
   * 벌크 삭제 (Best-Effort)
   */
  async bulkDeleteSecrets(paths: string[]): Promise<BulkOperationSummary> {
    this.checkWritePermission();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    let succeeded = 0;

    console.error(`Starting bulk delete for ${paths.length} paths`);

    for (const path of paths) {
      if (!this.isPathAllowed(path)) {
        results.push({
          path,
          success: false,
          error: `Access to path '${path}' is not allowed`
        });
        continue;
      }

      try {
        await this.client.delete(path);
        results.push({
          path,
          success: true,
          data: { deleted: true }
        });
        succeeded++;
      } catch (error: any) {
        results.push({
          path,
          success: false,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.error(`Bulk delete completed: ${succeeded}/${paths.length} successful in ${duration}ms`);

    return {
      success: succeeded === paths.length,
      results,
      summary: {
        total: paths.length,
        succeeded,
        failed: paths.length - succeeded,
        duration
      }
    };
  }
}
import vault from 'node-vault';
import { VaultConfig } from './config.js';

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
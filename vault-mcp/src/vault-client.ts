import * as fs from "fs";
import * as yaml from "js-yaml";
import vault from "node-vault";
import * as path from "path";
import {
  VaultConnectionError,
  VaultPathNotAllowedError,
  VaultPermissionError,
  createVaultErrorFromResponse,
  logError,
} from "./errors.js";
import { log } from "./logger.js";
import {
  BatchState,
  BulkOperation,
  BulkOperationResult,
  BulkOperationSummary,
  DryRunOperationResult,
  DryRunResult,
  DryRunTransactionResult,
  ExploreResult,
  OperationType,
  RollbackOperation,
  TransactionOperation,
  TransactionResult,
  TreeNode,
  VaultConfig,
  VaultHealthStatus,
  VaultSecret,
  YamlExportResult,
  YamlImportResult,
} from "./types.js";
import {
  generateTransactionId,
  isPathAllowed,
  normalizeErrorMessage,
} from "./utils.js";

// 내부적으로 사용되는 완전한 트랜잭션 오퍼레이션 (롤백 포함)
interface InternalTransactionalOperation {
  // Forward operation (실행할 작업)
  forward: {
    type: OperationType;
    path: string;
    data?: Record<string, any>;
  };
  // Rollback operation (실패 시 롤백 작업) - 시스템이 자동 생성
  rollback: RollbackOperation;
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

  private isPathAllowed(path: string): boolean {
    return isPathAllowed(path, this.config.allowedPaths);
  }

  private checkReadPermission(): void {
    if (!this.config.permissions.read) {
      throw new VaultPermissionError("Read operations are not permitted");
    }
  }

  private checkWritePermission(): void {
    if (!this.config.permissions.write) {
      throw new VaultPermissionError("Write operations are not permitted");
    }
  }

  async readSecret(path: string): Promise<VaultSecret | null> {
    this.checkReadPermission();

    if (!this.isPathAllowed(path)) {
      throw new VaultPathNotAllowedError(path);
    }

    try {
      log.debug(`Reading secret from: ${path}`, "VAULT_CLIENT");
      const result = await this.client.read(path);

      return {
        path,
        data: result.data?.data || result.data || {},
        metadata: result.data?.metadata,
      };
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        log.debug(`Secret not found at: ${path}`, "VAULT_CLIENT");
        return null;
      }

      const vaultError = createVaultErrorFromResponse(error, path);
      logError(vaultError, "VAULT_CLIENT");
      throw vaultError;
    }
  }

  async writeSecret(
    path: string,
    data: Record<string, any>,
    dryRun = false
  ): Promise<void | DryRunResult> {
    this.checkWritePermission();

    if (!this.isPathAllowed(path)) {
      throw new VaultPathNotAllowedError(path);
    }

    if (dryRun) {
      return this.simulateWriteSecret(path, data);
    }

    try {
      log.debug(`Writing secret to: ${path}`, "VAULT_CLIENT");
      // KV v2 엔진의 경우 data 래핑이 필요
      await this.client.write(path, { data });
    } catch (error: any) {
      const vaultError = createVaultErrorFromResponse(error, path);
      logError(vaultError, "VAULT_CLIENT");
      throw vaultError;
    }
  }

  async deleteSecret(
    path: string,
    dryRun = false
  ): Promise<void | DryRunResult> {
    this.checkWritePermission();

    if (!this.isPathAllowed(path)) {
      throw new VaultPathNotAllowedError(path);
    }

    if (dryRun) {
      return this.simulateDeleteSecret(path);
    }

    try {
      log.debug(`Deleting secret from: ${path}`, "VAULT_CLIENT");
      await this.client.delete(path);
    } catch (error: any) {
      const vaultError = createVaultErrorFromResponse(error, path);
      logError(vaultError, "VAULT_CLIENT");
      throw vaultError;
    }
  }

  async listSecrets(path: string): Promise<string[]> {
    this.checkReadPermission();

    if (!this.isPathAllowed(path)) {
      throw new VaultPathNotAllowedError(path);
    }

    try {
      log.debug(`Listing secrets from: ${path}`, "VAULT_CLIENT");
      const result = await this.client.list(path);
      return result.data?.keys || [];
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        log.debug(`No secrets found at: ${path}`, "VAULT_CLIENT");
        return [];
      }

      const vaultError = createVaultErrorFromResponse(error, path);
      logError(vaultError, "VAULT_CLIENT");
      throw vaultError;
    }
  }

  async getHealth(): Promise<VaultHealthStatus> {
    try {
      log.debug("Checking Vault health status", "VAULT_CLIENT");
      const result = await this.client.health();
      return {
        initialized: result.initialized,
        sealed: result.sealed,
        standby: result.standby,
      };
    } catch (error: any) {
      const vaultError = new VaultConnectionError(
        `Failed to get Vault health: ${normalizeErrorMessage(error)}`
      );
      logError(vaultError, "VAULT_CLIENT");
      throw vaultError;
    }
  }

  // === Dry Run 시뮬레이션 메서드들 ===

  /**
   * 쓰기 작업 시뮬레이션
   */
  private async simulateWriteSecret(
    path: string,
    data: Record<string, any>
  ): Promise<DryRunResult> {
    log.debug(
      `Simulating write operation for: ${path}`,
      "VAULT_CLIENT_DRY_RUN"
    );

    const validationErrors: string[] = [];
    let wouldSucceed = true;
    let existingData: Record<string, any> | undefined;
    let pathExists = false;

    try {
      // 1. 데이터 유효성 검증
      if (!data || typeof data !== "object") {
        validationErrors.push("Invalid data: must be a non-null object");
        wouldSucceed = false;
      }

      // 2. JSON 직렬화 가능성 검증
      try {
        JSON.stringify(data);
      } catch {
        validationErrors.push("Data is not JSON serializable");
        wouldSucceed = false;
      }

      // 3. 현재 상태 확인 (실제 READ 수행)
      try {
        const currentSecret = await this.readSecret(path);
        if (currentSecret) {
          pathExists = true;
          existingData = currentSecret.data;
        }
      } catch (error: any) {
        // 404가 아닌 다른 오류면 실패로 처리
        if (error.response?.statusCode !== 404) {
          validationErrors.push(
            `Failed to check existing data: ${error.message}`
          );
          wouldSucceed = false;
        }
      }

      return {
        dryRun: true,
        wouldSucceed,
        simulatedData: wouldSucceed ? data : undefined,
        validationErrors:
          validationErrors.length > 0 ? validationErrors : undefined,
        existingData,
        pathExists,
      };
    } catch (error: any) {
      return {
        dryRun: true,
        wouldSucceed: false,
        validationErrors: [`Simulation failed: ${error.message}`],
        pathExists,
      };
    }
  }

  /**
   * 삭제 작업 시뮬레이션
   */
  private async simulateDeleteSecret(path: string): Promise<DryRunResult> {
    log.debug(
      `Simulating delete operation for: ${path}`,
      "VAULT_CLIENT_DRY_RUN"
    );

    const validationErrors: string[] = [];
    let wouldSucceed = true;
    let existingData: Record<string, any> | undefined;
    let pathExists = false;

    try {
      // 현재 상태 확인 (실제 READ 수행)
      try {
        const currentSecret = await this.readSecret(path);
        if (currentSecret) {
          pathExists = true;
          existingData = currentSecret.data;
        } else {
          pathExists = false;
          validationErrors.push("Secret does not exist at the specified path");
          wouldSucceed = false;
        }
      } catch (error: any) {
        if (error.response?.statusCode === 404) {
          pathExists = false;
          validationErrors.push("Secret does not exist at the specified path");
          wouldSucceed = false;
        } else {
          validationErrors.push(
            `Failed to check existing data: ${error.message}`
          );
          wouldSucceed = false;
        }
      }

      return {
        dryRun: true,
        wouldSucceed,
        simulatedData: wouldSucceed ? { deleted: true } : undefined,
        validationErrors:
          validationErrors.length > 0 ? validationErrors : undefined,
        existingData,
        pathExists,
      };
    } catch (error: any) {
      return {
        dryRun: true,
        wouldSucceed: false,
        validationErrors: [`Simulation failed: ${error.message}`],
        pathExists,
      };
    }
  }

  /**
   * 단일 작업 시뮬레이션
   */
  async simulateOperation(
    operation: TransactionOperation
  ): Promise<DryRunOperationResult> {
    const { type, path, data } = operation;

    // 권한 및 경로 검증 (실제와 동일)
    try {
      if (type !== "read") {
        this.checkWritePermission();
      } else {
        this.checkReadPermission();
      }

      if (!this.isPathAllowed(path)) {
        throw new VaultPathNotAllowedError(path);
      }
    } catch (error: any) {
      return {
        path,
        success: false,
        dryRun: true,
        data: {
          dryRun: true,
          wouldSucceed: false,
          validationErrors: [error.message],
          pathExists: false,
        },
        wouldSucceed: false,
        validationErrors: [error.message],
      };
    }

    let simulationResult: DryRunResult;

    switch (type) {
      case "create":
      case "update":
        if (!data) {
          simulationResult = {
            dryRun: true,
            wouldSucceed: false,
            validationErrors: ["Data is required for create/update operations"],
            pathExists: false,
          };
        } else {
          simulationResult = await this.simulateWriteSecret(path, data);

          // CREATE의 경우 이미 존재하면 실패
          if (type === "create" && simulationResult.pathExists) {
            simulationResult = {
              ...simulationResult,
              wouldSucceed: false,
              validationErrors: [
                ...(simulationResult.validationErrors || []),
                "Cannot create: secret already exists at this path",
              ],
            };
          }

          // UPDATE의 경우 존재하지 않으면 실패
          if (type === "update" && !simulationResult.pathExists) {
            simulationResult = {
              ...simulationResult,
              wouldSucceed: false,
              validationErrors: [
                ...(simulationResult.validationErrors || []),
                "Cannot update: secret does not exist at this path",
              ],
            };
          }
        }
        break;

      case "delete":
        simulationResult = await this.simulateDeleteSecret(path);
        break;

      case "read":
        // READ는 실제로 수행 (변경 작업이 아니므로)
        try {
          const secret = await this.readSecret(path);
          simulationResult = {
            dryRun: true,
            wouldSucceed: true,
            simulatedData: secret?.data,
            pathExists: !!secret,
            existingData: secret?.data,
          };
        } catch (error: any) {
          simulationResult = {
            dryRun: true,
            wouldSucceed: false,
            validationErrors: [error.message],
            pathExists: false,
          };
        }
        break;

      default:
        simulationResult = {
          dryRun: true,
          wouldSucceed: false,
          validationErrors: [`Unsupported operation type: ${type}`],
          pathExists: false,
        };
    }

    return {
      path,
      success: simulationResult.wouldSucceed,
      dryRun: true,
      data: simulationResult,
      wouldSucceed: simulationResult.wouldSucceed,
      validationErrors: simulationResult.validationErrors,
    };
  }

  // === 가상 트랜잭션 메서드들 ===

  /**
   * 단순 오퍼레이션에서 롤백 오퍼레이션을 자동으로 계산
   */
  private async calculateRollbackOperation(
    operation: TransactionOperation
  ): Promise<RollbackOperation> {
    const { type, path, data } = operation;

    switch (type) {
      case "create":
        // 생성 작업의 롤백 = 삭제
        return {
          type: "delete",
          path,
        };

      case "update":
        // 업데이트 작업의 롤백 = 원본 데이터로 복원
        try {
          const existingSecret = await this.readSecret(path);
          return {
            type: "update",
            path,
            originalData: existingSecret?.data || {},
          };
        } catch (error) {
          // 기존 데이터를 읽을 수 없으면 삭제로 롤백
          log.warn(
            `Could not read existing data for rollback, will delete on rollback: ${path}`,
            "VAULT_CLIENT"
          );
          return {
            type: "delete",
            path,
          };
        }

      case "delete":
        // 삭제 작업의 롤백 = 원본 데이터로 재생성
        try {
          const existingSecret = await this.readSecret(path);
          if (!existingSecret) {
            throw new Error("Secret does not exist, cannot delete");
          }
          return {
            type: "create",
            path,
            originalData: existingSecret.data,
          };
        } catch (error) {
          throw new Error(
            `Cannot calculate rollback for delete operation: ${error}`
          );
        }

      case "read":
        // 읽기 작업은 롤백이 필요 없음
        return {
          type: "read",
          path,
        };

      default:
        throw new Error(`Unsupported operation type: ${type}`);
    }
  }

  /**
   * 단순 오퍼레이션들을 완전한 트랜잭션 오퍼레이션으로 변환
   */
  private async prepareTransactionOperations(
    operations: TransactionOperation[]
  ): Promise<InternalTransactionalOperation[]> {
    const transactionalOperations: InternalTransactionalOperation[] = [];

    for (const operation of operations) {
      try {
        const rollback = await this.calculateRollbackOperation(operation);
        transactionalOperations.push({
          forward: operation,
          rollback,
        });
      } catch (error: any) {
        throw new Error(
          `Failed to prepare rollback for operation ${operation.type} on ${operation.path}: ${error.message}`
        );
      }
    }

    return transactionalOperations;
  }

  /**
   * 가상 트랜잭션 실행 (롤백 자동 계산)
   */
  async executeTransaction(
    operations: TransactionOperation[],
    dryRun = false
  ): Promise<TransactionResult | DryRunTransactionResult> {
    log.info(
      `Preparing transaction with ${operations.length} operations`,
      "VAULT_CLIENT"
    );

    if (dryRun) {
      return this.executeTransactionDryRun(operations);
    }

    try {
      // 롤백 오퍼레이션 자동 계산
      const transactionalOperations = await this.prepareTransactionOperations(
        operations
      );

      log.info(
        `Rollback operations calculated, executing transaction`,
        "VAULT_CLIENT"
      );

      // 내부 트랜잭션 실행 메서드 사용
      return await this.executeTransactionInternal(transactionalOperations);
    } catch (error: any) {
      log.error(`Failed to execute transaction`, "VAULT_CLIENT", error);
      throw error;
    }
  }

  /**
   * 트랜잭션 dry run 실행
   */
  async executeTransactionDryRun(
    operations: TransactionOperation[]
  ): Promise<DryRunTransactionResult> {
    const transactionId = generateTransactionId();
    const startTime = Date.now();

    log.info(
      `Starting transaction dry run ${transactionId} with ${operations.length} operations`,
      "VAULT_CLIENT_DRY_RUN"
    );

    const results: DryRunOperationResult[] = [];
    const validationErrors: Array<{ path: string; errors: string[] }> = [];

    // 순차적으로 각 작업 시뮬레이션 (의존성 고려)
    const simulatedState = new Map<string, any>(); // 트랜잭션 내 중간 상태 추적

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      try {
        // 이전 작업들의 영향을 고려한 시뮬레이션
        const simulationResult = await this.simulateOperationWithState(
          operation,
          simulatedState,
          i
        );

        results.push(simulationResult);

        if (!simulationResult.wouldSucceed) {
          validationErrors.push({
            path: operation.path,
            errors: simulationResult.validationErrors || [
              "Unknown validation error",
            ],
          });
        } else {
          // 성공할 것으로 예상되는 작업의 결과를 상태에 반영
          this.updateSimulatedState(
            simulatedState,
            operation,
            simulationResult
          );
        }

        log.debug(
          `Simulated operation ${i + 1}/${operations.length}: ${
            operation.type
          } ${operation.path} - ${
            simulationResult.wouldSucceed ? "SUCCESS" : "FAILURE"
          }`,
          "VAULT_CLIENT_DRY_RUN"
        );
      } catch (error: any) {
        const failureResult: DryRunOperationResult = {
          path: operation.path,
          success: false,
          dryRun: true,
          data: {
            dryRun: true,
            wouldSucceed: false,
            validationErrors: [`Simulation error: ${error.message}`],
            pathExists: false,
          },
          wouldSucceed: false,
          validationErrors: [`Simulation error: ${error.message}`],
        };

        results.push(failureResult);
        validationErrors.push({
          path: operation.path,
          errors: [`Simulation error: ${error.message}`],
        });
      }
    }

    const duration = Date.now() - startTime;
    const wouldSucceedCount = results.filter((r) => r.wouldSucceed).length;
    const wouldFailCount = results.length - wouldSucceedCount;
    const overallSuccess = wouldFailCount === 0;

    log.info(
      `Transaction dry run ${transactionId} completed: ${wouldSucceedCount}/${results.length} would succeed`,
      "VAULT_CLIENT_DRY_RUN"
    );

    return {
      success: overallSuccess,
      transactionId,
      results,
      dryRun: true,
      wouldSucceed: overallSuccess,
      validationSummary: {
        totalOperations: operations.length,
        wouldSucceed: wouldSucceedCount,
        wouldFail: wouldFailCount,
        validationErrors,
      },
      summary: {
        total: operations.length,
        succeeded: wouldSucceedCount,
        failed: wouldFailCount,
        rolledBack: 0, // dry run에서는 롤백 없음
        duration,
      },
    };
  }

  /**
   * 트랜잭션 내 상태를 고려한 작업 시뮬레이션
   */
  private async simulateOperationWithState(
    operation: TransactionOperation,
    simulatedState: Map<string, any>,
    operationIndex: number
  ): Promise<DryRunOperationResult> {
    const { type, path, data } = operation;

    // 기본 시뮬레이션 수행
    const baseResult = await this.simulateOperation(operation);

    // 트랜잭션 내 이전 작업들의 영향 고려
    if (simulatedState.has(path)) {
      const stateInfo = simulatedState.get(path);

      // 이전 작업에 의해 상태가 변경된 경우 재평가
      if (type === "create" && stateInfo.operation === "delete") {
        // 이전에 삭제된 경로에 생성하는 경우 - 성공 가능
        baseResult.data.pathExists = false;
        baseResult.data.wouldSucceed = true;
        baseResult.wouldSucceed = true;
        baseResult.data.validationErrors = undefined;
      } else if (type === "create" && stateInfo.operation === "create") {
        // 이전에 생성된 경로에 다시 생성하는 경우 - 실패
        baseResult.data.pathExists = true;
        baseResult.data.wouldSucceed = false;
        baseResult.wouldSucceed = false;
        baseResult.data.validationErrors = [
          "Cannot create: secret would already exist due to previous operation in this transaction",
        ];
        baseResult.validationErrors = baseResult.data.validationErrors;
      } else if (type === "update" && stateInfo.operation === "create") {
        // 이전에 생성된 경로를 업데이트하는 경우 - 성공 가능
        baseResult.data.pathExists = true;
        baseResult.data.wouldSucceed = true;
        baseResult.wouldSucceed = true;
        baseResult.data.existingData = stateInfo.data;
        baseResult.data.validationErrors = undefined;
      } else if (
        type === "delete" &&
        (stateInfo.operation === "create" || stateInfo.operation === "update")
      ) {
        // 이전에 생성되거나 업데이트된 경로를 삭제하는 경우 - 성공 가능
        baseResult.data.pathExists = true;
        baseResult.data.wouldSucceed = true;
        baseResult.wouldSucceed = true;
        baseResult.data.existingData = stateInfo.data;
        baseResult.data.validationErrors = undefined;
      } else if (type === "delete" && stateInfo.operation === "delete") {
        // 이전에 삭제된 경로를 다시 삭제하는 경우 - 실패
        baseResult.data.pathExists = false;
        baseResult.data.wouldSucceed = false;
        baseResult.wouldSucceed = false;
        baseResult.data.validationErrors = [
          "Cannot delete: secret would not exist due to previous operation in this transaction",
        ];
        baseResult.validationErrors = baseResult.data.validationErrors;
      } else if (type === "update" && stateInfo.operation === "delete") {
        // 이전에 삭제된 경로를 업데이트하는 경우 - 실패
        baseResult.data.pathExists = false;
        baseResult.data.wouldSucceed = false;
        baseResult.wouldSucceed = false;
        baseResult.data.validationErrors = [
          "Cannot update: secret would not exist due to previous operation in this transaction",
        ];
        baseResult.validationErrors = baseResult.data.validationErrors;
      }
    }

    return baseResult;
  }

  /**
   * 시뮬레이션 상태 업데이트
   */
  private updateSimulatedState(
    simulatedState: Map<string, any>,
    operation: TransactionOperation,
    result: DryRunOperationResult
  ): void {
    if (result.wouldSucceed) {
      simulatedState.set(operation.path, {
        operation: operation.type,
        data: operation.data,
        operationIndex: simulatedState.size,
      });
    }
  }

  /**
   * 내부 트랜잭션 실행 메서드 (완전한 트랜잭션 오퍼레이션 사용)
   */
  private async executeTransactionInternal(
    operations: InternalTransactionalOperation[]
  ): Promise<TransactionResult> {
    const transactionId = generateTransactionId();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    const completedOperations: Array<{
      index: number;
      operation: InternalTransactionalOperation;
    }> = [];

    console.error(
      `[Transaction ${transactionId}] Starting with ${operations.length} operations`
    );

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
            case "create":
            case "update":
              this.checkWritePermission();
              await this.client.write(forward.path, { data: forward.data });
              result = { written: true };
              break;

            case "delete":
              this.checkWritePermission();
              await this.client.delete(forward.path);
              result = { deleted: true };
              break;

            case "read":
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
            data: result,
          });

          completedOperations.push({ index: i, operation });
          console.error(
            `[Transaction ${transactionId}] ✓ ${forward.type} ${forward.path}`
          );
        } catch (error: any) {
          console.error(
            `[Transaction ${transactionId}] ✗ ${forward.type} ${forward.path}: ${error.message}`
          );

          results.push({
            path: forward.path,
            success: false,
            error: error.message,
          });

          // 실패 시 롤백 실행
          await this.executeRollback(
            transactionId,
            completedOperations,
            results
          );

          const duration = Date.now() - startTime;
          return {
            success: false,
            transactionId,
            results,
            rollbackResults: results.filter((r) => r.rollbackExecuted),
            summary: {
              total: operations.length,
              succeeded: completedOperations.length,
              failed: 1,
              rolledBack: completedOperations.length,
              duration,
            },
          };
        }
      }

      // 모든 작업이 성공한 경우
      const duration = Date.now() - startTime;
      console.error(
        `[Transaction ${transactionId}] ✓ All operations completed successfully in ${duration}ms`
      );

      return {
        success: true,
        transactionId,
        results,
        summary: {
          total: operations.length,
          succeeded: operations.length,
          failed: 0,
          rolledBack: 0,
          duration,
        },
      };
    } catch (error: any) {
      console.error(
        `[Transaction ${transactionId}] Fatal error: ${error.message}`
      );

      // 치명적 오류 시에도 롤백 시도
      await this.executeRollback(transactionId, completedOperations, results);

      const duration = Date.now() - startTime;
      return {
        success: false,
        transactionId,
        results,
        rollbackResults: results.filter((r) => r.rollbackExecuted),
        summary: {
          total: operations.length,
          succeeded: completedOperations.length,
          failed: operations.length - completedOperations.length,
          rolledBack: completedOperations.length,
          duration,
        },
      };
    }
  }

  /**
   * 롤백 실행
   */
  private async executeRollback(
    transactionId: string,
    completedOperations: Array<{
      index: number;
      operation: InternalTransactionalOperation;
    }>,
    results: BulkOperationResult[]
  ): Promise<void> {
    console.error(
      `[Transaction ${transactionId}] Starting rollback for ${completedOperations.length} operations`
    );

    // 역순으로 롤백 실행 (LIFO)
    for (let i = completedOperations.length - 1; i >= 0; i--) {
      const { operation } = completedOperations[i];
      const { rollback } = operation;

      try {
        switch (rollback.type) {
          case "delete":
            // 롤백: 생성된 것을 삭제 (원래 작업이 "create"였던 경우)
            console.error(
              `[Transaction ${transactionId}] Rollback: Attempting to delete ${rollback.path}`
            );
            await this.deleteSecret(rollback.path);
            console.error(
              `[Transaction ${transactionId}] Rollback: Successfully deleted ${rollback.path}`
            );
            break;

          case "update":
            // 롤백: 원본 데이터로 복원 (원래 작업이 "update"였던 경우)
            if (rollback.originalData) {
              await this.client.write(rollback.path, {
                data: rollback.originalData,
              });
              console.error(
                `[Transaction ${transactionId}] Rollback: Restored ${rollback.path} to original state`
              );
            } else {
              // 원본 데이터가 없으면 삭제 (원래 존재하지 않았던 경우)
              await this.deleteSecret(rollback.path);
              console.error(
                `[Transaction ${transactionId}] Rollback: Deleted ${rollback.path} (was new)`
              );
            }
            break;

          case "create":
            // 롤백: 삭제된 것을 복원 (원래 작업이 "delete"였던 경우)
            if (rollback.originalData) {
              await this.client.write(rollback.path, {
                data: rollback.originalData,
              });
              console.error(
                `[Transaction ${transactionId}] Rollback: Restored deleted ${rollback.path}`
              );
            }
            break;

          case "read":
            // 읽기는 롤백할 필요 없음
            console.error(
              `[Transaction ${transactionId}] Rollback: Skipping read operation ${rollback.path}`
            );
            break;

          default:
            console.error(
              `[Transaction ${transactionId}] Rollback: Unknown type ${rollback.type} for ${rollback.path}`
            );
        }

        // 결과에 롤백 실행 표시
        const resultIndex = results.findIndex(
          (r) => r.path === operation.forward.path
        );
        if (resultIndex >= 0) {
          results[resultIndex].rollbackExecuted = true;
        }
      } catch (rollbackError: any) {
        console.error(
          `[Transaction ${transactionId}] Rollback failed for ${rollback.path}: ${rollbackError.message}`
        );

        // 롤백 실패도 결과에 기록
        const resultIndex = results.findIndex(
          (r) => r.path === operation.forward.path
        );
        if (resultIndex >= 0) {
          results[resultIndex].rollbackExecuted = false;
          results[
            resultIndex
          ].error = `${results[resultIndex].error}; Rollback failed: ${rollbackError.message}`;
        }
      }
    }

    console.error(`[Transaction ${transactionId}] Rollback completed`);
  }

  // === 새로운 탐색 및 YAML 기능들 ===

  /**
   * 재귀적으로 경로를 탐색하여 트리 구조로 반환
   */
  async exploreSecrets(
    basePath: string,
    maxDepth: number = 10
  ): Promise<ExploreResult> {
    this.checkReadPermission();

    // Vault KV v2 경로 변환 함수
    const convertToDataPath = (metadataPath: string): string => {
      if (metadataPath.startsWith("secret/metadata/")) {
        return metadataPath.replace("secret/metadata/", "secret/data/");
      }
      return metadataPath;
    };

    // 메타데이터 경로를 데이터 경로로 변환하여 경로 제한 확인
    const dataBasePath = convertToDataPath(basePath);
    if (!this.isPathAllowed(dataBasePath)) {
      throw new Error(`Access to path '${basePath}' is not allowed`);
    }

    console.error(
      `[Explore] Starting exploration of ${basePath} with max depth ${maxDepth}`
    );

    const tree: TreeNode[] = [];
    let totalSecrets = 0;
    let totalFolders = 0;
    let currentDepth = 0;

    const exploreRecursive = async (
      currentPath: string,
      depth: number
    ): Promise<TreeNode[]> => {
      if (depth > maxDepth) {
        console.error(
          `[Explore] Max depth ${maxDepth} reached at ${currentPath}`
        );
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
          const fullPath = currentPath.endsWith("/")
            ? `${currentPath}${key}`
            : `${currentPath}/${key}`;

          if (key.endsWith("/")) {
            // 폴더인 경우 - 경로 제한 확인
            const dataPath = convertToDataPath(fullPath);
            if (!this.isPathAllowed(dataPath)) {
              console.error(
                `[Explore] Skipping folder ${fullPath}: Access not allowed`
              );
              continue;
            }

            totalFolders++;
            const subChildren = await exploreRecursive(fullPath, depth + 1);
            children.push({
              name: key.slice(0, -1), // '/' 제거
              path: fullPath,
              type: "folder",
              children: subChildren,
            });
          } else {
            // 시크릿인 경우 - 경로 제한 확인
            const dataPath = convertToDataPath(fullPath);
            if (!this.isPathAllowed(dataPath)) {
              console.error(
                `[Explore] Skipping secret ${fullPath}: Access not allowed`
              );
              continue;
            }

            totalSecrets++;
            children.push({
              name: key,
              path: fullPath,
              type: "secret",
            });
          }
        }

        return children;
      } catch (error: any) {
        if (error.response?.statusCode === 404) {
          return [];
        }
        console.error(
          `[Explore] Error exploring ${currentPath}: ${error.message}`
        );
        return [];
      }
    };

    const rootChildren = await exploreRecursive(basePath, 0);
    tree.push(...rootChildren);

    console.error(
      `[Explore] Completed: ${totalSecrets} secrets, ${totalFolders} folders, depth ${currentDepth}`
    );

    return {
      tree,
      totalSecrets,
      totalFolders,
      depth: currentDepth,
    };
  }

  /**
   * 지정된 경로의 시크릿들을 YAML 파일로 내보내기
   */
  async exportSecretsToYaml(
    basePath: string,
    outputPath: string,
    recursive: boolean = true
  ): Promise<YamlExportResult> {
    this.checkReadPermission();

    // Vault KV v2 경로 변환 함수
    const convertToDataPath = (metadataPath: string): string => {
      if (metadataPath.startsWith("secret/metadata/")) {
        return metadataPath.replace("secret/metadata/", "secret/data/");
      }
      return metadataPath;
    };

    // 메타데이터 경로를 데이터 경로로 변환하여 경로 제한 확인
    const dataBasePath = convertToDataPath(basePath);
    if (!this.isPathAllowed(dataBasePath)) {
      throw new Error(`Access to path '${basePath}' is not allowed`);
    }

    // VAULT_ALLOWED_WORKING_DIR 설정이 필수 (보안상 제한)
    if (!this.config.allowedWorkingDirectory) {
      throw new Error(
        `VAULT_ALLOWED_WORKING_DIR environment variable is required for export operations. ` +
          `This security setting prevents unauthorized file system access.`
      );
    }

    // 출력 경로가 허용된 워킹 디렉토리 내에 있는지 확인 (보안상 제한)
    const resolvedOutputPath = path.resolve(outputPath);
    const resolvedWorkingDir = path.resolve(
      this.config.allowedWorkingDirectory
    );

    if (!resolvedOutputPath.startsWith(resolvedWorkingDir)) {
      throw new Error(
        `Output path must be within the allowed working directory: ${resolvedWorkingDir}`
      );
    }

    console.error(
      `[Export] Starting YAML export from ${basePath} to ${resolvedOutputPath}`
    );

    try {
      const secrets: Record<string, any> = {};
      let secretsCount = 0;

      const collectSecrets = async (
        currentPath: string,
        targetObject: Record<string, any>
      ) => {
        try {
          const keys = await this.client.list(currentPath);

          if (!keys.data?.keys) {
            return;
          }

          for (const key of keys.data.keys) {
            const fullPath = currentPath.endsWith("/")
              ? `${currentPath}${key}`
              : `${currentPath}/${key}`;

            if (key.endsWith("/") && recursive) {
              // 폴더인 경우 - 재귀적으로 탐색
              const folderName = key.slice(0, -1);

              // 폴더 경로에 대해서도 경로 제한 확인 (데이터 경로로 변환하여)
              const dataPath = convertToDataPath(fullPath);
              if (!this.isPathAllowed(dataPath)) {
                console.error(
                  `[Export] Skipping folder ${dataPath}: Access not allowed`
                );
                continue;
              }

              targetObject[folderName] = {};
              await collectSecrets(fullPath, targetObject[folderName]);
            } else if (!key.endsWith("/")) {
              // 시크릿인 경우
              try {
                // 메타데이터 경로를 데이터 경로로 변환
                const dataPath = convertToDataPath(fullPath);

                // 각 시크릿 경로에 대해서도 경로 제한 확인
                if (!this.isPathAllowed(dataPath)) {
                  console.error(
                    `[Export] Skipping ${dataPath}: Access not allowed`
                  );
                  continue;
                }

                console.error(
                  `[Export] Reading secret from data path: ${dataPath}`
                );

                const secret = await this.client.read(dataPath);
                const secretData = secret.data?.data || secret.data || {};
                targetObject[key] = secretData;
                secretsCount++;
                console.error(`[Export] Collected secret: ${dataPath}`);
              } catch (secretError: any) {
                console.error(
                  `[Export] Failed to read secret ${fullPath}: ${secretError.message}`
                );
                targetObject[key] = {
                  error: `Failed to read: ${secretError.message}`,
                };
              }
            }
          }
        } catch (error: any) {
          if (error.response?.statusCode !== 404) {
            console.error(
              `[Export] Error listing ${currentPath}: ${error.message}`
            );
          }
        }
      };

      await collectSecrets(basePath, secrets);

      // YAML로 변환하고 파일에 저장
      const yamlContent = yaml.dump(secrets, {
        indent: 2,
        sortKeys: true,
        lineWidth: -1, // 무제한 너비
      });

      // 출력 디렉토리 생성
      const outputDir = path.dirname(resolvedOutputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(resolvedOutputPath, yamlContent, "utf8");

      console.error(
        `[Export] Successfully exported ${secretsCount} secrets to ${resolvedOutputPath}`
      );

      return {
        success: true,
        filePath: resolvedOutputPath,
        secretsCount,
      };
    } catch (error: any) {
      console.error(`[Export] Export failed: ${error.message}`);
      return {
        success: false,
        filePath: resolvedOutputPath,
        secretsCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * YAML 파일에서 시크릿들을 Vault로 가져오기
   */
  async importSecretsFromYaml(
    yamlFilePath: string,
    basePath: string,
    overwrite: boolean = false
  ): Promise<YamlImportResult> {
    this.checkWritePermission();

    if (!this.isPathAllowed(basePath)) {
      throw new Error(`Access to path '${basePath}' is not allowed`);
    }

    // VAULT_ALLOWED_WORKING_DIR 설정이 필수 (보안상 제한)
    if (!this.config.allowedWorkingDirectory) {
      throw new Error(
        `VAULT_ALLOWED_WORKING_DIR environment variable is required for import operations. ` +
          `This security setting prevents unauthorized file system access.`
      );
    }

    // 입력 파일이 허용된 워킹 디렉토리 내에 있는지 확인 (보안상 제한)
    const resolvedYamlPath = path.resolve(yamlFilePath);
    const resolvedWorkingDir = path.resolve(
      this.config.allowedWorkingDirectory
    );

    if (!resolvedYamlPath.startsWith(resolvedWorkingDir)) {
      throw new Error(
        `Input file must be within the allowed working directory: ${resolvedWorkingDir}`
      );
    }

    console.error(
      `[Import] Starting YAML import from ${resolvedYamlPath} to ${basePath}`
    );

    try {
      if (!fs.existsSync(resolvedYamlPath)) {
        throw new Error(`YAML file not found: ${resolvedYamlPath}`);
      }

      const yamlContent = fs.readFileSync(resolvedYamlPath, "utf8");
      const data = yaml.load(yamlContent) as Record<string, any>;

      if (!data || typeof data !== "object") {
        throw new Error("Invalid YAML content: expected object at root level");
      }

      let imported = 0;
      let failed = 0;
      const errors: Array<{ path: string; error: string }> = [];

      const importRecursive = async (
        obj: Record<string, any>,
        currentPath: string
      ) => {
        for (const [key, value] of Object.entries(obj)) {
          const secretPath = currentPath.endsWith("/")
            ? `${currentPath}${key}`
            : `${currentPath}/${key}`;

          if (!this.isPathAllowed(secretPath)) {
            errors.push({
              path: secretPath,
              error: `Access to path '${secretPath}' is not allowed`,
            });
            failed++;
            continue;
          }

          try {
            if (value && typeof value === "object" && !Array.isArray(value)) {
              // 중첩된 객체인 경우 - 폴더 구조로 처리할지 단일 시크릿으로 처리할지 결정
              const hasSimpleValues = Object.values(value).some(
                (v) => typeof v !== "object" || Array.isArray(v) || v === null
              );

              if (hasSimpleValues) {
                // 단일 시크릿으로 처리
                if (!overwrite) {
                  // 기존 시크릿 확인
                  try {
                    await this.client.read(secretPath);
                    console.error(
                      `[Import] Skipping existing secret: ${secretPath}`
                    );
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
                  console.error(
                    `[Import] Skipping existing secret: ${secretPath}`
                  );
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
              error: error.message,
            });
            failed++;
            console.error(
              `[Import] Failed to import ${secretPath}: ${error.message}`
            );
          }
        }
      };

      await importRecursive(data, basePath);

      console.error(
        `[Import] Completed: ${imported} imported, ${failed} failed`
      );

      return {
        success: failed === 0,
        imported,
        failed,
        errors,
      };
    } catch (error: any) {
      console.error(`[Import] Import failed: ${error.message}`);
      return {
        success: false,
        imported: 0,
        failed: 1,
        errors: [{ path: yamlFilePath, error: error.message }],
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
          error: `Access to path '${path}' is not allowed`,
        });
        continue;
      }

      try {
        const result = await this.client.read(path);
        results.push({
          path,
          success: true,
          data: result.data?.data || result.data || {},
        });
        succeeded++;
      } catch (error: any) {
        results.push({
          path,
          success: false,
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.error(
      `Bulk read completed: ${succeeded}/${paths.length} successful in ${duration}ms`
    );

    return {
      success: succeeded === paths.length,
      results,
      summary: {
        total: paths.length,
        succeeded,
        failed: paths.length - succeeded,
        duration,
      },
    };
  }

  /**
   * 벌크 쓰기 (Best-Effort)
   */
  async bulkWriteSecrets(
    operations: BulkOperation[],
    dryRun = false
  ): Promise<BulkOperationSummary> {
    this.checkWritePermission();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    let succeeded = 0;

    const modeText = dryRun ? "dry run" : "bulk write";
    console.error(`Starting ${modeText} for ${operations.length} operations`);

    for (const operation of operations) {
      if (!this.isPathAllowed(operation.path)) {
        results.push({
          path: operation.path,
          success: false,
          error: `Access to path '${operation.path}' is not allowed`,
          dryRun,
        });
        continue;
      }

      try {
        if (dryRun) {
          // Dry run 모드: 실제 쓰기 대신 시뮬레이션
          const dryRunResult = await this.simulateWriteSecret(
            operation.path,
            operation.data || {}
          );
          results.push({
            path: operation.path,
            success: dryRunResult.wouldSucceed,
            error: dryRunResult.wouldSucceed
              ? undefined
              : dryRunResult.validationErrors?.join(", "),
            data: dryRunResult,
            dryRun: true,
          });
          if (dryRunResult.wouldSucceed) succeeded++;
        } else {
          // 실제 실행
          await this.client.write(operation.path, { data: operation.data });
          results.push({
            path: operation.path,
            success: true,
            data: { written: true },
          });
          succeeded++;
        }
      } catch (error: any) {
        results.push({
          path: operation.path,
          success: false,
          error: error.message,
          dryRun,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.error(
      `Bulk write completed: ${succeeded}/${operations.length} successful in ${duration}ms`
    );

    return {
      success: succeeded === operations.length,
      results,
      summary: {
        total: operations.length,
        succeeded,
        failed: operations.length - succeeded,
        duration,
      },
    };
  }

  /**
   * 벌크 삭제 (Best-Effort)
   */
  async bulkDeleteSecrets(
    paths: string[],
    dryRun = false
  ): Promise<BulkOperationSummary> {
    this.checkWritePermission();
    const startTime = Date.now();
    const results: BulkOperationResult[] = [];
    let succeeded = 0;

    const modeText = dryRun ? "dry run" : "bulk delete";
    console.error(`Starting ${modeText} for ${paths.length} paths`);

    for (const path of paths) {
      if (!this.isPathAllowed(path)) {
        results.push({
          path,
          success: false,
          error: `Access to path '${path}' is not allowed`,
          dryRun,
        });
        continue;
      }

      try {
        if (dryRun) {
          // Dry run 모드: 실제 삭제 대신 시뮬레이션
          const dryRunResult = await this.simulateDeleteSecret(path);
          results.push({
            path,
            success: dryRunResult.wouldSucceed,
            error: dryRunResult.wouldSucceed
              ? undefined
              : dryRunResult.validationErrors?.join(", "),
            data: dryRunResult,
            dryRun: true,
          });
          if (dryRunResult.wouldSucceed) succeeded++;
        } else {
          // 실제 실행
          await this.client.delete(path);
          results.push({
            path,
            success: true,
            data: { deleted: true },
          });
          succeeded++;
        }
      } catch (error: any) {
        results.push({
          path,
          success: false,
          error: error.message,
          dryRun,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.error(
      `Bulk delete completed: ${succeeded}/${paths.length} successful in ${duration}ms`
    );

    return {
      success: succeeded === paths.length,
      results,
      summary: {
        total: paths.length,
        succeeded,
        failed: paths.length - succeeded,
        duration,
      },
    };
  }
}

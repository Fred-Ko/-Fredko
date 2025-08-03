/**
 * Vault MCP Server Type Definitions
 * 모든 인터페이스와 타입 정의를 포함합니다.
 */

export interface VaultSecret {
  path: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export type OperationType = "create" | "update" | "delete" | "read";

export interface RollbackOperation {
  type: OperationType;
  path: string;
  data?: Record<string, any>;
  originalData?: Record<string, any>; // 원본 데이터 (update/delete 시 복원용)
}

// 사용자가 정의하는 트랜잭션 오퍼레이션 (롤백은 시스템이 자동 계산)
export interface TransactionOperation {
  type: OperationType;
  path: string;
  data?: Record<string, any>;
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
  dryRun?: boolean; // dry run 모드에서 실행된 경우
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
  type: "folder" | "secret";
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
  dryRun?: boolean; // dry run 모드 여부
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
  operations: (BulkOperation | TransactionOperation)[];
  completed: number;
  failed: Array<{ index: number; path: string; error: string }>;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "partial"
    | "rolling_back"
    | "rolled_back";
  startTime: number;
  endTime?: number;
  rollbackStartTime?: number;
  rollbackEndTime?: number;
}

export interface VaultHealthStatus {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
}

export interface VaultConfig {
  endpoint: string;
  token: string;
  permissions: {
    read: boolean;
    write: boolean;
  };
  allowedPaths?: string[];
  allowedWorkingDirectory?: string;
}

// Dry Run 관련 타입 정의들
export interface DryRunResult {
  dryRun: true;
  wouldSucceed: boolean;
  simulatedData?: any;
  validationErrors?: string[];
  existingData?: Record<string, any>; // 현재 존재하는 데이터 (update/delete 시)
  pathExists?: boolean; // 경로 존재 여부
}

export interface DryRunOperationResult
  extends Omit<BulkOperationResult, "data"> {
  dryRun: true;
  data: DryRunResult;
  wouldSucceed: boolean;
  validationErrors?: string[];
}

export interface DryRunTransactionResult
  extends Omit<TransactionResult, "results"> {
  dryRun: true;
  results: DryRunOperationResult[];
  wouldSucceed: boolean;
  validationSummary: {
    totalOperations: number;
    wouldSucceed: number;
    wouldFail: number;
    validationErrors: Array<{ path: string; errors: string[] }>;
  };
}

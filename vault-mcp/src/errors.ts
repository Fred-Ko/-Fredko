/**
 * Vault MCP Server Error Handling
 * 에러 클래스와 에러 처리 유틸리티를 포함합니다.
 */

export class VaultMCPError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: any;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: any
  ) {
    super(message);
    this.name = "VaultMCPError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // 스택 트레이스에서 이 생성자 제거
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VaultMCPError);
    }
  }
}

export class VaultConnectionError extends VaultMCPError {
  constructor(message: string, details?: any) {
    super(message, "VAULT_CONNECTION_ERROR", 503, details);
    this.name = "VaultConnectionError";
  }
}

export class VaultPermissionError extends VaultMCPError {
  constructor(message: string, path?: string) {
    super(message, "VAULT_PERMISSION_ERROR", 403, { path });
    this.name = "VaultPermissionError";
  }
}

export class VaultPathNotAllowedError extends VaultMCPError {
  constructor(path: string) {
    super(
      `Access to path '${path}' is not allowed`,
      "VAULT_PATH_NOT_ALLOWED",
      403,
      { path }
    );
    this.name = "VaultPathNotAllowedError";
  }
}

export class VaultSecretNotFoundError extends VaultMCPError {
  constructor(path: string) {
    super(`Secret not found at path: ${path}`, "VAULT_SECRET_NOT_FOUND", 404, {
      path,
    });
    this.name = "VaultSecretNotFoundError";
  }
}

export class VaultConfigurationError extends VaultMCPError {
  constructor(message: string, details?: any) {
    super(message, "VAULT_CONFIGURATION_ERROR", 400, details);
    this.name = "VaultConfigurationError";
  }
}

export class VaultTransactionError extends VaultMCPError {
  constructor(message: string, transactionId: string, details?: any) {
    super(message, "VAULT_TRANSACTION_ERROR", 500, {
      transactionId,
      ...details,
    });
    this.name = "VaultTransactionError";
  }
}

export class VaultFileSystemError extends VaultMCPError {
  constructor(message: string, filePath: string, details?: any) {
    super(message, "VAULT_FILESYSTEM_ERROR", 500, { filePath, ...details });
    this.name = "VaultFileSystemError";
  }
}

/**
 * HTTP 상태 코드에 따른 에러 생성
 */
export function createVaultErrorFromResponse(
  error: any,
  path?: string
): VaultMCPError {
  const statusCode = error.response?.statusCode || error.statusCode;
  const message = error.message || "Unknown Vault error";

  switch (statusCode) {
    case 404:
      return new VaultSecretNotFoundError(path || "unknown");
    case 403:
      return new VaultPermissionError(message, path);
    case 503:
      return new VaultConnectionError(message, error.response?.data);
    default:
      return new VaultMCPError(
        message,
        "VAULT_API_ERROR",
        statusCode,
        error.response?.data
      );
  }
}

/**
 * 에러를 MCP 응답 형식으로 변환
 */
export function errorToMCPResponse(error: any) {
  const vaultError =
    error instanceof VaultMCPError
      ? error
      : new VaultMCPError(
          error.message || "Unknown error",
          "UNKNOWN_ERROR",
          500,
          error
        );

  return {
    content: [
      {
        type: "text" as const,
        text: `Error [${vaultError.code}]: ${vaultError.message}`,
      },
    ],
    isError: true,
  };
}

/**
 * 에러 로깅
 */
export function logError(error: any, context?: string): void {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}] ` : "";

  if (error instanceof VaultMCPError) {
    console.error(
      `${timestamp} ${contextStr}${error.name}: ${error.message} (${error.code})`
    );
    if (error.details) {
      console.error(`${timestamp} ${contextStr}Details:`, error.details);
    }
  } else {
    console.error(`${timestamp} ${contextStr}Error:`, error);
  }

  if (error.stack) {
    console.error(`${timestamp} ${contextStr}Stack:`, error.stack);
  }
}

/**
 * 에러 정보 추출
 */
export function extractErrorInfo(error: any): {
  message: string;
  code: string;
  statusCode?: number;
} {
  if (error instanceof VaultMCPError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    };
  }

  return {
    message: error.message || "Unknown error",
    code: "UNKNOWN_ERROR",
    statusCode: error.statusCode || 500,
  };
}

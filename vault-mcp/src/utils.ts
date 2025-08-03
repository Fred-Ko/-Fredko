/**
 * Vault MCP Server Utility Functions
 * 공통으로 사용되는 유틸리티 함수들을 포함합니다.
 */

import { TreeNode } from "./types.js";

/**
 * 배치 ID 생성
 */
export function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 트랜잭션 ID 생성
 */
export function generateTransactionId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 경로가 허용된 경로 목록에 포함되는지 확인
 */
export function isPathAllowed(path: string, allowedPaths?: string[]): boolean {
  if (!allowedPaths || allowedPaths.length === 0) {
    return true;
  }

  return allowedPaths.some((allowedPath) => path.startsWith(allowedPath));
}

/**
 * Vault KV v2 메타데이터 경로를 데이터 경로로 변환
 */
export function convertToDataPath(metadataPath: string): string {
  if (metadataPath.startsWith("secret/metadata/")) {
    return metadataPath.replace("secret/metadata/", "secret/data/");
  }
  return metadataPath;
}

/**
 * 트리 구조를 문자열로 포맷팅
 */
export function formatTree(nodes: TreeNode[], indent = 0): string {
  let output = "";
  const prefix = "  ".repeat(indent);

  for (const node of nodes) {
    const icon = node.type === "folder" ? "📁" : "🔐";
    output += `${prefix}${icon} ${node.name}\n`;

    if (node.children && node.children.length > 0) {
      output += formatTree(node.children, indent + 1);
    }
  }
  return output;
}

/**
 * 실행 시간 측정을 위한 타이머 클래스
 */
export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.startTime;
  }

  reset(): void {
    this.startTime = Date.now();
  }
}

/**
 * 안전한 JSON 파싱
 */
export function safeJsonParse<T = any>(jsonString: string, defaultValue: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return defaultValue;
  }
}

/**
 * 안전한 JSON 문자열화
 */
export function safeJsonStringify(obj: any, space?: number): string {
  try {
    return JSON.stringify(obj, null, space);
  } catch {
    return "{}";
  }
}

/**
 * 에러 메시지 정규화
 */
export function normalizeErrorMessage(error: any): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    if (error.message) {
      return error.message;
    }
    if (error.error) {
      return error.error;
    }
  }

  return "Unknown error occurred";
}

/**
 * 깊이 제한 적용
 */
export function limitDepth(depth: number, min = 1, max = 20): number {
  return Math.min(Math.max(depth, min), max);
}

/**
 * 경로 정규화 (끝의 슬래시 처리)
 */
export function normalizePath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

/**
 * 배열을 청크로 분할
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 비동기 지연
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 재시도 로직
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      await delay(delayMs * attempt); // 지수 백오프
    }
  }

  throw lastError;
}

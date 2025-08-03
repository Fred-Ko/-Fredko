/**
 * Vault 테스트 헬퍼 유틸리티
 * 테스트용 Vault 클라이언트 설정 및 공통 테스트 함수들
 */

import { VaultConfig } from "../../src/types.js";
import { VaultClient } from "../../src/vault-client.js";

/**
 * 테스트용 Vault 설정 생성
 */
export function createTestVaultConfig(): VaultConfig {
  return {
    endpoint: process.env.VAULT_ADDR || "http://localhost:8200",
    token: process.env.VAULT_TOKEN || "myroot",
    permissions: {
      read: true,
      write: true,
    },
    allowedPaths: [],
    allowedWorkingDirectory: undefined,
  };
}

/**
 * 테스트용 VaultClient 인스턴스 생성
 */
export function createTestVaultClient(): VaultClient {
  const config = createTestVaultConfig();
  return new VaultClient(config);
}

/**
 * 테스트용 랜덤 경로 생성
 */
export function generateTestPath(suffix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const pathSuffix = suffix ? `/${suffix}` : "";
  const testPathPrefix = "secret/data/test-suite";
  return `${testPathPrefix}/${timestamp}-${random}${pathSuffix}`;
}

/**
 * 테스트용 시크릿 데이터 생성
 */
export function generateTestSecretData(
  overrides: Record<string, any> = {}
): Record<string, any> {
  return {
    testId: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    environment: "test",
    ...overrides,
  };
}

/**
 * 테스트 후 정리용 경로 목록
 */
export class TestPathTracker {
  private paths: Set<string> = new Set();

  addPath(path: string): void {
    this.paths.add(path);
  }

  async cleanup(vaultClient: VaultClient): Promise<void> {
    const cleanupPromises = Array.from(this.paths).map(async (path) => {
      try {
        await vaultClient.deleteSecret(path);
      } catch (error) {
        // 이미 삭제된 경우 무시
      }
    });

    await Promise.allSettled(cleanupPromises);
    this.paths.clear();
  }

  getPaths(): string[] {
    return Array.from(this.paths);
  }
}

/**
 * 비동기 함수가 특정 에러를 던지는지 테스트
 */
export async function expectToThrowAsync(
  fn: () => Promise<any>,
  expectedError?: string | RegExp
): Promise<void> {
  let error: Error | undefined;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  if (!error) {
    throw new Error("Expected function to throw, but it did not");
  }

  if (expectedError) {
    if (typeof expectedError === "string") {
      if (!error.message.includes(expectedError)) {
        throw new Error(
          `Expected error message to include "${expectedError}", but got "${error.message}"`
        );
      }
    } else {
      if (!expectedError.test(error.message)) {
        throw new Error(
          `Expected error message to match ${expectedError}, but got "${error.message}"`
        );
      }
    }
  }
}

/**
 * 테스트용 지연 함수
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vault 서버 연결 상태 확인
 */
export async function isVaultAvailable(): Promise<boolean> {
  try {
    const client = createTestVaultClient();
    await client.getHealth();
    return true;
  } catch {
    return false;
  }
}

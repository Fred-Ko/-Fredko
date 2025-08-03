/**
 * Dry Run MCP Tools 통합 테스트
 */

import { beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { TransactionOperation } from "../../src/types.js";
import { VaultClient } from "../../src/vault-client.js";
import {
  createTestVaultClient,
  generateTestPath,
  generateTestSecretData,
  isVaultAvailable,
} from "../helpers/vault-test-helper.js";

describe("Dry Run MCP Tools Integration", () => {
  let vaultClient: VaultClient;

  beforeAll(async () => {
    if (!(await isVaultAvailable())) {
      console.warn("Vault is not available, skipping tests");
      return;
    }
  });

  beforeEach(async () => {
    if (!(await isVaultAvailable())) {
      return;
    }
    vaultClient = createTestVaultClient();
  });

  describe("Basic dry run functionality", () => {
    test("should simulate write operation", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("simulate-test");
      const data = generateTestSecretData();

      const result = await vaultClient.writeSecret(path, data, true);

      expect(result).toBeDefined();
      expect((result as any).dryRun).toBe(true);
      expect((result as any).wouldSucceed).toBe(true);
    });

    test("should simulate delete operation", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("delete-simulate-test");
      const data = generateTestSecretData();

      // 먼저 실제 secret 생성
      await vaultClient.writeSecret(path, data);

      const result = await vaultClient.deleteSecret(path, true);

      expect(result).toBeDefined();
      expect((result as any).dryRun).toBe(true);
      expect((result as any).wouldSucceed).toBe(true);
      expect((result as any).existingData).toEqual(data);

      // 실제로는 삭제되지 않았는지 확인
      const actualSecret = await vaultClient.readSecret(path);
      expect(actualSecret?.data).toEqual(data);

      // 정리
      await vaultClient.deleteSecret(path);
    });

    test("should simulate transaction", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const operations = [
        {
          type: "create" as const,
          path: generateTestPath("tx-sim-1"),
          data: { step: 1 },
        },
        {
          type: "create" as const,
          path: generateTestPath("tx-sim-2"),
          data: { step: 2 },
        },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.validationSummary.wouldSucceed).toBe(2);
      expect(result.validationSummary.wouldFail).toBe(0);

      // 실제로는 생성되지 않았는지 확인
      const secret1 = await vaultClient.readSecret(operations[0].path);
      const secret2 = await vaultClient.readSecret(operations[1].path);
      expect(secret1).toBeNull();
      expect(secret2).toBeNull();
    });
  });

  describe("Permission validation", () => {
    test("should respect write permissions in dry run", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const restrictedClient = new VaultClient({
        endpoint: process.env.VAULT_ADDR || "http://localhost:8200",
        token: process.env.VAULT_TOKEN || "myroot",
        permissions: {
          read: true,
          write: false, // 쓰기 권한 없음
        },
      });

      const operation = {
        type: "create" as const,
        path: generateTestPath("permission-test"),
        data: { key: "value" },
      };

      const result = await restrictedClient.simulateOperation(operation);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(false);
      expect(result.validationErrors).toContain(
        "Write operations are not permitted"
      );
    });

    it("should handle performance with large dry run operations", async () => {
      // 대량 벌크 작업 성능 테스트
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push({
          path: `secret/data/test/perf-bulk-${i}`,
          data: { id: i, large: "x".repeat(50) },
        });
      }

      const startTime = Date.now();
      const result = await vaultClient.bulkWriteSecrets(operations, true);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(20);
      expect(duration).toBeLessThan(500); // 500ms 이내 완료

      // 모든 작업이 성공해야 함
      result.results.forEach((res) => {
        expect(res.success).toBe(true);
        expect(res.dryRun).toBe(true);
      });
    });

    it("should validate complex data structures in dry run", async () => {
      const complexData = {
        nested: {
          deep: {
            array: [1, 2, 3, { nested: "value" }],
            boolean: true,
            null_value: null,
            number: 42.5,
          },
        },
        unicode: "한글 테스트 🚀",
        special_chars: "!@#$%^&*()_+-=[]{}|;:,.<>?",
      };

      const result = (await vaultClient.writeSecret(
        "secret/data/test/complex-data",
        complexData,
        true
      )) as any; // DryRunResult 타입으로 캐스팅

      expect(result.wouldSucceed).toBe(true);
      expect(result.simulatedData).toEqual(complexData);
    });

    it("should handle path restrictions in real scenarios", async () => {
      // 제한된 경로를 가진 클라이언트 생성
      const restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/test/allowed/"],
      });

      // 허용된 경로에서 벌크 작업 테스트
      const allowedOperations = [
        {
          path: "secret/data/test/allowed/service1",
          data: { config: "value1" },
        },
        {
          path: "secret/data/test/allowed/service2",
          data: { config: "value2" },
        },
      ];

      const allowedResult = await restrictedClient.bulkWriteSecrets(
        allowedOperations,
        true
      );
      expect(allowedResult.success).toBe(true);
      allowedResult.results.forEach((res) => {
        expect(res.success).toBe(true);
        expect(res.dryRun).toBe(true);
      });

      // 혼합된 경로에서 벌크 작업 테스트
      const mixedOperations = [
        {
          path: "secret/data/test/allowed/service1",
          data: { config: "value1" },
        },
        {
          path: "secret/data/test/forbidden/service2",
          data: { config: "value2" },
        },
        {
          path: "secret/data/test/allowed/service3",
          data: { config: "value3" },
        },
      ];

      const mixedResult = await restrictedClient.bulkWriteSecrets(
        mixedOperations,
        true
      );
      expect(mixedResult.success).toBe(false);
      expect(mixedResult.results[0].success).toBe(true); // 허용된 경로
      expect(mixedResult.results[1].success).toBe(false); // 금지된 경로
      expect(mixedResult.results[2].success).toBe(true); // 허용된 경로

      expect(mixedResult.results[1].error).toContain("not allowed");
    });

    it("should handle path restrictions in transaction simulations", async () => {
      const restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/test/allowed/"],
      });

      // 먼저 허용된 경로에 데이터 생성 (제한 없는 클라이언트로)
      await vaultClient.writeSecret("secret/data/test/allowed/existing", {
        initial: "data",
      });

      const operations: TransactionOperation[] = [
        { type: "read", path: "secret/data/test/allowed/existing" },
        {
          type: "create",
          path: "secret/data/test/allowed/new1",
          data: { test: "data1" },
        },
        {
          type: "create",
          path: "secret/data/test/forbidden/new2",
          data: { test: "data2" },
        },
        {
          type: "update",
          path: "secret/data/test/allowed/existing",
          data: { updated: true },
        },
      ];

      const result = await restrictedClient.executeTransactionDryRun(
        operations
      );

      expect(result.wouldSucceed).toBe(false);
      expect(result.results).toHaveLength(4);

      // 허용된 경로들은 성공
      expect(result.results[0].wouldSucceed).toBe(true); // READ
      expect(result.results[1].wouldSucceed).toBe(true); // CREATE allowed
      expect(result.results[3].wouldSucceed).toBe(true); // UPDATE allowed

      // 금지된 경로는 실패
      expect(result.results[2].wouldSucceed).toBe(false); // CREATE forbidden
      expect(result.results[2].validationErrors).toBeDefined();
      expect(result.results[2].validationErrors![0]).toBe(
        "Access to path 'secret/data/test/forbidden/new2' is not allowed"
      );

      // 정리
      await vaultClient.deleteSecret("secret/data/test/allowed/existing");
    });
  });
});

/**
 * Dry Run 기능 테스트
 */

import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
} from "@jest/globals";
import { DryRunResult, TransactionOperation } from "../../src/types.js";
import { VaultClient } from "../../src/vault-client.js";
import {
  createTestVaultClient,
  generateTestPath,
  generateTestSecretData,
  isVaultAvailable,
} from "../helpers/vault-test-helper.js";

describe("Dry Run Functionality", () => {
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

  describe("writeSecret dry run", () => {
    test("should simulate creating a new secret", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("test-create");
      const data = generateTestSecretData();

      const result = (await vaultClient.writeSecret(
        path,
        data,
        true
      )) as DryRunResult;

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.pathExists).toBe(false);
      expect(result.simulatedData).toEqual(data);
      expect(result.validationErrors).toBeUndefined();

      // 실제로는 생성되지 않았는지 확인
      const actualSecret = await vaultClient.readSecret(path);
      expect(actualSecret).toBeNull();
    });

    test("should simulate overwriting an existing secret", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("test-overwrite");
      const originalData = generateTestSecretData();
      const newData = { updated: "data" };

      // 먼저 실제 secret 생성
      await vaultClient.writeSecret(path, originalData);

      const result = (await vaultClient.writeSecret(
        path,
        newData,
        true
      )) as DryRunResult;

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.pathExists).toBe(true);
      expect(result.existingData).toEqual(originalData);
      expect(result.simulatedData).toEqual(newData);

      // 실제 데이터는 변경되지 않았는지 확인
      const actualSecret = await vaultClient.readSecret(path);
      expect(actualSecret?.data).toEqual(originalData);

      // 정리
      await vaultClient.deleteSecret(path);
    });
  });

  describe("deleteSecret dry run", () => {
    test("should simulate deleting an existing secret", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("test-delete");
      const data = generateTestSecretData();

      // 먼저 실제 secret 생성
      await vaultClient.writeSecret(path, data);

      const result = (await vaultClient.deleteSecret(
        path,
        true
      )) as DryRunResult;

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.pathExists).toBe(true);
      expect(result.existingData).toEqual(data);

      // 실제로는 삭제되지 않았는지 확인
      const actualSecret = await vaultClient.readSecret(path);
      expect(actualSecret?.data).toEqual(data);

      // 정리
      await vaultClient.deleteSecret(path);
    });

    test("should fail to delete non-existent secret", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("non-existent");

      const result = (await vaultClient.deleteSecret(
        path,
        true
      )) as DryRunResult;

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(false);
      expect(result.pathExists).toBe(false);
      expect(result.validationErrors).toContain(
        "Secret does not exist at the specified path"
      );
    });
  });

  describe("executeTransactionDryRun", () => {
    test("should simulate successful transaction", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const operations = [
        {
          type: "create" as const,
          path: generateTestPath("tx-test1"),
          data: { key1: "value1" },
        },
        {
          type: "create" as const,
          path: generateTestPath("tx-test2"),
          data: { key2: "value2" },
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

    test("should detect transaction conflicts", async () => {
      if (!(await isVaultAvailable())) {
        console.warn("Skipping test: Vault not available");
        return;
      }

      const path = generateTestPath("conflict-test");
      const operations = [
        {
          type: "create" as const,
          path,
          data: { step: 1 },
        },
        {
          type: "create" as const,
          path,
          data: { step: 2 },
        },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(false);
      expect(result.results).toHaveLength(2);

      // 첫 번째 작업은 성공
      expect(result.results[0].wouldSucceed).toBe(true);

      // 두 번째 작업은 실패 (충돌)
      expect(result.results[1].wouldSucceed).toBe(false);
      expect(result.results[1].validationErrors).toContain(
        "Cannot create: secret would already exist due to previous operation in this transaction"
      );
    });

    it("should handle CREATE → DELETE sequence correctly", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: "secret/data/test/create-delete",
          data: { key: "value" },
        },
        { type: "delete", path: "secret/data/test/create-delete" },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(2);

      // 첫 번째 작업: CREATE 성공
      expect(result.results[0].wouldSucceed).toBe(true);
      expect(result.results[0].path).toBe("secret/data/test/create-delete");

      // 두 번째 작업: DELETE 성공 (이전에 생성된 것을 삭제)
      expect(result.results[1].wouldSucceed).toBe(true);
      expect(result.results[1].path).toBe("secret/data/test/create-delete");
    });

    it("should handle CREATE → UPDATE → DELETE sequence correctly", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: "secret/data/test/complex",
          data: { step: "1" },
        },
        {
          type: "update",
          path: "secret/data/test/complex",
          data: { step: "2" },
        },
        { type: "delete", path: "secret/data/test/complex" },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(3);

      // 첫 번째 작업: CREATE 성공
      expect(result.results[0].wouldSucceed).toBe(true);
      expect(result.results[0].path).toBe("secret/data/test/complex");

      // 두 번째 작업: UPDATE 성공 (이전에 생성된 것을 업데이트)
      expect(result.results[1].wouldSucceed).toBe(true);
      expect(result.results[1].path).toBe("secret/data/test/complex");

      // 세 번째 작업: DELETE 성공 (이전에 업데이트된 것을 삭제)
      expect(result.results[2].wouldSucceed).toBe(true);
      expect(result.results[2].path).toBe("secret/data/test/complex");
    });

    it("should handle DELETE → CREATE sequence correctly", async () => {
      // 먼저 실제 시크릿을 생성해서 DELETE할 수 있도록 함
      await vaultClient.writeSecret("secret/data/test/delete-create", {
        initial: "data",
      });

      const operations: TransactionOperation[] = [
        { type: "delete", path: "secret/data/test/delete-create" },
        {
          type: "create",
          path: "secret/data/test/delete-create",
          data: { new: "data" },
        },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(2);

      // 첫 번째 작업: DELETE 성공
      expect(result.results[0].wouldSucceed).toBe(true);
      expect(result.results[0].path).toBe("secret/data/test/delete-create");

      // 두 번째 작업: CREATE 성공 (이전에 삭제된 경로에 생성)
      expect(result.results[1].wouldSucceed).toBe(true);
      expect(result.results[1].path).toBe("secret/data/test/delete-create");

      // 정리
      await vaultClient.deleteSecret("secret/data/test/delete-create");
    });

    it("should handle UPDATE → DELETE sequence correctly", async () => {
      // 먼저 실제 시크릿을 생성해서 UPDATE할 수 있도록 함
      await vaultClient.writeSecret("secret/data/test/update-delete", {
        initial: "data",
      });

      const operations: TransactionOperation[] = [
        {
          type: "update",
          path: "secret/data/test/update-delete",
          data: { updated: "data" },
        },
        { type: "delete", path: "secret/data/test/update-delete" },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(2);

      // 첫 번째 작업: UPDATE 성공
      expect(result.results[0].wouldSucceed).toBe(true);
      expect(result.results[0].path).toBe("secret/data/test/update-delete");

      // 두 번째 작업: DELETE 성공 (이전에 업데이트된 것을 삭제)
      expect(result.results[1].wouldSucceed).toBe(true);
      expect(result.results[1].path).toBe("secret/data/test/update-delete");

      // 정리
      await vaultClient.deleteSecret("secret/data/test/update-delete");
    });

    it("should handle DELETE → DELETE conflict correctly", async () => {
      // 먼저 실제 시크릿을 생성해서 DELETE할 수 있도록 함
      await vaultClient.writeSecret("secret/data/test/double-delete", {
        data: "test",
      });

      const operations: TransactionOperation[] = [
        { type: "delete", path: "secret/data/test/double-delete" },
        { type: "delete", path: "secret/data/test/double-delete" },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(false);
      expect(result.results).toHaveLength(2);

      // 첫 번째 작업: DELETE 성공
      expect(result.results[0].wouldSucceed).toBe(true);

      // 두 번째 작업: DELETE 실패 (이미 삭제됨)
      expect(result.results[1].wouldSucceed).toBe(false);
      expect(result.results[1].validationErrors).toContain(
        "Cannot delete: secret would not exist due to previous operation in this transaction"
      );

      // 정리
      await vaultClient.deleteSecret("secret/data/test/double-delete");
    });

    it("should handle DELETE → UPDATE conflict correctly", async () => {
      // 먼저 실제 시크릿을 생성해서 DELETE할 수 있도록 함
      await vaultClient.writeSecret("secret/data/test/delete-update", {
        data: "test",
      });

      const operations: TransactionOperation[] = [
        { type: "delete", path: "secret/data/test/delete-update" },
        {
          type: "update",
          path: "secret/data/test/delete-update",
          data: { updated: "data" },
        },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(false);
      expect(result.results).toHaveLength(2);

      // 첫 번째 작업: DELETE 성공
      expect(result.results[0].wouldSucceed).toBe(true);

      // 두 번째 작업: UPDATE 실패 (이미 삭제됨)
      expect(result.results[1].wouldSucceed).toBe(false);
      expect(result.results[1].validationErrors).toContain(
        "Cannot update: secret would not exist due to previous operation in this transaction"
      );

      // 정리
      await vaultClient.deleteSecret("secret/data/test/delete-update");
    });

    it("should handle bulk operations dry run", async () => {
      const operations = [
        { path: "secret/data/test/bulk1", data: { id: 1 } },
        { path: "secret/data/test/bulk2", data: { id: 2 } },
        { path: "secret/data/test/bulk3", data: { id: 3 } },
      ];

      const result = await vaultClient.bulkWriteSecrets(operations, true);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].dryRun).toBe(true);
      expect(result.results[0].success).toBe(true);
    });

    it("should handle bulk delete dry run", async () => {
      // 먼저 실제 시크릿들을 생성
      await vaultClient.writeSecret("secret/data/test/bulk-delete1", {
        data: "test1",
      });
      await vaultClient.writeSecret("secret/data/test/bulk-delete2", {
        data: "test2",
      });

      const paths = [
        "secret/data/test/bulk-delete1",
        "secret/data/test/bulk-delete2",
        "secret/data/test/nonexistent",
      ];

      const result = await vaultClient.bulkDeleteSecrets(paths, true);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true); // 존재하는 시크릿
      expect(result.results[1].success).toBe(true); // 존재하는 시크릿
      expect(result.results[2].success).toBe(false); // 존재하지 않는 시크릿

      // 정리
      await vaultClient.deleteSecret("secret/data/test/bulk-delete1");
      await vaultClient.deleteSecret("secret/data/test/bulk-delete2");
    });

    it("should handle complex dependency chains", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: "secret/data/test/chain-a",
          data: { step: "1" },
        },
        {
          type: "create",
          path: "secret/data/test/chain-b",
          data: { step: "2" },
        },
        {
          type: "update",
          path: "secret/data/test/chain-a",
          data: { step: "1-updated" },
        },
        { type: "delete", path: "secret/data/test/chain-b" },
        {
          type: "create",
          path: "secret/data/test/chain-c",
          data: { step: "3" },
        },
        {
          type: "create",
          path: "secret/data/test/chain-b",
          data: { step: "2-recreated" },
        },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(6);

      // 모든 작업이 성공해야 함
      result.results.forEach((res) => {
        expect(res.wouldSucceed).toBe(true);
      });
    });

    it("should handle data validation scenarios", async () => {
      const operations: TransactionOperation[] = [
        { type: "create", path: "secret/data/test/empty-data", data: {} },
        {
          type: "create",
          path: "secret/data/test/large-data",
          data: {
            large: "x".repeat(1000),
            nested: { deep: { very: { deep: "value" } } },
          },
        },
        {
          type: "create",
          path: "secret/data/test/special-chars",
          data: {
            "key-with-dash": "value",
            key_with_underscore: "value",
            "key.with.dots": "value",
          },
        },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);

      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.results).toHaveLength(3);

      // 모든 데이터 형식이 유효해야 함
      result.results.forEach((res) => {
        expect(res.wouldSucceed).toBe(true);
      });
    });

    it("should handle edge cases", async () => {
      // 빈 트랜잭션
      const emptyResult = await vaultClient.executeTransactionDryRun([]);
      expect(emptyResult.wouldSucceed).toBe(true);
      expect(emptyResult.results).toHaveLength(0);

      // 매우 긴 경로명
      const longPath =
        "secret/data/test/" + "very-long-path-name-".repeat(10) + "end";
      const longPathOps: TransactionOperation[] = [
        { type: "create", path: longPath, data: { test: "long-path" } },
      ];

      const longPathResult = await vaultClient.executeTransactionDryRun(
        longPathOps
      );
      expect(longPathResult.wouldSucceed).toBe(true);
    });

    it("should detect circular dependency patterns", async () => {
      // 순환 의존성은 실제로는 불가능하지만, 복잡한 패턴 테스트
      const operations: TransactionOperation[] = [
        { type: "create", path: "secret/data/test/circ-a", data: { ref: "b" } },
        { type: "create", path: "secret/data/test/circ-b", data: { ref: "c" } },
        { type: "create", path: "secret/data/test/circ-c", data: { ref: "a" } },
        {
          type: "update",
          path: "secret/data/test/circ-a",
          data: { ref: "b", updated: true },
        },
        { type: "delete", path: "secret/data/test/circ-b" },
        { type: "delete", path: "secret/data/test/circ-c" },
        { type: "delete", path: "secret/data/test/circ-a" },
      ];

      const result = await vaultClient.executeTransactionDryRun(operations);
      expect(result.dryRun).toBe(true);
      expect(result.wouldSucceed).toBe(true);
    });
  });
});

/**
 * 트랜잭션 및 롤백 기능 테스트
 * 가장 중요한 롤백 로직의 정확성을 검증합니다.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "@jest/globals";
import { TransactionOperation } from "../../src/types.js";
import { VaultClient } from "../../src/vault-client.js";
import {
  createTestVaultClient,
  generateTestPath,
  generateTestSecretData,
  isVaultAvailable,
  TestPathTracker,
} from "../helpers/vault-test-helper.js";

describe("Transaction and Rollback", () => {
  let vaultClient: VaultClient;
  let pathTracker: TestPathTracker;

  beforeAll(async () => {
    const isAvailable = await isVaultAvailable();
    if (!isAvailable) {
      throw new Error(
        "Vault server is not available. Please start Vault server before running tests."
      );
    }
  });

  beforeEach(() => {
    vaultClient = createTestVaultClient();
    pathTracker = new TestPathTracker();
  });

  afterEach(async () => {
    await pathTracker.cleanup(vaultClient);
  });

  describe("Successful Transactions", () => {
    test("should commit all operations when transaction succeeds", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: generateTestPath("tx-success-1"),
          data: generateTestSecretData({ step: 1 }),
        },
        {
          type: "create",
          path: generateTestPath("tx-success-2"),
          data: generateTestSecretData({ step: 2 }),
        },
        {
          type: "create",
          path: generateTestPath("tx-success-3"),
          data: generateTestSecretData({ step: 3 }),
        },
      ];

      operations.forEach((op) => pathTracker.addPath(op.path));

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);
      expect(result.summary.failed).toBe(0);
      expect(result.summary.rolledBack).toBe(0);

      // Verify all secrets were created
      for (const op of operations) {
        const secret = await vaultClient.readSecret(op.path);
        expect(secret?.data).toEqual(op.data);
      }
    });

    test("should handle mixed operations in successful transaction", async () => {
      // First create a secret to update later
      const existingPath = generateTestPath("existing");
      const existingData = generateTestSecretData({ version: 1 });
      pathTracker.addPath(existingPath);
      await vaultClient.writeSecret(existingPath, existingData);

      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: generateTestPath("tx-mixed-create"),
          data: generateTestSecretData({ type: "create" }),
        },
        {
          type: "update",
          path: existingPath,
          data: generateTestSecretData({ version: 2, type: "update" }),
        },
        {
          type: "read",
          path: existingPath,
        },
      ];

      pathTracker.addPath(operations[0].path);

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);

      // Verify create operation
      const createdSecret = await vaultClient.readSecret(operations[0].path);
      expect(createdSecret?.data).toEqual(operations[0].data);

      // Verify update operation
      const updatedSecret = await vaultClient.readSecret(existingPath);
      expect(updatedSecret?.data).toEqual(operations[1].data);
    });
  });

  describe("Failed Transactions and Rollback", () => {
    test("should rollback CREATE operations when transaction fails", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: generateTestPath("rollback-create-1"),
          data: generateTestSecretData({ step: 1 }),
        },
        {
          type: "create",
          path: generateTestPath("rollback-create-2"),
          data: generateTestSecretData({ step: 2 }),
        },
        {
          type: "create",
          path: "invalid/system/path", // This will fail
          data: generateTestSecretData({ step: 3 }),
        },
        {
          type: "create",
          path: generateTestPath("rollback-create-4"),
          data: generateTestSecretData({ step: 4 }),
        },
      ];

      // Track valid paths for potential cleanup
      pathTracker.addPath(operations[0].path);
      pathTracker.addPath(operations[1].path);
      pathTracker.addPath(operations[3].path);

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.rolledBack).toBe(2);

      // Verify rollback: created secrets should be deleted
      const secret1 = await vaultClient.readSecret(operations[0].path);
      const secret2 = await vaultClient.readSecret(operations[1].path);
      const secret4 = await vaultClient.readSecret(operations[3].path);

      expect(secret1).toBeNull(); // Should be rolled back
      expect(secret2).toBeNull(); // Should be rolled back
      expect(secret4).toBeNull(); // Should never have been created
    });

    test("should rollback UPDATE operations when transaction fails", async () => {
      // Create initial secrets
      const path1 = generateTestPath("rollback-update-1");
      const path2 = generateTestPath("rollback-update-2");
      const originalData1 = generateTestSecretData({
        version: 1,
        original: true,
      });
      const originalData2 = generateTestSecretData({
        version: 1,
        original: true,
      });

      pathTracker.addPath(path1);
      pathTracker.addPath(path2);

      await vaultClient.writeSecret(path1, originalData1);
      await vaultClient.writeSecret(path2, originalData2);

      const operations: TransactionOperation[] = [
        {
          type: "update",
          path: path1,
          data: generateTestSecretData({ version: 2, updated: true }),
        },
        {
          type: "update",
          path: path2,
          data: generateTestSecretData({ version: 2, updated: true }),
        },
        {
          type: "create",
          path: "sys/invalid/path", // This will fail
          data: generateTestSecretData(),
        },
      ];

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.rolledBack).toBe(2);

      // Verify rollback: secrets should be restored to original state
      const restoredSecret1 = await vaultClient.readSecret(path1);
      const restoredSecret2 = await vaultClient.readSecret(path2);

      expect(restoredSecret1?.data).toEqual(originalData1);
      expect(restoredSecret2?.data).toEqual(originalData2);
    });

    test("should rollback DELETE operations when transaction fails", async () => {
      // Create a secret to delete
      const path = generateTestPath("rollback-delete");
      const originalData = generateTestSecretData({ toBeDeleted: true });
      pathTracker.addPath(path);
      await vaultClient.writeSecret(path, originalData);

      const operations: TransactionOperation[] = [
        {
          type: "delete",
          path: path,
        },
        {
          type: "create",
          path: "invalid/path/format", // This will fail
          data: generateTestSecretData(),
        },
      ];

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.rolledBack).toBe(1);

      // Verify rollback: deleted secret should be restored
      const restoredSecret = await vaultClient.readSecret(path);
      expect(restoredSecret?.data).toEqual(originalData);
    });

    test("should handle complex mixed rollback scenario", async () => {
      // Setup existing secrets
      const existingPath1 = generateTestPath("existing-1");
      const existingPath2 = generateTestPath("existing-2");
      const originalData1 = generateTestSecretData({ id: 1, original: true });
      const originalData2 = generateTestSecretData({ id: 2, original: true });

      pathTracker.addPath(existingPath1);
      pathTracker.addPath(existingPath2);

      await vaultClient.writeSecret(existingPath1, originalData1);
      await vaultClient.writeSecret(existingPath2, originalData2);

      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: generateTestPath("complex-create"),
          data: generateTestSecretData({ type: "create" }),
        },
        {
          type: "update",
          path: existingPath1,
          data: generateTestSecretData({ id: 1, updated: true }),
        },
        {
          type: "delete",
          path: existingPath2,
        },
        {
          type: "create",
          path: generateTestPath("complex-create-2"),
          data: generateTestSecretData({ type: "create2" }),
        },
        {
          type: "create",
          path: "sys/auth/invalid/path", // This will fail
          data: generateTestSecretData(),
        },
      ];

      pathTracker.addPath(operations[0].path);
      pathTracker.addPath(operations[3].path);

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.summary.succeeded).toBe(4);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.rolledBack).toBe(4);

      // Verify all rollbacks
      const createdSecret1 = await vaultClient.readSecret(operations[0].path);
      const updatedSecret = await vaultClient.readSecret(existingPath1);
      const deletedSecret = await vaultClient.readSecret(existingPath2);
      const createdSecret2 = await vaultClient.readSecret(operations[3].path);

      expect(createdSecret1).toBeNull(); // CREATE rolled back
      expect(updatedSecret?.data).toEqual(originalData1); // UPDATE rolled back
      expect(deletedSecret?.data).toEqual(originalData2); // DELETE rolled back
      expect(createdSecret2).toBeNull(); // CREATE rolled back
    });
  });

  describe("Transaction Error Scenarios", () => {
    test("should handle invalid path formats", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: generateTestPath("valid"),
          data: generateTestSecretData(),
        },
        {
          type: "create",
          path: "", // Empty path
          data: generateTestSecretData(),
        },
      ];

      pathTracker.addPath(operations[0].path);

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.summary.failed).toBeGreaterThan(0);

      // First operation should be rolled back
      const secret = await vaultClient.readSecret(operations[0].path);
      expect(secret).toBeNull();
    });

    test("should handle system path access attempts", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: generateTestPath("before-system"),
          data: generateTestSecretData(),
        },
        {
          type: "create",
          path: "sys/policy/test-policy",
          data: { policy: "invalid" },
        },
      ];

      pathTracker.addPath(operations[0].path);

      const result = await vaultClient.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.summary.failed).toBeGreaterThan(0);

      // Verify rollback
      const secret = await vaultClient.readSecret(operations[0].path);
      expect(secret).toBeNull();
    });
  });

  describe("Transaction Performance and Reliability", () => {
    test("should handle large transactions efficiently", async () => {
      const operationCount = 10;
      const operations: TransactionOperation[] = [];

      for (let i = 0; i < operationCount; i++) {
        const path = generateTestPath(`large-tx-${i}`);
        pathTracker.addPath(path);
        operations.push({
          type: "create",
          path,
          data: generateTestSecretData({ index: i, large: true }),
        });
      }

      const startTime = Date.now();
      const result = await vaultClient.executeTransaction(operations);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(operationCount);
      expect(result.summary.succeeded).toBe(operationCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all secrets were created
      for (let i = 0; i < operationCount; i++) {
        const secret = await vaultClient.readSecret(operations[i].path);
        expect(secret?.data.index).toBe(i);
      }
    });

    test("should maintain transaction isolation", async () => {
      const sharedPath = generateTestPath("shared");
      const initialData = generateTestSecretData({ shared: true, version: 0 });
      pathTracker.addPath(sharedPath);
      await vaultClient.writeSecret(sharedPath, initialData);

      // Execute a transaction that will fail
      const result = await vaultClient.executeTransaction([
        {
          type: "update",
          path: sharedPath,
          data: generateTestSecretData({
            shared: true,
            version: 1,
            failing: true,
          }),
        },
        {
          type: "create",
          path: "invalid/path",
          data: generateTestSecretData(),
        },
      ]);

      expect(result.success).toBe(false);

      // Verify isolation: the secret should be back to original state after rollback
      const afterTransaction = await vaultClient.readSecret(sharedPath);
      expect(afterTransaction?.data).toEqual(initialData);

      // Verify that no partial changes were committed
      const nonExistentSecret = await vaultClient.readSecret("invalid/path");
      expect(nonExistentSecret).toBeNull();
    });
  });
});

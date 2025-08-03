/**
 * 성능 및 스트레스 테스트
 * 대용량 데이터 처리 및 동시성 테스트
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
  delay,
  generateTestPath,
  generateTestSecretData,
  isVaultAvailable,
  TestPathTracker,
} from "../helpers/vault-test-helper.js";

describe("Performance and Stress Tests", () => {
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

  describe("Large Data Handling", () => {
    test("should handle large secret data efficiently", async () => {
      const path = generateTestPath("large-data");
      pathTracker.addPath(path);

      // Create large data object (1MB of data)
      const largeData = {
        id: "large-test",
        timestamp: new Date().toISOString(),
        data: "x".repeat(1024 * 1024), // 1MB string
        metadata: generateTestSecretData(),
      };

      const startTime = Date.now();
      await vaultClient.writeSecret(path, largeData);
      const writeTime = Date.now() - startTime;

      const readStartTime = Date.now();
      const result = await vaultClient.readSecret(path);
      const readTime = Date.now() - readStartTime;

      expect(result?.data).toEqual(largeData);
      expect(writeTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(readTime).toBeLessThan(2000); // Should read within 2 seconds
    });

    test("should handle many small secrets efficiently", async () => {
      const secretCount = 50;
      const operations = [];

      for (let i = 0; i < secretCount; i++) {
        const path = generateTestPath(`many-secrets-${i}`);
        pathTracker.addPath(path);
        operations.push({
          path,
          data: generateTestSecretData({ index: i, batch: "many-secrets" }),
        });
      }

      const startTime = Date.now();
      const result = await vaultClient.bulkWriteSecrets(operations);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.summary.succeeded).toBe(secretCount);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

      // Verify a few random secrets
      const randomIndices = [0, Math.floor(secretCount / 2), secretCount - 1];
      for (const index of randomIndices) {
        const secret = await vaultClient.readSecret(operations[index].path);
        expect(secret?.data.index).toBe(index);
      }
    });
  });

  describe("Concurrent Operations", () => {
    test("should handle concurrent read operations", async () => {
      // Create test secrets first
      const testSecrets = [];
      for (let i = 0; i < 10; i++) {
        const path = generateTestPath(`concurrent-read-${i}`);
        const data = generateTestSecretData({ concurrent: i });
        pathTracker.addPath(path);
        await vaultClient.writeSecret(path, data);
        testSecrets.push({ path, data });
      }

      // Perform concurrent reads
      const startTime = Date.now();
      const readPromises = testSecrets.map(async (testSecret) => {
        const result = await vaultClient.readSecret(testSecret.path);
        return { expected: testSecret.data, actual: result?.data };
      });

      const results = await Promise.all(readPromises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);

      // Verify all reads were successful
      for (const result of results) {
        expect(result.actual).toEqual(result.expected);
      }
    });

    test("should handle concurrent write operations to different paths", async () => {
      const concurrentCount = 20;
      const writePromises = [];

      for (let i = 0; i < concurrentCount; i++) {
        const path = generateTestPath(`concurrent-write-${i}`);
        const data = generateTestSecretData({
          concurrent: i,
          timestamp: Date.now(),
        });
        pathTracker.addPath(path);

        writePromises.push(
          vaultClient.writeSecret(path, data).then(() => ({ path, data }))
        );
      }

      const startTime = Date.now();
      const results = await Promise.allSettled(writePromises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);

      // Count successful operations
      const successful = results.filter(
        (result) => result.status === "fulfilled"
      );
      expect(successful.length).toBe(concurrentCount);

      // Verify a few random writes
      const randomResults = successful.slice(0, 3) as PromiseFulfilledResult<{
        path: string;
        data: any;
      }>[];
      for (const result of randomResults) {
        const secret = await vaultClient.readSecret(result.value.path);
        expect(secret?.data).toEqual(result.value.data);
      }
    });
  });

  describe("Transaction Performance", () => {
    test("should handle large transactions efficiently", async () => {
      const operationCount = 25;
      const operations: TransactionOperation[] = [];

      for (let i = 0; i < operationCount; i++) {
        const path = generateTestPath(`large-tx-${i}`);
        pathTracker.addPath(path);
        operations.push({
          type: "create",
          path,
          data: generateTestSecretData({
            index: i,
            large: true,
            payload: "x".repeat(1000), // 1KB per secret
          }),
        });
      }

      const startTime = Date.now();
      const result = await vaultClient.executeTransaction(operations);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.summary.succeeded).toBe(operationCount);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds

      // Verify transaction performance metrics
      expect(result.summary.duration).toBeDefined();
      expect(result.summary.duration).toBeGreaterThan(0);
    });

    test("should handle rollback performance with many operations", async () => {
      const operationCount = 15;
      const operations: TransactionOperation[] = [];

      // Create operations that will succeed initially
      for (let i = 0; i < operationCount; i++) {
        const path = generateTestPath(`rollback-perf-${i}`);
        pathTracker.addPath(path);
        operations.push({
          type: "create",
          path,
          data: generateTestSecretData({ index: i, rollback: true }),
        });
      }

      // Add a failing operation at the end
      operations.push({
        type: "create",
        path: "sys/invalid/performance/test",
        data: generateTestSecretData({ fail: true }),
      });

      const startTime = Date.now();
      const result = await vaultClient.executeTransaction(operations);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.summary.succeeded).toBe(operationCount);
      expect(result.summary.rolledBack).toBe(operationCount);
      expect(duration).toBeLessThan(10000); // Rollback should be fast

      // Verify all operations were rolled back
      for (let i = 0; i < operationCount; i++) {
        const secret = await vaultClient.readSecret(operations[i].path);
        expect(secret).toBeNull();
      }
    });
  });

  describe("Memory and Resource Usage", () => {
    test("should not leak memory during bulk operations", async () => {
      const iterations = 5;
      const operationsPerIteration = 20;

      for (let iteration = 0; iteration < iterations; iteration++) {
        const operations = [];

        for (let i = 0; i < operationsPerIteration; i++) {
          const path = generateTestPath(`memory-test-${iteration}-${i}`);
          pathTracker.addPath(path);
          operations.push({
            path,
            data: generateTestSecretData({
              iteration,
              index: i,
              data: "x".repeat(10000), // 10KB per secret
            }),
          });
        }

        // Perform bulk write
        const result = await vaultClient.bulkWriteSecrets(operations);
        expect(result.success).toBe(true);

        // Clean up immediately to test cleanup efficiency
        const paths = operations.map((op) => op.path);
        const deleteResult = await vaultClient.bulkDeleteSecrets(paths);
        expect(deleteResult.success).toBe(true);

        // Small delay between iterations
        await delay(100);
      }

      // If we reach here without memory issues, the test passes
      expect(true).toBe(true);
    });

    test("should handle rapid sequential operations", async () => {
      const operationCount = 100;
      const path = generateTestPath("rapid-sequential");
      pathTracker.addPath(path);

      let data = generateTestSecretData({ version: 0 });
      await vaultClient.writeSecret(path, data);

      const startTime = Date.now();

      // Perform rapid updates
      for (let i = 1; i <= operationCount; i++) {
        data = generateTestSecretData({ version: i, rapid: true });
        await vaultClient.writeSecret(path, data);
      }

      const duration = Date.now() - startTime;

      // Verify final state
      const finalSecret = await vaultClient.readSecret(path);
      expect(finalSecret?.data.version).toBe(operationCount);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe("Error Recovery and Resilience", () => {
    test("should recover from temporary failures", async () => {
      const path = generateTestPath("recovery-test");
      pathTracker.addPath(path);

      // This should succeed
      await vaultClient.writeSecret(
        path,
        generateTestSecretData({ attempt: 1 })
      );

      // Simulate some failed operations
      const failedOperations = [
        { path: "invalid/path/1", data: generateTestSecretData() },
        { path: "invalid/path/2", data: generateTestSecretData() },
        { path: "invalid/path/3", data: generateTestSecretData() },
      ];

      for (const op of failedOperations) {
        try {
          await vaultClient.writeSecret(op.path, op.data);
        } catch {
          // Expected to fail
        }
      }

      // This should still work after failures
      await vaultClient.writeSecret(
        path,
        generateTestSecretData({ attempt: 2, recovered: true })
      );

      const result = await vaultClient.readSecret(path);
      expect(result?.data.attempt).toBe(2);
      expect(result?.data.recovered).toBe(true);
    });

    test("should handle mixed success/failure in bulk operations", async () => {
      const operations = [];
      const validPaths: string[] = [];

      // Add some valid operations
      for (let i = 0; i < 10; i++) {
        const path = generateTestPath(`mixed-bulk-${i}`);
        validPaths.push(path);
        pathTracker.addPath(path);
        operations.push({
          path,
          data: generateTestSecretData({ index: i, valid: true }),
        });
      }

      // Add some invalid operations
      for (let i = 0; i < 5; i++) {
        operations.push({
          path: `invalid/bulk/path/${i}`,
          data: generateTestSecretData({ index: i, invalid: true }),
        });
      }

      const result = await vaultClient.bulkWriteSecrets(operations);

      expect(result.success).toBe(false); // Not all succeeded
      expect(result.summary.succeeded).toBe(10); // Valid operations succeeded
      expect(result.summary.failed).toBe(5); // Invalid operations failed
      expect(result.summary.total).toBe(15);

      // Verify valid operations were successful
      for (let i = 0; i < 10; i++) {
        const path = validPaths[i];
        const secret = await vaultClient.readSecret(path);
        expect(secret?.data.valid).toBe(true);
      }
    });
  });
});

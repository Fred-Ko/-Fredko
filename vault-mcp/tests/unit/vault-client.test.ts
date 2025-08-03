/**
 * VaultClient 단위 테스트
 * 기본 CRUD 작업 및 설정 테스트
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "@jest/globals";
import { VaultClient } from "../../src/vault-client.js";
import {
  createTestVaultClient,
  expectToThrowAsync,
  generateTestPath,
  generateTestSecretData,
  isVaultAvailable,
  TestPathTracker,
} from "../helpers/vault-test-helper.js";

describe("VaultClient", () => {
  let vaultClient: VaultClient;
  let pathTracker: TestPathTracker;

  beforeAll(async () => {
    // Vault 서버가 실행 중인지 확인
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
    // 테스트 후 생성된 시크릿들 정리
    await pathTracker.cleanup(vaultClient);
  });

  describe("Health Check", () => {
    test("should successfully check vault health", async () => {
      const health = await vaultClient.getHealth();

      expect(health).toBeDefined();
      expect(health.initialized).toBe(true);
      expect(health.sealed).toBe(false);
    });
  });

  describe("Secret CRUD Operations", () => {
    test("should create and read a secret", async () => {
      const path = generateTestPath("create-read");
      const data = generateTestSecretData({
        username: "testuser",
        password: "testpass123",
      });

      pathTracker.addPath(path);

      // Create secret
      await vaultClient.writeSecret(path, data);

      // Read secret
      const result = await vaultClient.readSecret(path);

      expect(result).toBeDefined();
      expect(result?.data).toEqual(data);
    });

    test("should update an existing secret", async () => {
      const path = generateTestPath("update");
      const originalData = generateTestSecretData({ version: 1 });
      const updatedData = generateTestSecretData({ version: 2, updated: true });

      pathTracker.addPath(path);

      // Create original secret
      await vaultClient.writeSecret(path, originalData);

      // Update secret
      await vaultClient.writeSecret(path, updatedData);

      // Read updated secret
      const result = await vaultClient.readSecret(path);

      expect(result?.data).toEqual(updatedData);
      expect(result?.data.version).toBe(2);
    });

    test("should delete a secret", async () => {
      const path = generateTestPath("delete");
      const data = generateTestSecretData();

      pathTracker.addPath(path);

      // Create secret
      await vaultClient.writeSecret(path, data);

      // Verify it exists
      const beforeDelete = await vaultClient.readSecret(path);
      expect(beforeDelete).toBeDefined();

      // Delete secret
      await vaultClient.deleteSecret(path);

      // Verify it's deleted
      const afterDelete = await vaultClient.readSecret(path);
      expect(afterDelete).toBeNull();
    });

    test("should return null for non-existent secret", async () => {
      const path = generateTestPath("non-existent");

      const result = await vaultClient.readSecret(path);
      expect(result).toBeNull();
    });

    test("should handle invalid path format", async () => {
      const invalidPath = "invalid-path-format";
      const data = generateTestSecretData();

      await expectToThrowAsync(
        () => vaultClient.writeSecret(invalidPath, data),
        "Secret not found"
      );
    });
  });

  describe("Bulk Operations", () => {
    test("should perform bulk write operations", async () => {
      const operations = [
        {
          path: generateTestPath("bulk1"),
          data: generateTestSecretData({ service: "service1" }),
        },
        {
          path: generateTestPath("bulk2"),
          data: generateTestSecretData({ service: "service2" }),
        },
        {
          path: generateTestPath("bulk3"),
          data: generateTestSecretData({ service: "service3" }),
        },
      ];

      operations.forEach((op) => pathTracker.addPath(op.path));

      const result = await vaultClient.bulkWriteSecrets(operations);

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);
      expect(result.summary.failed).toBe(0);

      // Verify all secrets were created
      for (const op of operations) {
        const secret = await vaultClient.readSecret(op.path);
        expect(secret?.data).toEqual(op.data);
      }
    });

    test("should perform bulk read operations", async () => {
      const testData = [
        {
          path: generateTestPath("read1"),
          data: generateTestSecretData({ id: 1 }),
        },
        {
          path: generateTestPath("read2"),
          data: generateTestSecretData({ id: 2 }),
        },
        {
          path: generateTestPath("read3"),
          data: generateTestSecretData({ id: 3 }),
        },
      ];

      // Create test secrets
      for (const item of testData) {
        pathTracker.addPath(item.path);
        await vaultClient.writeSecret(item.path, item.data);
      }

      const paths = testData.map((item) => item.path);
      const result = await vaultClient.bulkReadSecrets(paths);

      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);
      expect(result.summary.failed).toBe(0);

      // Verify data matches
      result.results.forEach((resultItem, index) => {
        expect(resultItem.success).toBe(true);
        expect(resultItem.data).toEqual(testData[index].data);
      });
    });

    test("should perform bulk delete operations", async () => {
      const paths = [
        generateTestPath("delete1"),
        generateTestPath("delete2"),
        generateTestPath("delete3"),
      ];

      // Create test secrets
      for (const path of paths) {
        pathTracker.addPath(path);
        await vaultClient.writeSecret(path, generateTestSecretData());
      }

      const result = await vaultClient.bulkDeleteSecrets(paths);

      expect(result.success).toBe(true);
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(3);
      expect(result.summary.failed).toBe(0);

      // Verify all secrets were deleted
      for (const path of paths) {
        const secret = await vaultClient.readSecret(path);
        expect(secret).toBeNull();
      }
    });

    test("should handle partial failures in bulk operations", async () => {
      const operations = [
        {
          path: generateTestPath("valid"),
          data: generateTestSecretData(),
        },
        {
          path: "invalid-path",
          data: generateTestSecretData(),
        },
        {
          path: generateTestPath("also-valid"),
          data: generateTestSecretData(),
        },
      ];

      // Track only valid paths for cleanup
      pathTracker.addPath(operations[0].path);
      pathTracker.addPath(operations[2].path);

      const result = await vaultClient.bulkWriteSecrets(operations);

      expect(result.success).toBe(false); // Not all succeeded
      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(1);

      // Verify successful operations
      const validSecret1 = await vaultClient.readSecret(operations[0].path);
      const validSecret2 = await vaultClient.readSecret(operations[2].path);

      expect(validSecret1?.data).toEqual(operations[0].data);
      expect(validSecret2?.data).toEqual(operations[2].data);
    });
  });

  describe("List Operations", () => {
    test("should list secrets in a path", async () => {
      const basePath = generateTestPath("list-test");
      const secretPaths = [
        `${basePath}/secret1`,
        `${basePath}/secret2`,
        `${basePath}/secret3`,
      ];

      // Create test secrets
      for (const path of secretPaths) {
        pathTracker.addPath(path);
        await vaultClient.writeSecret(path, generateTestSecretData());
      }

      const metadataPath = basePath.replace("/data/", "/metadata/");
      const secrets = await vaultClient.listSecrets(metadataPath);

      expect(secrets).toContain("secret1");
      expect(secrets).toContain("secret2");
      expect(secrets).toContain("secret3");
      expect(secrets.length).toBeGreaterThanOrEqual(3);
    });

    test("should return empty array for non-existent path", async () => {
      const nonExistentPath = generateTestPath("non-existent").replace(
        "/data/",
        "/metadata/"
      );

      const secrets = await vaultClient.listSecrets(nonExistentPath);
      expect(secrets).toEqual([]);
    });
  });

  describe("Error Handling", () => {
    test("should handle network errors gracefully", async () => {
      // Create client with invalid endpoint
      const invalidClient = new VaultClient({
        endpoint: "http://localhost:9999",
        token: "invalid",
        permissions: { read: true, write: true },
        allowedPaths: [],
        allowedWorkingDirectory: undefined,
      });

      await expectToThrowAsync(() => invalidClient.getHealth(), "ECONNREFUSED");
    });

    test("should handle invalid authentication", async () => {
      // Create client with invalid token
      const invalidClient = new VaultClient({
        endpoint: "http://localhost:8200",
        token: "invalid-token",
        permissions: { read: true, write: true },
        allowedPaths: [],
        allowedWorkingDirectory: undefined,
      });

      const path = generateTestPath("auth-test");
      const data = generateTestSecretData();

      await expectToThrowAsync(
        () => invalidClient.writeSecret(path, data),
        "permission denied"
      );
    });
  });
});

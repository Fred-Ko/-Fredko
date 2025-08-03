/**
 * Path Restrictions 테스트
 * 경로 제한 기능에 대한 포괄적인 테스트
 */

import { beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { VaultPathNotAllowedError } from "../../src/errors.js";
import { TransactionOperation } from "../../src/types.js";
import { VaultClient } from "../../src/vault-client.js";
import {
  createTestVaultClient,
  generateTestPath,
  isVaultAvailable,
} from "../helpers/vault-test-helper.js";

describe("Path Restrictions", () => {
  let vaultClient: VaultClient;

  beforeAll(async () => {
    if (!isVaultAvailable()) {
      console.log("Vault is not available, skipping path restriction tests");
      return;
    }
  });

  beforeEach(() => {
    if (!isVaultAvailable()) {
      return;
    }
    vaultClient = createTestVaultClient();
  });

  describe("Basic Path Validation", () => {
    test("should allow all paths when allowedPaths is empty", async () => {
      const client = createTestVaultClient({
        allowedPaths: [],
      });

      const testPath = generateTestPath("unrestricted");

      // 실제 작업 테스트
      await expect(
        client.writeSecret(testPath, { test: "data" })
      ).resolves.not.toThrow();

      // Dry run 테스트
      const dryRunResult = (await client.writeSecret(
        testPath,
        { test: "data" },
        true
      )) as any;
      expect(dryRunResult.wouldSucceed).toBe(true);

      // 정리
      await client.deleteSecret(testPath);
    });

    test("should allow all paths when allowedPaths is undefined", async () => {
      const client = createTestVaultClient({
        allowedPaths: undefined,
      });

      const testPath = generateTestPath("undefined-paths");

      await expect(
        client.writeSecret(testPath, { test: "data" })
      ).resolves.not.toThrow();

      // 정리
      await client.deleteSecret(testPath);
    });

    test("should restrict paths when allowedPaths is specified", async () => {
      const client = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });

      // 허용된 경로
      const allowedPath = "secret/data/allowed/test";
      await expect(
        client.writeSecret(allowedPath, { test: "data" })
      ).resolves.not.toThrow();

      // 금지된 경로
      const forbiddenPath = "secret/data/forbidden/test";
      await expect(
        client.writeSecret(forbiddenPath, { test: "data" })
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 정리
      await client.deleteSecret(allowedPath);
    });
  });

  describe("Path Pattern Matching", () => {
    test("should handle exact path matches", async () => {
      const client = createTestVaultClient({
        allowedPaths: ["secret/data/exact/path"],
      });

      // 정확한 경로 - 허용
      await expect(
        client.writeSecret("secret/data/exact/path", { test: "data" })
      ).resolves.not.toThrow();

      // 부분 경로 - 금지
      await expect(
        client.writeSecret("secret/data/exact", { test: "data" })
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 더 긴 경로 - 허용 (startsWith 로직)
      await expect(
        client.writeSecret("secret/data/exact/path/sub", { test: "data" })
      ).resolves.not.toThrow();

      // 정리
      await client.deleteSecret("secret/data/exact/path");
      await client.deleteSecret("secret/data/exact/path/sub");
    });

    test("should handle prefix-based matching", async () => {
      const client = createTestVaultClient({
        allowedPaths: ["secret/data/app1/", "secret/data/app2/"],
      });

      // app1 경로들 - 허용
      await expect(
        client.writeSecret("secret/data/app1/config", { test: "data" })
      ).resolves.not.toThrow();

      await expect(
        client.writeSecret("secret/data/app1/database/password", {
          test: "data",
        })
      ).resolves.not.toThrow();

      // app2 경로들 - 허용
      await expect(
        client.writeSecret("secret/data/app2/api-key", { test: "data" })
      ).resolves.not.toThrow();

      // app3 경로 - 금지
      await expect(
        client.writeSecret("secret/data/app3/config", { test: "data" })
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 유사하지만 다른 경로 - 금지
      await expect(
        client.writeSecret("secret/data/app11/config", { test: "data" })
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 정리
      await client.deleteSecret("secret/data/app1/config");
      await client.deleteSecret("secret/data/app1/database/password");
      await client.deleteSecret("secret/data/app2/api-key");
    });

    test("should handle wildcard-like patterns", async () => {
      const client = createTestVaultClient({
        allowedPaths: [
          "secret/data/prod/",
          "secret/data/staging/",
          "secret/data/dev/",
        ],
      });

      const environments = ["prod", "staging", "dev"];
      const forbiddenEnvs = ["test", "local", "production"];

      // 허용된 환경들
      for (const env of environments) {
        await expect(
          client.writeSecret(`secret/data/${env}/app/config`, { env })
        ).resolves.not.toThrow();

        // 정리
        await client.deleteSecret(`secret/data/${env}/app/config`);
      }

      // 금지된 환경들
      for (const env of forbiddenEnvs) {
        await expect(
          client.writeSecret(`secret/data/${env}/app/config`, { env })
        ).rejects.toThrow(VaultPathNotAllowedError);
      }
    });
  });

  describe("CRUD Operations with Path Restrictions", () => {
    let restrictedClient: VaultClient;

    beforeEach(() => {
      if (!isVaultAvailable()) return;

      restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });
    });

    test("should restrict READ operations", async () => {
      // 먼저 허용된 경로에 데이터 생성 (제한 없는 클라이언트로)
      await vaultClient.writeSecret("secret/data/allowed/read-test", {
        test: "data",
      });
      await vaultClient.writeSecret("secret/data/forbidden/read-test", {
        test: "data",
      });

      // 허용된 경로 읽기 - 성공
      const allowedData = await restrictedClient.readSecret(
        "secret/data/allowed/read-test"
      );
      expect(allowedData).not.toBeNull();
      expect(allowedData?.data.test).toBe("data");

      // 금지된 경로 읽기 - 실패
      await expect(
        restrictedClient.readSecret("secret/data/forbidden/read-test")
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 정리
      await vaultClient.deleteSecret("secret/data/allowed/read-test");
      await vaultClient.deleteSecret("secret/data/forbidden/read-test");
    });

    test("should restrict UPDATE operations", async () => {
      // 허용된 경로에 초기 데이터 생성
      await vaultClient.writeSecret("secret/data/allowed/update-test", {
        version: 1,
      });
      await vaultClient.writeSecret("secret/data/forbidden/update-test", {
        version: 1,
      });

      // 허용된 경로 업데이트 - 성공
      await expect(
        restrictedClient.writeSecret("secret/data/allowed/update-test", {
          version: 2,
        })
      ).resolves.not.toThrow();

      // 금지된 경로 업데이트 - 실패
      await expect(
        restrictedClient.writeSecret("secret/data/forbidden/update-test", {
          version: 2,
        })
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 정리
      await vaultClient.deleteSecret("secret/data/allowed/update-test");
      await vaultClient.deleteSecret("secret/data/forbidden/update-test");
    });

    test("should restrict DELETE operations", async () => {
      // 테스트 데이터 생성
      await vaultClient.writeSecret("secret/data/allowed/delete-test", {
        test: "data",
      });
      await vaultClient.writeSecret("secret/data/forbidden/delete-test", {
        test: "data",
      });

      // 허용된 경로 삭제 - 성공
      await expect(
        restrictedClient.deleteSecret("secret/data/allowed/delete-test")
      ).resolves.not.toThrow();

      // 금지된 경로 삭제 - 실패
      await expect(
        restrictedClient.deleteSecret("secret/data/forbidden/delete-test")
      ).rejects.toThrow(VaultPathNotAllowedError);

      // 정리
      await vaultClient.deleteSecret("secret/data/forbidden/delete-test");
    });
  });

  describe("Dry Run with Path Restrictions", () => {
    let restrictedClient: VaultClient;

    beforeEach(() => {
      if (!isVaultAvailable()) return;

      restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });
    });

    test("should respect path restrictions in dry run mode", async () => {
      // 허용된 경로 - dry run 성공
      const allowedResult = (await restrictedClient.writeSecret(
        "secret/data/allowed/dry-run-test",
        { test: "data" },
        true
      )) as any;

      expect(allowedResult.wouldSucceed).toBe(true);
      expect(allowedResult.validationErrors).toBeUndefined();

      // 금지된 경로 - dry run 실패 (예외가 발생함)
      await expect(
        restrictedClient.writeSecret(
          "secret/data/forbidden/dry-run-test",
          { test: "data" },
          true
        )
      ).rejects.toThrow(VaultPathNotAllowedError);
    });

    test("should handle path restrictions in transaction dry run", async () => {
      const operations: TransactionOperation[] = [
        {
          type: "create",
          path: "secret/data/allowed/tx-test1",
          data: { id: 1 },
        },
        {
          type: "create",
          path: "secret/data/forbidden/tx-test2",
          data: { id: 2 },
        },
        {
          type: "create",
          path: "secret/data/allowed/tx-test3",
          data: { id: 3 },
        },
      ];

      const result = await restrictedClient.executeTransactionDryRun(
        operations
      );

      expect(result.wouldSucceed).toBe(false);
      expect(result.results).toHaveLength(3);

      // 첫 번째와 세 번째는 성공 (허용된 경로)
      expect(result.results[0].wouldSucceed).toBe(true);
      expect(result.results[2].wouldSucceed).toBe(true);

      // 두 번째는 실패 (금지된 경로)
      expect(result.results[1].wouldSucceed).toBe(false);
      expect(result.results[1].validationErrors).toContain(
        "Access to path 'secret/data/forbidden/tx-test2' is not allowed"
      );
    });
  });

  describe("Bulk Operations with Path Restrictions", () => {
    let restrictedClient: VaultClient;

    beforeEach(() => {
      if (!isVaultAvailable()) return;

      restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });
    });

    test("should handle path restrictions in bulk write", async () => {
      const operations = [
        { path: "secret/data/allowed/bulk1", data: { id: 1 } },
        { path: "secret/data/forbidden/bulk2", data: { id: 2 } },
        { path: "secret/data/allowed/bulk3", data: { id: 3 } },
      ];

      const result = await restrictedClient.bulkWriteSecrets(operations);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(3);

      // 허용된 경로들은 성공
      expect(result.results[0].success).toBe(true);
      expect(result.results[2].success).toBe(true);

      // 금지된 경로는 실패
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("not allowed");

      // 정리
      await vaultClient.deleteSecret("secret/data/allowed/bulk1");
      await vaultClient.deleteSecret("secret/data/allowed/bulk3");
    });

    test("should handle path restrictions in bulk write dry run", async () => {
      const operations = [
        { path: "secret/data/allowed/bulk-dry1", data: { id: 1 } },
        { path: "secret/data/forbidden/bulk-dry2", data: { id: 2 } },
        { path: "secret/data/allowed/bulk-dry3", data: { id: 3 } },
      ];

      const result = await restrictedClient.bulkWriteSecrets(operations, true);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(3);

      // 허용된 경로들은 성공 예측
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].dryRun).toBe(true);
      expect(result.results[2].success).toBe(true);
      expect(result.results[2].dryRun).toBe(true);

      // 금지된 경로는 실패 예측
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].dryRun).toBe(true);
      expect(result.results[1].error).toContain("not allowed");
    });

    test("should handle path restrictions in bulk delete", async () => {
      // 테스트 데이터 준비
      await vaultClient.writeSecret("secret/data/allowed/delete-bulk1", {
        test: "data",
      });
      await vaultClient.writeSecret("secret/data/forbidden/delete-bulk2", {
        test: "data",
      });

      const paths = [
        "secret/data/allowed/delete-bulk1",
        "secret/data/forbidden/delete-bulk2",
      ];

      const result = await restrictedClient.bulkDeleteSecrets(paths);

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(2);

      // 허용된 경로는 성공
      expect(result.results[0].success).toBe(true);

      // 금지된 경로는 실패
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("not allowed");

      // 정리
      await vaultClient.deleteSecret("secret/data/forbidden/delete-bulk2");
    });
  });

  describe("Complex Path Scenarios", () => {
    test("should handle nested path restrictions", async () => {
      const client = createTestVaultClient({
        allowedPaths: [
          "secret/data/app/prod/",
          "secret/data/app/staging/database/",
          "secret/data/shared/",
        ],
      });

      const testCases = [
        // 허용된 경로들
        { path: "secret/data/app/prod/config", allowed: true },
        { path: "secret/data/app/prod/api/keys", allowed: true },
        { path: "secret/data/app/staging/database/password", allowed: true },
        {
          path: "secret/data/app/staging/database/connection/string",
          allowed: true,
        },
        { path: "secret/data/shared/common", allowed: true },

        // 금지된 경로들
        { path: "secret/data/app/dev/config", allowed: false },
        { path: "secret/data/app/staging/config", allowed: false }, // database만 허용
        { path: "secret/data/app/staging", allowed: false }, // 너무 짧음
        { path: "secret/data/private/secret", allowed: false },
        { path: "secret/data/app", allowed: false }, // 너무 짧음
      ];

      for (const testCase of testCases) {
        if (testCase.allowed) {
          await expect(
            client.writeSecret(testCase.path, { test: "data" })
          ).resolves.not.toThrow();

          // 정리
          await client.deleteSecret(testCase.path);
        } else {
          await expect(
            client.writeSecret(testCase.path, { test: "data" })
          ).rejects.toThrow(VaultPathNotAllowedError);
        }
      }
    });

    test("should handle edge cases in path matching", async () => {
      const client = createTestVaultClient({
        allowedPaths: ["secret/data/test/"],
      });

      const edgeCases = [
        // 경계 케이스들
        { path: "secret/data/test", allowed: false }, // 슬래시 없음
        { path: "secret/data/test/valid", allowed: true }, // 하위 경로
        { path: "secret/data/test/sub", allowed: true }, // 하위 경로
        { path: "secret/data/testing", allowed: false }, // 유사하지만 다른 경로
        { path: "secret/data/test-env", allowed: false }, // 유사하지만 다른 경로
        { path: "secret/data/test_env", allowed: false }, // 유사하지만 다른 경로
      ];

      for (const testCase of edgeCases) {
        if (testCase.allowed) {
          await expect(
            client.writeSecret(testCase.path, { test: "data" })
          ).resolves.not.toThrow();

          // 정리
          await client.deleteSecret(testCase.path);
        } else {
          await expect(
            client.writeSecret(testCase.path, { test: "data" })
          ).rejects.toThrow(VaultPathNotAllowedError);
        }
      }
    });

    test("should handle multiple overlapping path restrictions", async () => {
      const client = createTestVaultClient({
        allowedPaths: [
          "secret/data/",
          "secret/data/app/",
          "secret/data/app/prod/",
        ],
      });

      // 모든 경로가 허용되어야 함 (가장 일반적인 패턴이 우선)
      const paths = [
        "secret/data/anything",
        "secret/data/app/anything",
        "secret/data/app/prod/anything",
        "secret/data/app/dev/anything", // secret/data/로 커버됨
      ];

      for (const path of paths) {
        await expect(
          client.writeSecret(path, { test: "data" })
        ).resolves.not.toThrow();

        // 정리
        await client.deleteSecret(path);
      }
    });
  });

  describe("Performance with Path Restrictions", () => {
    test("should handle large number of path restrictions efficiently", async () => {
      // 100개의 허용된 경로 생성
      const allowedPaths = Array.from(
        { length: 100 },
        (_, i) => `secret/data/app${i}/`
      );

      const client = createTestVaultClient({
        allowedPaths,
      });

      const startTime = Date.now();

      // 여러 경로에 대한 검증 테스트
      const testPromises = [];
      for (let i = 0; i < 50; i++) {
        testPromises.push(
          client.writeSecret(`secret/data/app${i}/config`, { id: i }, true)
        );
      }

      const results = await Promise.all(testPromises);
      const duration = Date.now() - startTime;

      // 모든 결과가 성공해야 함
      results.forEach((result: any) => {
        expect(result.wouldSucceed).toBe(true);
      });

      // 성능 검증 (1초 이내)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("YAML Operations with Path Restrictions", () => {
    test("should handle YAML export with path restrictions", async () => {
      const restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });

      // 허용된 경로와 금지된 경로에 테스트 데이터 생성
      await vaultClient.writeSecret("secret/data/allowed/export-test", {
        allowed: true,
      });
      await vaultClient.writeSecret("secret/data/forbidden/export-test", {
        forbidden: true,
      });

      // 허용된 경로에서 내보내기 - 성공해야 함
      await expect(
        restrictedClient.exportSecretsToYaml(
          "secret/metadata/allowed/",
          "./test-export-allowed.yaml",
          false
        )
      ).resolves.not.toThrow();

      // 금지된 경로에서 내보내기 - 실패해야 함
      await expect(
        restrictedClient.exportSecretsToYaml(
          "secret/metadata/forbidden/",
          "./test-export-forbidden.yaml",
          false
        )
      ).rejects.toThrow(
        "Access to path 'secret/metadata/forbidden/' is not allowed"
      );

      // 정리
      await vaultClient.deleteSecret("secret/data/allowed/export-test");
      await vaultClient.deleteSecret("secret/data/forbidden/export-test");

      // 생성된 파일 정리
      const fs = require("fs");
      try {
        fs.unlinkSync("./test-export-allowed.yaml");
      } catch (e) {
        // 파일이 없어도 무시
      }
    });

    test("should handle YAML import with path restrictions", async () => {
      const restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });

      // 테스트 YAML 파일 생성
      const testYamlContent = `
allowed-secret:
  key1: value1
  key2: value2
forbidden-secret:
  key3: value3
`;

      const fs = require("fs");
      fs.writeFileSync("./test-import.yaml", testYamlContent);

      try {
        // 허용된 경로로 가져오기 - 성공해야 함
        const allowedResult = await restrictedClient.importSecretsFromYaml(
          "./test-import.yaml",
          "secret/data/allowed/",
          false
        );
        expect(allowedResult.imported).toBeGreaterThan(0);

        // 금지된 경로로 가져오기 - 실패해야 함
        await expect(
          restrictedClient.importSecretsFromYaml(
            "./test-import.yaml",
            "secret/data/forbidden/",
            false
          )
        ).rejects.toThrow(
          "Access to path 'secret/data/forbidden/' is not allowed"
        );
      } finally {
        // 정리
        fs.unlinkSync("./test-import.yaml");
        try {
          await vaultClient.deleteSecret("secret/data/allowed/allowed-secret");
          await vaultClient.deleteSecret(
            "secret/data/allowed/forbidden-secret"
          );
        } catch (e) {
          // 정리 실패는 무시
        }
      }
    });

    test("should handle mixed path restrictions in recursive YAML export", async () => {
      const restrictedClient = createTestVaultClient({
        allowedPaths: ["secret/data/allowed/"],
      });

      // 허용된 경로와 금지된 경로에 중첩된 데이터 생성
      await vaultClient.writeSecret("secret/data/allowed/app1/config", {
        allowed: true,
      });
      await vaultClient.writeSecret("secret/data/allowed/app2/config", {
        allowed: true,
      });
      await vaultClient.writeSecret("secret/data/forbidden/app3/config", {
        forbidden: true,
      });

      // 허용된 경로에서만 재귀적 내보내기 - 경로 제한 적용 확인
      const result = await restrictedClient.exportSecretsToYaml(
        "secret/metadata/allowed/",
        "./test-recursive-export.yaml",
        true
      );

      // 허용된 경로의 시크릿만 내보내져야 함 (이미 존재하는 export-test 포함)
      expect(result.secretsCount).toBeGreaterThanOrEqual(2); // app1/config, app2/config 최소

      // 정리
      await vaultClient.deleteSecret("secret/data/allowed/app1/config");
      await vaultClient.deleteSecret("secret/data/allowed/app2/config");
      await vaultClient.deleteSecret("secret/data/forbidden/app3/config");

      const fs = require("fs");
      try {
        fs.unlinkSync("./test-recursive-export.yaml");
      } catch (e) {
        // 파일이 없어도 무시
      }
    });
  });

  describe("VAULT_ALLOWED_WORKING_DIR Security", () => {
    test("should require VAULT_ALLOWED_WORKING_DIR for YAML export", async () => {
      const clientWithoutWorkingDir = createTestVaultClient({
        allowedWorkingDirectory: undefined,
      });

      await expect(
        clientWithoutWorkingDir.exportSecretsToYaml(
          "secret/metadata/allowed/",
          "./test-export.yaml",
          false
        )
      ).rejects.toThrow(
        "VAULT_ALLOWED_WORKING_DIR environment variable is required for export operations"
      );
    });

    test("should require VAULT_ALLOWED_WORKING_DIR for YAML import", async () => {
      const clientWithoutWorkingDir = createTestVaultClient({
        allowedWorkingDirectory: undefined,
      });

      await expect(
        clientWithoutWorkingDir.importSecretsFromYaml(
          "./test-import.yaml",
          "secret/data/allowed/",
          false
        )
      ).rejects.toThrow(
        "VAULT_ALLOWED_WORKING_DIR environment variable is required for import operations"
      );
    });

    test("should work with properly configured VAULT_ALLOWED_WORKING_DIR", async () => {
      const clientWithWorkingDir = createTestVaultClient({
        allowedWorkingDirectory: process.cwd(),
      });

      // 테스트 데이터 생성
      await vaultClient.writeSecret("secret/data/allowed/working-dir-test", {
        test: "data",
      });

      // Export 테스트
      await expect(
        clientWithWorkingDir.exportSecretsToYaml(
          "secret/metadata/allowed/",
          "./test-working-dir-export.yaml",
          false
        )
      ).resolves.not.toThrow();

      // 정리
      await vaultClient.deleteSecret("secret/data/allowed/working-dir-test");

      const fs = require("fs");
      try {
        fs.unlinkSync("./test-working-dir-export.yaml");
      } catch (e) {
        // 파일이 없어도 무시
      }
    });
  });
});

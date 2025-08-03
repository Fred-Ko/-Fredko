/**
 * Jest 테스트 설정 파일
 * 모든 테스트 실행 전에 로드됩니다.
 */

import { jest } from "@jest/globals";

// 테스트 타임아웃 설정
jest.setTimeout(30000);

// 환경 변수 설정
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "ERROR"; // 테스트 시 로그 최소화
process.env.VAULT_ADDR = "http://localhost:8200";
process.env.VAULT_TOKEN = "myroot";
process.env.VAULT_ALLOW_READ = "true";
process.env.VAULT_ALLOW_WRITE = "true";

// 전역 테스트 설정
global.console = {
  ...console,
  // 테스트 시 console.log 출력 최소화
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error,
};

// 테스트 전역 변수
declare global {
  var testVaultConfig: {
    endpoint: string;
    token: string;
    testPathPrefix: string;
  };
}

global.testVaultConfig = {
  endpoint: process.env.VAULT_ADDR || "http://localhost:8200",
  token: process.env.VAULT_TOKEN || "myroot",
  testPathPrefix: "secret/data/test-suite",
};

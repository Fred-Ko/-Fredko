# Vault MCP Server 테스트 스위트

이 디렉토리는 Vault MCP Server의 포괄적인 테스트 스위트를 포함합니다.

## 테스트 구조

```
tests/
├── unit/                    # 단위 테스트
│   ├── vault-client.test.ts # VaultClient 기본 기능 테스트
│   └── transaction.test.ts  # 트랜잭션 및 롤백 테스트
├── integration/             # 통합 테스트
│   ├── mcp-tools.test.ts   # MCP 도구들 통합 테스트
│   └── performance.test.ts  # 성능 및 스트레스 테스트
├── helpers/                 # 테스트 헬퍼 유틸리티
│   └── vault-test-helper.ts
└── setup.ts                # Jest 전역 설정
```

## 테스트 실행 방법

### 사전 요구사항

1. **Vault 서버 실행**: 테스트를 실행하기 전에 Vault 개발 서버가 실행 중이어야 합니다.

   ```bash
   docker-compose up -d vault
   ```

2. **환경 변수 설정**: 테스트용 환경 변수를 설정합니다.

   ```bash
   source vault.env
   ```

### 테스트 명령어

```bash
# 모든 테스트 실행
npm test

# 단위 테스트만 실행
npm run test:unit

# 통합 테스트만 실행
npm run test:integration

# 테스트 감시 모드 (개발 중)
npm run test:watch

# 커버리지 리포트와 함께 테스트 실행
npm run test:coverage
```

## 테스트 카테고리

### 1. 단위 테스트 (Unit Tests)

#### VaultClient 테스트 (`vault-client.test.ts`)

- ✅ 기본 CRUD 작업 (Create, Read, Update, Delete)
- ✅ 벌크 작업 (Bulk Write, Read, Delete)
- ✅ 리스트 작업
- ✅ 에러 처리
- ✅ 네트워크 오류 처리
- ✅ 인증 실패 처리

#### 트랜잭션 테스트 (`transaction.test.ts`)

- ✅ 성공적인 트랜잭션 커밋
- ✅ CREATE 작업 롤백
- ✅ UPDATE 작업 롤백  
- ✅ DELETE 작업 롤백
- ✅ 복합 트랜잭션 롤백
- ✅ 대용량 트랜잭션 처리
- ✅ 트랜잭션 격리성

### 2. 통합 테스트 (Integration Tests)

#### MCP 도구 테스트 (`mcp-tools.test.ts`)

- ✅ 모든 MCP 도구 등록 확인
- ✅ 기본 도구 실행 (write, read, delete, health)
- ✅ 벌크 도구 실행
- ✅ 트랜잭션 도구 실행
- ✅ 탐색 도구 실행
- ✅ 도구 스키마 검증
- ✅ 에러 처리 및 서버 안정성

#### 성능 테스트 (`performance.test.ts`)

- ✅ 대용량 데이터 처리
- ✅ 다수 시크릿 처리
- ✅ 동시 작업 처리
- ✅ 대용량 트랜잭션 성능
- ✅ 롤백 성능
- ✅ 메모리 누수 방지
- ✅ 연속 작업 처리
- ✅ 오류 복구 및 복원력

## 테스트 헬퍼

### TestPathTracker

자동으로 테스트 중 생성된 시크릿들을 추적하고 테스트 후 정리합니다.

```typescript
const pathTracker = new TestPathTracker();
pathTracker.addPath('secret/data/test/path');
await pathTracker.cleanup(vaultClient); // 자동 정리
```

### 유틸리티 함수

- `generateTestPath()`: 고유한 테스트 경로 생성
- `generateTestSecretData()`: 테스트용 시크릿 데이터 생성
- `expectToThrowAsync()`: 비동기 에러 테스트
- `isVaultAvailable()`: Vault 서버 연결 상태 확인

## 테스트 설정

### Jest 설정

- **환경**: Node.js
- **프리셋**: ts-jest with ESM
- **타임아웃**: 30초
- **최대 워커**: 1 (Vault 테스트 순차 실행)

### 환경 변수

테스트는 다음 환경 변수를 사용합니다:

- `VAULT_ADDR`: <http://localhost:8200>
- `VAULT_TOKEN`: test-root-token
- `LOG_LEVEL`: ERROR (테스트 시 로그 최소화)

## 커버리지 목표

- **라인 커버리지**: > 90%
- **함수 커버리지**: > 95%
- **브랜치 커버리지**: > 85%

## 테스트 작성 가이드라인

1. **격리성**: 각 테스트는 독립적이어야 하며 다른 테스트에 영향을 주지 않아야 합니다.
2. **정리**: `TestPathTracker`를 사용하여 테스트 후 생성된 리소스를 정리합니다.
3. **타임아웃**: 장시간 실행되는 테스트는 적절한 타임아웃을 설정합니다.
4. **에러 테스트**: 성공 케이스뿐만 아니라 실패 케이스도 반드시 테스트합니다.
5. **성능**: 성능 테스트는 합리적인 임계값을 설정합니다.

## 문제 해결

### Vault 서버 연결 실패

```
Error: Vault server is not available
```

**해결방법**: `docker-compose up -d vault`로 Vault 서버를 시작하세요.

### 권한 거부 오류

```
Error: permission denied
```

**해결방법**: `source vault.env`로 올바른 토큰을 설정하세요.

### 테스트 타임아웃

```
Error: Timeout of 30000ms exceeded
```

**해결방법**: Vault 서버 상태를 확인하고 네트워크 연결을 점검하세요.

## 지속적 통합 (CI)

이 테스트 스위트는 CI/CD 파이프라인에서 자동으로 실행되도록 설계되었습니다:

1. Vault 개발 서버 시작
2. 환경 변수 설정
3. 의존성 설치
4. 테스트 실행
5. 커버리지 리포트 생성

---

**참고**: 모든 테스트는 실제 Vault 서버와 상호작용하므로, 테스트 실행 전에 Vault 서버가 정상적으로 실행 중인지 확인하세요.

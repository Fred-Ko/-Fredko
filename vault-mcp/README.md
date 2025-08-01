# Vault MCP Server

⚠️ 이 프로젝트는 충분히 검증되지 않았으며, 로컬 환경에서만 사용하도록 권장됩니다.

HashiCorp Vault용 Model Context Protocol (MCP) 서버입니다. 이 서버는 AI 에이전트가 Vault와 안전하게 상호작용할 수 있도록 하며, 세밀한 권한 제어 기능을 제공합니다.

## 🚀 빠른 시작

**Cursor AI IDE 사용자라면**: [Cursor 설정 가이드](./cursor-mcp-config.md)를 참조하세요.

**Claude Desktop 사용자라면**: 아래 [사용법](#사용법) 섹션을 참조하세요.

## 기능

### 🔐 기본 Secret 관리

- **Secret 관리**: Vault에서 secret 읽기, 쓰기, 삭제, 목록 조회
- **권한 제어**: 읽기 전용, 쓰기 전용 등 세밀한 권한 설정
- **경로 제한**: 특정 경로에만 접근 허용
- **상태 모니터링**: Vault 서버 상태 확인
- **안전한 인증**: 루트 토큰을 통한 인증

### ⚡ 벌크 오퍼레이션

- **벌크 읽기**: 여러 경로의 secret을 한 번에 읽기
- **벌크 쓰기**: 여러 secret을 배치로 저장
- **벌크 삭제**: 여러 secret을 일괄 삭제
- **부분 실패 허용**: 일부 실패해도 성공한 작업은 유지

### 🔄 가상 트랜잭션 (Virtual Transactions)

- **원자성 보장**: 모든 작업이 성공하거나 모두 롤백
- **자동 롤백**: 실패 시 이미 실행된 작업들을 자동으로 되돌림
- **사용자 정의 롤백**: 각 작업에 대한 롤백 로직을 직접 정의
- **트랜잭션 추적**: 실행 과정과 롤백 상태를 상세히 추적

## 설치

### NPX를 통한 즉시 실행 (권장)

```bash
npx -y @fredko/vault-mcp-server
```

### NPM을 통한 글로벌 설치

```bash
npm install -g @fredko/vault-mcp-server
```

### 소스에서 빌드

```bash
git clone <repository-url>
cd vault-mcp
npm install
npm run build
```

## 설정

환경 변수를 통해 서버를 설정할 수 있습니다:

### 필수 환경 변수

- `VAULT_TOKEN`: Vault 루트 토큰 (필수)

### 선택적 환경 변수

- `VAULT_ADDR`: Vault 서버 주소 (기본값: `http://127.0.0.1:8200`)
- `VAULT_ALLOW_READ`: 읽기 권한 허용 여부 (기본값: `true`)
- `VAULT_ALLOW_WRITE`: 쓰기 권한 허용 여부 (기본값: `false`)
- `VAULT_ALLOWED_PATHS`: 접근 허용 경로 (쉼표로 구분, 예: `secret/,kv/`)

### 설정 예시

```bash
# 읽기 전용 모드
export VAULT_TOKEN="hvs.your-root-token"
export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_ALLOW_READ="true"
export VAULT_ALLOW_WRITE="false"

# 특정 경로만 허용
export VAULT_ALLOWED_PATHS="secret/myapp/,kv/production/"
```

## 사용법

### Cursor AI IDE에서 사용

Cursor의 MCP 설정 파일에 다음 설정을 추가하세요:

**설정 파일 위치:**

- macOS: `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/config.json`
- Windows: `%APPDATA%\Cursor\User\globalStorage\cursor.mcp\config.json`
- Linux: `~/.config/Cursor/User/globalStorage/cursor.mcp/config.json`

**기본 설정 (읽기 전용):**

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "false"
      }
    }
  }
}
```

**고급 설정 (경로 제한 포함):**

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "true",
        "VAULT_ALLOWED_PATHS": "secret/dev/,kv/test/"
      }
    }
  }
}
```

> 📝 **상세한 Cursor 설정 가이드**: [cursor-mcp-config.md](./cursor-mcp-config.md) 파일을 참조하세요.

### Claude Desktop에서 사용

`claude_desktop_config.json` 파일에 다음 설정을 추가하세요:

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "false"
      }
    }
  }
}
```

### 직접 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

## 도구 (Tools)

### 🔐 Secret 관리 도구

#### read-secret

Vault에서 secret을 읽습니다.

**매개변수:**

- `path` (string): Secret 경로 (예: `secret/data/myapp`)

#### write-secret

Vault에 secret을 저장합니다.

**매개변수:**

- `path` (string): Secret을 저장할 경로
- `data` (object): 저장할 secret 데이터 (키-값 쌍)

#### delete-secret

Vault에서 secret을 삭제합니다.

**매개변수:**

- `path` (string): 삭제할 secret 경로

#### list-secrets

지정된 경로의 secret 목록을 조회합니다.

**매개변수:**

- `path` (string): 목록을 조회할 경로 (예: `secret/metadata/`)

#### vault-health

Vault 서버의 상태를 확인합니다.

**매개변수:** 없음

### ⚡ 벌크 오퍼레이션 도구

#### bulk-read-secrets

여러 경로의 secret을 한 번에 읽습니다. Best-effort 방식으로 동작하여 일부 경로가 실패해도 나머지는 계속 읽습니다.

**매개변수:**

- `paths` (array): 읽을 secret 경로들의 배열 (필수)

**예제:**

```json
{
  "paths": [
    "secret/data/app1/database",
    "secret/data/app1/api",
    "secret/data/app2/config"
  ]
}
```

**반환값:** 각 경로별 성공/실패 결과와 데이터

#### bulk-write-secrets

여러 secret을 배치로 저장합니다. Best-effort 방식으로 동작하여 일부 작업이 실패해도 나머지 작업은 계속 실행됩니다.

**매개변수:**

- `operations` (array): 쓰기 작업 배열 (필수)
  - `path` (string): Secret을 저장할 경로 (예: `"secret/data/app1/config"`)
  - `data` (object): 저장할 secret 데이터 (예: `{"username": "admin", "password": "secret123"}`)
  - `type` (string, optional): 작업 타입 (`'create'` 또는 `'update'`, 기본값: create/update)

**예제:**

```json
{
  "operations": [
    {
      "path": "secret/data/app1/database",
      "data": {
        "host": "localhost",
        "port": 5432,
        "username": "dbuser",
        "password": "dbpass123"
      }
    },
    {
      "path": "secret/data/app1/api",
      "data": {
        "api_key": "sk-1234567890abcdef",
        "api_secret": "secret-key-here"
      },
      "type": "create"
    }
  ]
}
```

**반환값:** 각 작업별 성공/실패 결과와 전체 요약

#### bulk-delete-secrets

여러 secret을 일괄 삭제합니다. Best-effort 방식으로 동작하여 일부 삭제가 실패해도 나머지는 계속 삭제됩니다.

**매개변수:**

- `paths` (array): 삭제할 secret 경로들의 배열 (필수)

**예제:**

```json
{
  "paths": [
    "secret/data/temp/test1",
    "secret/data/temp/test2",
    "secret/data/old/backup"
  ]
}
```

**반환값:** 각 경로별 삭제 성공/실패 결과

### 🔄 가상 트랜잭션

#### execute-transaction

롤백 오퍼레이션과 함께 가상 트랜잭션을 실행합니다. 모든 작업이 성공하거나 전체가 롤백되는 원자성을 보장합니다.

**매개변수:**

- `operations` (array): 트랜잭션 작업 배열 (필수)
  - `forward` (object): 실행할 메인 작업
    - `type` (string): 작업 타입 (`'create'`, `'update'`, `'delete'`, `'read'`)
    - `path` (string): Secret 경로 (예: `"secret/data/app1/config"`)
    - `data` (object, optional): 데이터 (create/update 시 필수)
  - `rollback` (object): 롤백 작업 (forward 실패 시 실행)
    - `type` (string): 롤백 작업 타입
    - `path` (string): 롤백 경로 (보통 forward와 동일)
    - `data` (object, optional): 롤백 생성 데이터 (삭제된 secret 복원 시)
    - `originalData` (object, optional): 원본 데이터 (수정/삭제 전 백업)

##### 예제 1: Secret 생성 트랜잭션

```json
{
  "operations": [
    {
      "forward": {
        "type": "create",
        "path": "secret/data/app1/config",
        "data": {
          "database_url": "postgres://localhost:5432/mydb",
          "api_key": "sk-1234567890"
        }
      },
      "rollback": {
        "type": "delete",
        "path": "secret/data/app1/config"
      }
    }
  ]
}
```

##### 예제 2: Secret 수정 트랜잭션

```json
{
  "operations": [
    {
      "forward": {
        "type": "update",
        "path": "secret/data/app1/config",
        "data": {
          "database_url": "postgres://newhost:5432/mydb",
          "api_key": "sk-new-key-here"
        }
      },
      "rollback": {
        "type": "update",
        "path": "secret/data/app1/config",
        "originalData": {
          "database_url": "postgres://localhost:5432/mydb",
          "api_key": "sk-1234567890"
        }
      }
    }
  ]
}
```

**반환값:** 트랜잭션 결과, 롤백 상태, 상세 실행 로그

**특징:**

- 모든 작업이 성공하거나 모두 롤백 (원자성)
- 실패 시 자동으로 완료된 작업들을 역순으로 롤백
- 롤백 실패도 추적하여 상세한 상태 정보 제공

**주의사항:**

- `forward.data`는 create/update 시 필수입니다
- `rollback.originalData`는 update/delete 롤백 시 필수입니다
- rollback 작업은 forward 작업의 반대 동작을 수행해야 합니다

## 리소스 (Resources)

### vault://health

Vault 서버의 현재 상태 정보를 제공합니다.

### vault://config

현재 서버 설정 및 권한 정보를 제공합니다.

## 보안 고려사항

1. **토큰 관리**: 루트 토큰은 매우 강력한 권한을 가지므로 안전하게 보관하세요
2. **권한 제한**: 필요한 최소한의 권한만 부여하세요
3. **경로 제한**: `VAULT_ALLOWED_PATHS`를 사용하여 접근 가능한 경로를 제한하세요
4. **네트워크 보안**: Vault 서버와의 통신은 HTTPS를 사용하는 것을 권장합니다

## 일반적인 에러와 해결방법

### 벌크 및 트랜잭션 파라미터 에러

#### "no result from tool" 에러

이 에러는 주로 잘못된 파라미터 형식으로 인해 발생합니다:

**원인:**

- 필수 파라미터 누락 (`path`, `data` 등)
- 잘못된 JSON 형식
- 타입 불일치 (문자열 대신 객체, 배열 대신 단일 값 등)

**해결방법:**

```json
// ❌ 잘못된 예시
{
  "path": "secret/data/test",  // operations 배열이 아님
  "data": {"key": "value"}
}

// ✅ 올바른 예시 (bulk-write-secrets)
{
  "operations": [
    {
      "path": "secret/data/test",
      "data": {"key": "value"}
    }
  ]
}
```

#### 트랜잭션 파라미터 에러

**원인:**

- `forward`와 `rollback` 객체 구조 오류
- 필수 필드 누락
- rollback 로직 불일치

**해결방법:**

```json
// ❌ 잘못된 예시
{
  "operations": [
    {
      "type": "create",  // forward 객체로 감싸지 않음
      "path": "secret/data/test"
    }
  ]
}

// ✅ 올바른 예시 (execute-transaction)
{
  "operations": [
    {
      "forward": {
        "type": "create",
        "path": "secret/data/test",
        "data": {"key": "value"}
      },
      "rollback": {
        "type": "delete",
        "path": "secret/data/test"
      }
    }
  ]
}
```

### Vault 연결 에러

#### "Failed to connect to Vault" 에러

**원인:**

- 잘못된 VAULT_TOKEN
- Vault 서버 접근 불가
- 네트워크 문제

**해결방법:**

1. 토큰 확인: `echo $VAULT_TOKEN`
2. Vault 서버 상태 확인: `vault status`
3. 네트워크 연결 확인

#### "Access denied" 에러

**원인:**

- 권한 부족
- 경로 제한 설정

**해결방법:**

1. 권한 확인: `vault auth -method=token`
2. 정책 확인: `vault token lookup`
3. `VAULT_ALLOWED_PATHS` 환경변수 확인

### 경로 관련 에러

#### "Invalid path" 에러

**원인:**

- KV v2 엔진 경로 형식 오류
- 존재하지 않는 경로

**해결방법:**

```bash
# KV v2 엔진의 경우
# ❌ 잘못된 경로: secret/myapp
# ✅ 올바른 경로: secret/data/myapp

# 경로 확인
vault kv list secret/
```

## 예시

### 기본 Secret 관리

#### Secret 읽기

```text
AI: secret/data/myapp 경로의 secret을 읽어주세요.
```

#### Secret 쓰기

```text
AI: secret/data/myapp 경로에 username은 "admin", password는 "secret123"으로 저장해주세요.
```

#### Secret 목록 조회

```text
AI: secret/metadata/ 경로의 모든 secret 목록을 보여주세요.
```

### 벌크 오퍼레이션

#### 벌크 읽기

```text
AI: 다음 경로들의 secret을 한 번에 모두 읽어주세요:
- secret/data/app1
- secret/data/app2
- secret/data/database
```

#### 벌크 쓰기

```text
AI: 다음 secret들을 한 번에 저장해주세요:
- secret/data/app1에 {"api_key": "key1", "env": "prod"}
- secret/data/app2에 {"api_key": "key2", "env": "dev"}
- secret/data/database에 {"host": "db.example.com", "port": "5432"}
```

#### 벌크 삭제

```text
AI: 다음 경로들의 secret을 모두 삭제해주세요:
- secret/data/temp1
- secret/data/temp2
- secret/data/old-config
```

### 가상 트랜잭션

#### 기본 트랜잭션

```text
AI: 다음 작업들을 트랜잭션으로 실행해주세요. 하나라도 실패하면 모두 롤백해주세요:

1. secret/data/user1에 {"name": "john", "role": "admin"} 생성
   - 롤백: secret/data/user1 삭제

2. secret/data/config를 {"version": "2.0", "updated": "2024-01-01"}로 업데이트
   - 롤백: 원본 데이터로 복원 (기존 값: {"version": "1.0", "updated": "2023-12-01"})

3. secret/data/old-data 삭제
   - 롤백: 원본 데이터로 복원 (기존 값: {"legacy": "data"})
```

#### 복잡한 트랜잭션

```text
AI: 사용자 마이그레이션 트랜잭션을 실행해주세요:

1. 새로운 사용자 데이터 생성: secret/data/users/new에 {"migrated": true, "version": "v2"}
   - 롤백: secret/data/users/new 삭제

2. 기존 설정 업데이트: secret/data/config를 {"migration_status": "completed"}로 변경
   - 롤백: {"migration_status": "pending"}로 복원

3. 임시 데이터 정리: secret/data/temp/migration 삭제
   - 롤백: {"temp_data": "backup", "created": "2024-01-01"}로 복원
```

## 문제 해결

### "VAULT_TOKEN environment variable is required" 오류

- `VAULT_TOKEN` 환경 변수가 설정되지 않았습니다
- Vault 루트 토큰을 설정해주세요

### "Access to path 'xxx' is not allowed" 오류

- 해당 경로에 대한 접근이 허용되지 않습니다
- `VAULT_ALLOWED_PATHS` 환경 변수를 확인하거나 수정해주세요

### "Read/Write operations are not permitted" 오류

- 읽기/쓰기 권한이 비활성화되어 있습니다
- `VAULT_ALLOW_READ` 또는 `VAULT_ALLOW_WRITE` 환경 변수를 확인해주세요

## 개발

### 요구사항

- Node.js 18+
- TypeScript
- HashiCorp Vault 서버

### 개발 환경 설정

```bash
git clone <repository-url>
cd vault-mcp
npm install
npm run dev
```

### 빌드

```bash
npm run build
```

### 테스트

```bash
# Vault 서버 시작 (개발용)
vault server -dev

# 다른 터미널에서
export VAULT_TOKEN="hvs.your-dev-root-token"
npm run dev
```

## 라이선스

MIT

## 기여

이슈나 풀 리퀘스트는 언제든 환영합니다!

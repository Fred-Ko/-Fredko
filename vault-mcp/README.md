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

### 🌳 탐색 및 파일 관리

- **재귀적 탐색**: Vault 경로를 트리 구조로 탐색
- **YAML 내보내기**: Secret들을 YAML 파일로 백업
- **YAML 가져오기**: YAML 파일에서 Secret들을 일괄 복원
- **보안 제한**: 작업 디렉토리 제한으로 파일 시스템 보안 강화

### 🧪 Dry Run 시뮬레이션

- **안전한 미리보기**: 실제 변경 없이 작업 결과를 시뮬레이션
- **충돌 감지**: 트랜잭션 내 작업 간 충돌 사전 발견
- **의존성 분석**: 작업 순서와 의존 관계 검증
- **검증 오류 표시**: 실행 전 발생할 수 있는 문제점 미리 확인
- **상세한 피드백**: 각 작업이 성공/실패할 이유를 구체적으로 설명

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
- `VAULT_ALLOWED_WORKING_DIR`: 파일 작업 허용 디렉토리 (기본값: 현재 작업 디렉토리)

### 설정 예시

```bash
# 읽기 전용 모드
export VAULT_TOKEN="hvs.your-root-token"
export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_ALLOW_READ="true"
export VAULT_ALLOW_WRITE="false"

# 특정 경로만 허용
export VAULT_ALLOWED_PATHS="secret/myapp/,kv/production/"

# 파일 작업 디렉토리 제한 (보안)
export VAULT_ALLOWED_WORKING_DIR="/home/user/vault-backups"
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

### 🌳 탐색 및 파일 관리 도구

#### explore-secrets

Vault 경로를 재귀적으로 탐색하여 트리 구조로 표시합니다.

**매개변수:**

- `basePath` (string): 탐색을 시작할 기본 경로 (예: `secret/metadata/`)
- `maxDepth` (number, optional): 최대 탐색 깊이 (기본값: 10, 최대: 20)

#### export-secrets-yaml

Vault의 secret들을 YAML 파일로 내보냅니다.

**매개변수:**

- `basePath` (string): 내보낼 Vault 경로 (예: `secret/data/app1/`)
- `outputPath` (string): 저장할 로컬 파일 경로 (예: `./secrets-export.yaml`)
- `recursive` (boolean, optional): 하위 경로 재귀 탐색 여부 (기본값: `true`)

#### import-secrets-yaml

YAML 파일에서 secret들을 Vault로 가져옵니다.

**매개변수:**

- `yamlFilePath` (string): 가져올 YAML 파일 경로 (예: `./secrets-import.yaml`)
- `basePath` (string): Vault에 저장할 기본 경로 (예: `secret/data/app1/`)
- `overwrite` (boolean, optional): 기존 secret 덮어쓰기 여부 (기본값: `false`)

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

**자동 롤백 계산**을 통해 가상 트랜잭션을 실행합니다. 사용자는 수행하고자 하는 작업만 지정하면, 시스템이 자동으로 롤백 방법을 계산합니다. 모든 작업이 성공하거나 전체가 롤백되는 원자성을 보장합니다.

**매개변수:**

- `operations` (array): 트랜잭션 작업 배열 (필수)
  - `type` (string): 작업 타입 (`'create'`, `'update'`, `'delete'`, `'read'`)
  - `path` (string): Secret 경로 (예: `"secret/data/app1/config"`)
  - `data` (object, optional): 데이터 (create/update 시 필수)

##### 예제 1: Secret 생성 트랜잭션 (자동 롤백)

```json
{
  "operations": [
    {
      "type": "create",
      "path": "secret/data/app1/config",
      "data": {
        "database_url": "postgres://localhost:5432/mydb",
        "api_key": "sk-1234567890"
      }
    }
  ]
}
```

시스템이 자동으로 롤백 계산: 생성 실패 시 해당 경로를 삭제

##### 예제 2: Secret 수정 트랜잭션 (자동 롤백)

```json
{
  "operations": [
    {
      "type": "update",
      "path": "secret/data/app1/config",
      "data": {
        "database_url": "postgres://newhost:5432/mydb",
        "api_key": "sk-new-key-here"
      }
    }
  ]
}
```

시스템이 자동으로 롤백 계산: 수정 실패 시 원본 데이터로 복원

##### 예제 3: 복합 트랜잭션 (자동 롤백)

```json
{
  "operations": [
    {
      "type": "create",
      "path": "secret/data/user1",
      "data": {"name": "john", "role": "admin"}
    },
    {
      "type": "update",
      "path": "secret/data/config",
      "data": {"version": "2.0", "updated": "2024-01-01"}
    },
    {
      "type": "delete",
      "path": "secret/data/old-data"
    }
  ]
}
```

시스템이 각 작업에 대해 자동으로 적절한 롤백 방법을 계산

**반환값:** 트랜잭션 결과, 롤백 상태, 상세 실행 로그

**특징:**

- **자동 롤백 계산**: 사용자가 롤백 로직을 정의할 필요 없음
- **원자성 보장**: 모든 작업이 성공하거나 모두 롤백
- **지능형 롤백**: 각 작업 타입에 맞는 적절한 롤백 방법을 자동 선택
- **실패 시 자동 복구**: 완료된 작업들을 역순으로 자동 롤백
- **상세한 추적**: 실행 과정과 롤백 상태를 상세히 기록

**주의사항:**

- `data`는 create/update 작업 시 필수입니다
- 시스템이 롤백을 위해 기존 데이터를 자동으로 백업합니다
- delete 작업의 경우 원본 데이터가 자동으로 보존되어 복원에 사용됩니다

### 🧪 Dry Run 시뮬레이션 도구

모든 쓰기 작업 도구에는 `dryRun` 매개변수가 추가되어 실제 변경 없이 시뮬레이션할 수 있습니다.

#### write-secret (with dryRun)

```json
{
  "path": "secret/data/myapp",
  "data": {"username": "admin", "password": "newpass"},
  "dryRun": true
}
```

#### delete-secret (with dryRun)

```json
{
  "path": "secret/data/myapp",
  "dryRun": true
}
```

#### execute-transaction (with dryRun)

```json
{
  "operations": [
    {
      "type": "create",
      "path": "secret/data/test1",
      "data": {"key": "value"}
    },
    {
      "type": "update", 
      "path": "secret/data/test1",
      "data": {"key": "updated"}
    }
  ],
  "dryRun": true
}
```

#### 전용 시뮬레이션 도구들

**simulate-write-secret**: 쓰기 작업만 시뮬레이션
**simulate-delete-secret**: 삭제 작업만 시뮬레이션  
**simulate-transaction**: 트랜잭션만 시뮬레이션
**validate-operations**: 여러 작업의 유효성 검증 및 충돌 분석

**Dry Run 결과 정보:**

- 작업 성공/실패 예측
- 현재 경로 상태 (존재/비존재)
- 기존 데이터 내용 (있는 경우)
- 검증 오류 목록
- 트랜잭션 의존성 분석
- 작업 간 충돌 감지

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

- 필수 필드 누락 (`type`, `path`)
- 잘못된 작업 타입
- create/update 시 `data` 필드 누락

**해결방법:**

```json
// ❌ 잘못된 예시
{
  "operations": [
    {
      "path": "secret/data/test"  // type 필드 누락
    }
  ]
}

// ✅ 올바른 예시 (execute-transaction)
{
  "operations": [
    {
      "type": "create",
      "path": "secret/data/test",
      "data": {"key": "value"}
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

### 🌳 탐색 및 파일 관리

#### Vault 경로 탐색

```text
AI: secret/metadata/ 경로를 트리 구조로 탐색해주세요. 최대 깊이는 5로 제한해주세요.
```

#### YAML 파일로 내보내기

```text
AI: secret/data/production/ 경로의 모든 secret을 ./backup/prod-secrets.yaml 파일로 내보내주세요.
```

#### YAML 파일에서 가져오기

```text
AI: ./backup/prod-secrets.yaml 파일의 내용을 secret/data/staging/ 경로로 가져와주세요. 기존 secret은 덮어쓰지 말아주세요.
```

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

#### 기본 트랜잭션 (자동 롤백)

```text
AI: 다음 작업들을 트랜잭션으로 실행해주세요. 하나라도 실패하면 모두 자동으로 롤백해주세요:

1. secret/data/user1에 {"name": "john", "role": "admin"} 생성
2. secret/data/config를 {"version": "2.0", "updated": "2024-01-01"}로 업데이트
3. secret/data/old-data 삭제

시스템이 각 작업에 대해 자동으로 적절한 롤백 방법을 계산하고 실행합니다.
```

#### 복잡한 트랜잭션 (자동 롤백)

```text
AI: 사용자 마이그레이션 트랜잭션을 실행해주세요:

1. 새로운 사용자 데이터 생성: secret/data/users/new에 {"migrated": true, "version": "v2"}
2. 기존 설정 업데이트: secret/data/config를 {"migration_status": "completed"}로 변경
3. 임시 데이터 정리: secret/data/temp/migration 삭제

실패 시 시스템이 자동으로 모든 변경사항을 원상복구합니다.
```

### 🧪 Dry Run 시뮬레이션

#### 단일 작업 시뮬레이션

```text
AI: secret/data/myapp 경로에 {"username": "admin", "password": "newpass"}를 쓰려고 하는데, 실제 변경하지 말고 어떤 일이 일어날지 미리 보여주세요.
```

시스템이 다음과 같은 정보를 제공합니다:

- 현재 해당 경로에 데이터가 있는지 여부
- 작업이 성공할지 실패할지 예측
- 기존 데이터가 있다면 그 내용
- 발생할 수 있는 검증 오류

#### 트랜잭션 시뮬레이션

```text
AI: 다음 트랜잭션을 실제로 실행하지 말고 시뮬레이션해주세요:

1. secret/data/app1에 {"version": "2.0"} 생성
2. secret/data/app1을 {"version": "2.1", "updated": true}로 업데이트
3. secret/data/old-app 삭제

각 작업이 성공할지, 의존성 문제는 없는지 미리 확인하고 싶습니다.
```

시스템이 제공하는 정보:

- 각 작업의 성공/실패 예측
- 작업 간 의존성 분석 (1번 생성 후 2번 업데이트 가능)
- 전체 트랜잭션 성공 가능성
- 발견된 충돌이나 문제점

#### 복잡한 시나리오 검증

```text
AI: 운영 환경 배포 전에 다음 작업들을 검증해주세요:

1. secret/data/prod/database에 새 DB 설정 생성
2. secret/data/prod/api-keys 업데이트
3. secret/data/staging/old-config 삭제
4. secret/data/prod/database를 최신 버전으로 다시 업데이트

실제 실행하지 말고 문제가 없는지만 확인해주세요.
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

# Vault MCP Server

⚠️ 이 프로젝트는 충분히 검증되지 않았으며, 로컬 환경에서만 사용하도록 권장됩니다.

HashiCorp Vault용 Model Context Protocol (MCP) 서버입니다. 이 서버는 AI 에이전트가 Vault와 안전하게 상호작용할 수 있도록 하며, 세밀한 권한 제어 기능을 제공합니다.

## 🚀 빠른 시작

**Cursor AI IDE 사용자라면**: [Cursor 설정 가이드](./cursor-mcp-config.md)를 참조하세요.

**Claude Desktop 사용자라면**: 아래 [사용법](#사용법) 섹션을 참조하세요.

## 기능

- **Secret 관리**: Vault에서 secret 읽기, 쓰기, 삭제, 목록 조회
- **권한 제어**: 읽기 전용, 쓰기 전용 등 세밀한 권한 설정
- **경로 제한**: 특정 경로에만 접근 허용
- **상태 모니터링**: Vault 서버 상태 확인
- **안전한 인증**: 루트 토큰을 통한 인증

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

### read-secret

Vault에서 secret을 읽습니다.

**매개변수:**

- `path` (string): Secret 경로 (예: `secret/data/myapp`)

### write-secret

Vault에 secret을 저장합니다.

**매개변수:**

- `path` (string): Secret을 저장할 경로
- `data` (object): 저장할 secret 데이터 (키-값 쌍)

### delete-secret

Vault에서 secret을 삭제합니다.

**매개변수:**

- `path` (string): 삭제할 secret 경로

### list-secrets

지정된 경로의 secret 목록을 조회합니다.

**매개변수:**

- `path` (string): 목록을 조회할 경로 (예: `secret/metadata/`)

### vault-health

Vault 서버의 상태를 확인합니다.

**매개변수:** 없음

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

## 예시

### Secret 읽기

```text
AI: secret/data/myapp 경로의 secret을 읽어주세요.
```

### Secret 쓰기

```text
AI: secret/data/myapp 경로에 username은 "admin", password는 "secret123"으로 저장해주세요.
```

### Secret 목록 조회

```text
AI: secret/metadata/ 경로의 모든 secret 목록을 보여주세요.
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

# Cursor에서 Vault MCP 서버 등록하기

## 1. Cursor 설정 파일 위치 찾기

Cursor의 MCP 설정은 다음 위치에 있습니다:

**macOS:**

```
~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/config.json
```

**Windows:**

```
%APPDATA%\Cursor\User\globalStorage\cursor.mcp\config.json
```

**Linux:**

```
~/.config/Cursor/User/globalStorage/cursor.mcp/config.json
```

## 2. 설정 파일 생성/수정

설정 파일이 없다면 새로 생성하고, 있다면 기존 내용에 추가합니다.

### 기본 설정 (읽기 전용)

```json
{
  "mcpServers": {
    "vault": {
      "command": "node",
      "args": ["/Users/junhoko/temp/vault-mcp/dist/index.js"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token-here",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "false"
      }
    }
  }
}
```

### 읽기/쓰기 권한 모두 허용

```json
{
  "mcpServers": {
    "vault": {
      "command": "node",
      "args": ["/Users/junhoko/temp/vault-mcp/dist/index.js"],
      "env": {
        "VAULT_TOKEN": "myroot",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "true"
      }
    }
  }
}
```

### 특정 경로만 허용

```json
{
  "mcpServers": {
    "vault": {
      "command": "node",
      "args": ["/Users/junhoko/temp/vault-mcp/dist/index.js"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token-here",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "true",
        "VAULT_ALLOWED_PATHS": "secret/myapp/,kv/dev/"
      }
    }
  }
}
```

## 3. NPX를 사용한 설정 (권장)

npm에 퍼블리시된 패키지를 npx로 실행하는 방법입니다:

### 기본 설정 (읽기 전용)

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token-here",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "false"
      }
    }
  }
}
```

### 읽기/쓰기 권한 모두 허용

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "myroot",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "true"
      }
    }
  }
}
```

### 특정 경로만 허용

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.your-root-token-here",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "true",
        "VAULT_ALLOWED_PATHS": "secret/myapp/,kv/dev/"
      }
    }
  }
}
```

## 4. 설정 적용

1. 설정 파일을 저장합니다
2. Cursor를 재시작합니다
3. 새 채팅을 시작하면 MCP 서버가 자동으로 연결됩니다

## 5. 연결 확인

Cursor에서 다음과 같이 테스트해볼 수 있습니다:

```
Vault 서버 상태를 확인해주세요.
```

또는

```
secret/data/test 경로의 secret을 읽어주세요.
```

## 문제 해결

### MCP 서버가 연결되지 않는 경우

1. **경로 확인**: `args`에 지정된 경로가 정확한지 확인
2. **권한 확인**: 실행 파일에 실행 권한이 있는지 확인
3. **환경 변수**: `VAULT_TOKEN`이 올바르게 설정되었는지 확인
4. **Vault 서버**: Vault 서버가 실행 중인지 확인

### 로그 확인

Cursor의 개발자 도구에서 MCP 관련 로그를 확인할 수 있습니다:

- `Cmd+Shift+I` (macOS) 또는 `Ctrl+Shift+I` (Windows/Linux)
- Console 탭에서 MCP 관련 메시지 확인

## 보안 주의사항

- `VAULT_TOKEN`은 매우 민감한 정보이므로 안전하게 관리하세요
- 개발 환경에서만 사용하고, 프로덕션 토큰은 절대 설정 파일에 넣지 마세요
- 필요한 최소한의 권한만 부여하세요 (`VAULT_ALLOW_WRITE=false` 권장)

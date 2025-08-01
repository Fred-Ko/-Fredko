# Cursor MCP 빠른 설정

## 1️⃣ 설정 파일 경로

**macOS:**

```text
~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/config.json
```

**Windows:**

```text
%APPDATA%\Cursor\User\globalStorage\cursor.mcp\config.json
```

**Linux:**

```text
~/.config/Cursor/User/globalStorage/cursor.mcp/config.json
```

## 2️⃣ 기본 설정 (복사해서 붙여넣기)

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.YOUR_VAULT_ROOT_TOKEN",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "false"
      }
    }
  }
}
```

## 3️⃣ 설정 단계

1. `YOUR_VAULT_ROOT_TOKEN`을 실제 토큰으로 교체
2. 파일 저장
3. Cursor 재시작
4. 새 채팅에서 테스트: "Vault 서버 상태를 확인해주세요"

## 🔧 고급 설정 (선택사항)

```json
{
  "mcpServers": {
    "vault": {
      "command": "npx",
      "args": ["-y", "@fredko/vault-mcp-server"],
      "env": {
        "VAULT_TOKEN": "hvs.YOUR_VAULT_ROOT_TOKEN",
        "VAULT_ADDR": "http://127.0.0.1:8200",
        "VAULT_ALLOW_READ": "true",
        "VAULT_ALLOW_WRITE": "true",
        "VAULT_ALLOWED_PATHS": "secret/dev/,kv/test/"
      }
    }
  }
}
```

> 📖 상세한 설정 가이드: [cursor-mcp-config.md](./cursor-mcp-config.md)

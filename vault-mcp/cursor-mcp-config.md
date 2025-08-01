# Cursor에서 Vault MCP 서버 설정하기

Cursor AI IDE에서 HashiCorp Vault MCP 서버를 설정하는 완전한 가이드입니다.

## 📋 사전 준비사항

1. **HashiCorp Vault 서버** 실행 중이어야 함
2. **Vault 루트 토큰** 보유
3. **Node.js 18+** 설치됨 (npx 사용을 위해)

## 🚀 빠른 설정 (권장)

### 1단계: Cursor MCP 설정 파일 위치 찾기

운영체제별 Cursor MCP 설정 파일 위치:

**macOS:**

```bash
~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp/config.json
```

**Windows:**

```bash
%APPDATA%\Cursor\User\globalStorage\cursor.mcp\config.json
```

**Linux:**

```bash
~/.config/Cursor/User/globalStorage/cursor.mcp/config.json
```

### 2단계: 설정 파일 생성/수정

위 경로에 `config.json` 파일을 생성하거나 수정하여 다음 내용을 추가:

#### 기본 설정 (읽기 전용)

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

#### 고급 설정 (읽기/쓰기 + 경로 제한)

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

### 3단계: 토큰 설정

`YOUR_VAULT_ROOT_TOKEN`을 실제 Vault 루트 토큰으로 교체하세요:

```bash
# Vault 개발 서버에서 토큰 확인
vault print token

# 또는 Vault 로그에서 Root Token 찾기
```

### 4단계: 설정 적용

1. **설정 파일 저장**
2. **Cursor 완전 재시작** (중요!)
3. **새 채팅 시작**

## ✅ 연결 확인 및 테스트

Cursor에서 새 채팅을 시작하고 다음 명령들로 테스트:

### 기본 연결 테스트

```text
Vault 서버 상태를 확인해주세요.
```

### Secret 읽기 테스트

```text
secret/data/test 경로의 secret을 읽어주세요.
```

### Secret 목록 조회

```text
secret/metadata/ 경로의 모든 secret 목록을 보여주세요.
```

### Secret 쓰기 테스트 (쓰기 권한이 있는 경우)

```text
secret/data/test 경로에 username은 "testuser", password는 "testpass"로 저장해주세요.
```

## 🔧 환경 변수 설정 옵션

| 변수명 | 설명 | 기본값 | 예시 |
|--------|------|--------|------|
| `VAULT_TOKEN` | Vault 루트 토큰 (필수) | - | `hvs.ABCD1234...` |
| `VAULT_ADDR` | Vault 서버 주소 | `http://127.0.0.1:8200` | `https://vault.company.com` |
| `VAULT_ALLOW_READ` | 읽기 권한 허용 | `true` | `true`/`false` |
| `VAULT_ALLOW_WRITE` | 쓰기 권한 허용 | `false` | `true`/`false` |
| `VAULT_ALLOWED_PATHS` | 접근 허용 경로 | 모든 경로 | `secret/,kv/prod/` |

## 🛠️ 문제 해결

### MCP 서버가 연결되지 않는 경우

1. **설정 파일 경로 확인**

   ```bash
   # macOS에서 파일 존재 확인
   ls -la ~/Library/Application\ Support/Cursor/User/globalStorage/cursor.mcp/
   ```

2. **JSON 문법 검증**
   - 설정 파일이 유효한 JSON인지 확인
   - 온라인 JSON validator 사용 권장

3. **npx 설치 확인**

   ```bash
   npx --version
   node --version
   ```

4. **패키지 설치 테스트**

   ```bash
   npx -y @fredko/vault-mcp-server --help
   ```

### Vault 연결 오류

1. **Vault 서버 상태 확인**

   ```bash
   vault status
   ```

2. **토큰 유효성 확인**

   ```bash
   vault auth -method=token token=hvs.YOUR_TOKEN
   ```

3. **네트워크 연결 확인**

   ```bash
   curl http://127.0.0.1:8200/v1/sys/health
   ```

### 로그 확인 방법

**Cursor 개발자 도구:**

- `Cmd+Shift+I` (macOS) 또는 `Ctrl+Shift+I` (Windows/Linux)
- Console 탭에서 "mcp" 또는 "vault" 검색

**일반적인 오류 메시지:**

- `VAULT_TOKEN environment variable is required`
- `Access to path 'xxx' is not allowed`
- `Read/Write operations are not permitted`

## 🔒 보안 모범 사례

### 개발 환경

```json
{
  "env": {
    "VAULT_TOKEN": "hvs.dev-token-here",
    "VAULT_ALLOW_READ": "true",
    "VAULT_ALLOW_WRITE": "false",
    "VAULT_ALLOWED_PATHS": "secret/dev/,kv/test/"
  }
}
```

### 프로덕션 환경 (권장하지 않음)

- 프로덕션 토큰은 절대 설정 파일에 저장하지 마세요
- 임시 토큰이나 제한된 권한의 토큰 사용
- 정기적인 토큰 순환

## 📚 추가 리소스

- **GitHub 저장소**: <https://github.com/Fred-Ko/-Fredko/tree/master/vault-mcp>
- **npm 패키지**: <https://www.npmjs.com/package/@fredko/vault-mcp-server>
- **HashiCorp Vault 문서**: <https://developer.hashicorp.com/vault>

## 💡 팁

1. **처음 설정 시**: 읽기 전용으로 시작하여 동작 확인 후 권한 확장
2. **경로 제한**: 특정 프로젝트나 환경별로 경로 분리
3. **토큰 관리**: 개발용 토큰과 프로덕션 토큰 분리
4. **정기 점검**: Vault 서버 상태와 토큰 만료일 확인

# Cursor에서 Vault MCP 서버 등록하기

## 1. Cursor 설정 파일 위치 찾기

Cursor의 MCP 설정은 다음 위치에 있습니다:

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

## 4. 설정 적용

1. 설정 파일을 저장합니다
2. Cursor를 재시작합니다
3. 새 채팅을 시작하면 MCP 서버가 자동으로 연결됩니다

## 5. 연결 확인

Cursor에서 다음과 같이 테스트해볼 수 있습니다:

```text
Vault 서버 상태를 확인해주세요.
```

또는

```text
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

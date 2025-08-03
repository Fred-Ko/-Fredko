# Vault 개발 환경 설정 가이드

이 가이드는 Vault MCP 서버 개발을 위한 로컬 Vault 환경을 설정하는 방법을 설명합니다.

## 🚀 빠른 시작

### 1. Vault 서버 시작

```bash
# Vault 서버 시작 (백그라운드)
docker-compose up -d

# 로그 확인
docker-compose logs -f vault
```

### 2. 환경 변수 설정

```bash
# 환경 변수 로드
source vault.env
```

### 3. MCP 서버 테스트

```bash
# 프로젝트 빌드
npm run build

# MCP 서버 시작
npm start
```

## 📋 서비스 정보

### Vault 서버

- **주소**: <http://localhost:8200>
- **Root 토큰**: `myroot`
- **UI**: <http://localhost:8200/ui>

### Vault UI (선택사항)

- **주소**: <http://localhost:8000>
- **인증**: TOKEN 방식으로 `myroot` 사용

## 🔧 기본 Vault 작업

### CLI를 통한 기본 작업

```bash
# Vault 상태 확인
vault status

# 로그인
vault auth -method=token token=myroot

# KV v2 엔진 활성화 (이미 활성화되어 있음)
vault secrets enable -version=2 kv

# 시크릿 생성
vault kv put secret/myapp username=admin password=secret123

# 시크릿 읽기
vault kv get secret/myapp

# 시크릿 목록
vault kv list secret/
```

### MCP 서버를 통한 작업

```bash
# 환경 변수 설정 후
source vault.env

# MCP 서버 시작
npm start

# 다른 터미널에서 테스트
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "vault-health", "arguments": {}}}' | node dist/index.js
```

## 🛠️ 개발 팁

### 1. 데이터 초기화

```bash
# 컨테이너와 볼륨 완전 삭제
docker-compose down -v

# 다시 시작
docker-compose up -d
```

### 2. 로그 모니터링

```bash
# Vault 로그
docker-compose logs -f vault

# 모든 서비스 로그
docker-compose logs -f
```

### 3. 컨테이너 내부 접근

```bash
# Vault 컨테이너 접속
docker-compose exec vault sh

# Vault CLI 사용
vault status
```

## 🔒 보안 주의사항

⚠️ **이 설정은 개발 전용입니다!**

- Root 토큰이 하드코딩되어 있음
- TLS가 비활성화되어 있음
- 메모리 스토리지 사용 (재시작 시 데이터 손실)
- 모든 네트워크 인터페이스에서 접근 가능

프로덕션 환경에서는 절대 사용하지 마세요!

## 📁 파일 구조

```
vault-mcp/
├── docker-compose.yaml    # Docker Compose 설정
├── vault-config/
│   └── vault.hcl         # Vault 서버 설정
├── vault.env             # 환경 변수
└── VAULT_SETUP.md        # 이 파일
```

## 🔍 문제 해결

### Vault가 시작되지 않는 경우

```bash
# 포트 충돌 확인
netstat -tlnp | grep 8200

# 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs vault
```

### MCP 서버 연결 오류

```bash
# Vault 상태 확인
curl http://localhost:8200/v1/sys/health

# 환경 변수 확인
echo $VAULT_ADDR
echo $VAULT_TOKEN
```

## 📚 추가 리소스

- [Vault 공식 문서](https://www.vaultproject.io/docs)
- [Vault API 문서](https://www.vaultproject.io/api-docs)
- [Docker Compose 문서](https://docs.docker.com/compose/)

# Vault 개발 환경 설정
# 프로덕션 환경에서는 절대 사용하지 마세요!

ui = true

# 개발 모드에서는 메모리 스토리지 사용
storage "inmem" {}

# HTTP 리스너
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

# 개발 모드 설정
disable_mlock = true

# 로깅 레벨
log_level = "Info"

# API 주소
api_addr = "http://0.0.0.0:8200"

# 클러스터 주소
cluster_addr = "http://0.0.0.0:8201"
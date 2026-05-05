#!/bin/sh
set -eu

# SpecFlow Sprint Test Runner
# 用途：本機 + CI 共用同一份測試流程
# 用法：
#   run-sprint-tests.sh [feature-glob]
#     feature-glob = "all"（預設）跑全部
#                  = "specs/features/F-002*.feature" 跑特定 feature
# 環境變數：
#   BASE_URL          測試目標 URL（預設 http://localhost:3000）
#   SKIP_DOCKER=1     不啟動 docker compose（假設服務已在跑）
#   SKIP_HEALTH=1     不等 health check
# Exit code：0 = 全部測試通過；非 0 = 任一階段失敗

FEATURE_GLOB="${1:-all}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
REPORT_DIR="test/reports"
SCREENSHOT_DIR="test/screenshots"

# 偵測 docker-compose / dev 目錄佈局（brownfield 專案常將 compose 放在 repo root）
if [ -f dev/docker-compose.yml ] || [ -f dev/docker-compose.example.yml ]; then
  COMPOSE_DIR="dev"
elif [ -f docker-compose.yml ]; then
  COMPOSE_DIR="."
else
  COMPOSE_DIR=""
fi

# 偵測 unit test runner（Go 為主、否則 fall back 到 npm）
if [ -f go.mod ]; then
  UNIT_TEST_CMD="go test ./..."
elif [ -f dev/package.json ]; then
  UNIT_TEST_CMD="cd dev && (npm ci --silent 2>/dev/null || npm install --silent) && npm test"
else
  UNIT_TEST_CMD=""
fi

mkdir -p "$REPORT_DIR" "$SCREENSHOT_DIR"

log() { printf '\n=== %s ===\n' "$*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# ---- 1. 啟動 docker（除非略過）----
GO_SERVER_PID=""
GO_SERVER_LOG="$REPORT_DIR/go-server.log"

if [ "${SKIP_DOCKER:-0}" != "1" ]; then
  [ -n "$COMPOSE_DIR" ] || fail "找不到 docker-compose 設定（dev/ 或 root）"
  log "Starting docker compose ($COMPOSE_DIR)"
  ( cd "$COMPOSE_DIR" && \
    { [ -f docker-compose.yml ] || cp docker-compose.example.yml docker-compose.yml; } && \
    { [ -f .env ] || [ ! -f .env.example ] || cp .env.example .env; } && \
    docker compose up -d --build )
fi

# ---- 1b. 啟動 Go server（除非已在跑）----
# BASE_URL 例如 http://localhost:3000 → port=3000
PORT=$(echo "$BASE_URL" | sed -E 's|.*://[^:]+:?([0-9]*).*|\1|')
PORT="${PORT:-3000}"

if [ -f go.mod ] && [ "${SKIP_GO_SERVER:-0}" != "1" ]; then
  if curl -sf "$BASE_URL/health" > /dev/null 2>&1 && curl -sf "$BASE_URL/api/settings" > /dev/null 2>&1; then
    echo "✅ Go server 已在 $BASE_URL 運行，跳過啟動"
  else
    log "Starting Go server on :$PORT"
    [ -f .env ] || [ ! -f .env.example ] || cp .env.example .env
    # 載入 .env
    set -a; [ -f .env ] && . ./.env; set +a
    : "${DATABASE_URL:=postgres://chatbot:chatbot@localhost:2345/chatbot?sslmode=disable}"
    : "${LOCAL_USER_EMAIL:=qa@example.com}"
    : "${LOCAL_USER_NAME:=QA Tester}"
    export DATABASE_URL LOCAL_USER_EMAIL LOCAL_USER_NAME
    export HTTP_ADDR=":$PORT"
    export INJECT_DRAFT_ENABLED=1
    export NODE_ENV=development
    : > "$GO_SERVER_LOG"
    go run ./cmd/server > "$GO_SERVER_LOG" 2>&1 &
    GO_SERVER_PID=$!
    echo "Go server PID=$GO_SERVER_PID, log=$GO_SERVER_LOG"
  fi
fi

if [ "${SKIP_HEALTH:-0}" != "1" ]; then
  log "Waiting for health check at $BASE_URL/health"
  for i in $(seq 1 60); do
    if curl -sf "$BASE_URL/health" > /dev/null 2>&1 && curl -sf "$BASE_URL/api/settings" > /dev/null 2>&1; then
      echo "✅ Services ready"
      break
    fi
    if [ -n "$GO_SERVER_PID" ] && ! kill -0 "$GO_SERVER_PID" 2>/dev/null; then
      echo "❌ Go server crashed — log:"
      tail -40 "$GO_SERVER_LOG"
      fail "Go server 啟動失敗"
    fi
    [ "$i" = "60" ] && { tail -40 "$GO_SERVER_LOG" 2>/dev/null; fail "Service health check timeout at $BASE_URL"; }
    printf '.'; sleep 2
  done
fi

cleanup() {
  if [ -n "$GO_SERVER_PID" ] && kill -0 "$GO_SERVER_PID" 2>/dev/null; then
    log "Stopping Go server (PID=$GO_SERVER_PID)"
    kill "$GO_SERVER_PID" 2>/dev/null || true
    wait "$GO_SERVER_PID" 2>/dev/null || true
  fi
  if [ "${SKIP_DOCKER:-0}" != "1" ] && [ -n "$COMPOSE_DIR" ]; then
    log "Stopping docker compose"
    ( cd "$COMPOSE_DIR" && docker compose down ) || true
  fi
}
trap cleanup EXIT

# ---- 2. Unit tests ----
if [ -n "$UNIT_TEST_CMD" ]; then
  log "Unit tests ($UNIT_TEST_CMD)"
  sh -c "$UNIT_TEST_CMD" || fail "Unit tests failed"
else
  log "No unit tests detected, skipping"
fi

# ---- 3. 同步 .feature 到 test/features/ ----
log "Sync feature files"
mkdir -p test/features
if [ "$FEATURE_GLOB" = "all" ]; then
  cp specs/features/*.feature test/features/ 2>/dev/null || true
else
  # 只複製指定的 feature（給 PR-level 測試用）
  cp $FEATURE_GLOB test/features/ 2>/dev/null || fail "No feature matched: $FEATURE_GLOB"
fi

# ---- 4. BDD tests ----
log "BDD tests (playwright-bdd)"
( cd test && npm ci --silent 2>/dev/null || npm install --silent )
( cd test && npx playwright install --with-deps chromium > /dev/null 2>&1 || npx playwright install chromium )

REPORT_JSON="$REPORT_DIR/cucumber.json"
HTML_REPORT="$REPORT_DIR/playwright-report"
(
  cd test && \
  BASE_URL="$BASE_URL" npx bddgen; \
  # bddgen exits 非 0 當有 missing step definitions（未來 sprint feature）；不阻擋 playwright
  BASE_URL="$BASE_URL" npx playwright test \
    --reporter=json,html \
    --output="../$SCREENSHOT_DIR" \
    > "../$REPORT_JSON" 2>&1
) || {
  echo "❌ BDD tests failed — see $REPORT_JSON"
  # 解析失敗統計（如有）
  if [ -f "$REPORT_JSON" ] && command -v jq > /dev/null; then
    PASS=$(jq '.stats.expected // 0' "$REPORT_JSON" 2>/dev/null || echo "?")
    FAIL=$(jq '.stats.unexpected // 0' "$REPORT_JSON" 2>/dev/null || echo "?")
    echo "   pass=$PASS fail=$FAIL"
  fi
  exit 1
}

# ---- 5. Coverage check：所有 .feature scenario 都有跑到嗎 ----
log "Scenario coverage check"
TOTAL_SCENARIOS=$(grep -rh "^\s*Scenario\(\| Outline\):" specs/features/ 2>/dev/null | wc -l | tr -d ' ')
RAN_SCENARIOS=$(jq '[.suites[]?.specs[]?] | length' "$REPORT_JSON" 2>/dev/null || echo "0")

echo "Spec scenarios: $TOTAL_SCENARIOS"
echo "Tests run: $RAN_SCENARIOS"

if [ "$FEATURE_GLOB" = "all" ] && [ "$RAN_SCENARIOS" -lt "$TOTAL_SCENARIOS" ]; then
  fail "Coverage gap: $RAN_SCENARIOS / $TOTAL_SCENARIOS scenarios executed. 有 .feature 場景沒被測到。"
fi

log "✅ All tests passed"

#!/usr/bin/env bash
# HB-018: Hosted beta smoke verification (local/Docker)
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:4000}"
if [[ -z "${WEB_BASE:-}" ]]; then
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173/" | grep -q '^200$'; then
    WEB_BASE="http://localhost:5173"
  elif curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080/" | grep -q '^200$'; then
    WEB_BASE="http://localhost:8080"
  else
    WEB_BASE="http://localhost:5173"
  fi
fi
FAILURES=0

pass() {
  echo "✓ $1"
}

fail() {
  echo "✗ $1"
  FAILURES=$((FAILURES + 1))
}

echo "== Hosted Beta Verification =="
echo "API: $API_BASE  WEB: $WEB_BASE"

# Health
HEALTH=$(curl -sf "$API_BASE/health" || echo "")
echo "$HEALTH" | grep -q '"ok":true' && pass "API health" || fail "API health"
echo "$HEALTH" | grep -q '"database":"ok"' && pass "API health database check" || fail "API health database check"
echo "$HEALTH" | grep -q '"objectStorage":"ok"' && pass "API health object storage check" || fail "API health object storage check"
echo "$HEALTH" | grep -Eq '"provider":"(reachable|unreachable)"' \
  && pass "API health provider reachability reported" \
  || fail "API health provider reachability reported"

# Public routes (web must be running)
for path in / /demo /contact /privacy /terms /login; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_BASE$path" || echo "000")
  [[ "$code" == "200" ]] && pass "WEB $path" || fail "WEB $path ($code)"
done

# Dev auth flow — use a fresh email so consent gate is testable on repeat runs
SMOKE_EMAIL="smoke-$(date +%s)@studyagent.local"
SESSION=$(curl -sf -X POST "$API_BASE/auth/dev-login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${SMOKE_EMAIL}\"}" \
  -c - | grep sa_session | awk '{print $NF}' || true)

if [[ -n "${SESSION:-}" ]]; then
  pass "Dev login session"
  ME=$(curl -sf "$API_BASE/api/v1/me" -H "Cookie: sa_session=$SESSION")
  echo "$ME" | grep -q '"authenticated":true' && pass "GET /me" || fail "GET /me"
  echo "$ME" | grep -q '"studyAccess"' && pass "Product entitlements" || fail "Product entitlements"
  if echo "$ME" | grep -q 'tutorCreditsCents'; then
    fail "/me must not expose credit cents"
  else
    pass "/me hides credit cents"
  fi
else
  fail "Dev login session"
fi

if [[ -n "${SESSION:-}" ]]; then
  NOTEBOOKS_BEFORE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/v1/notebooks" -H "Cookie: sa_session=$SESSION" || echo "000")
  if [[ "$NOTEBOOKS_BEFORE" == "403" || "$NOTEBOOKS_BEFORE" == "401" ]]; then
    pass "Notebooks require consent before acceptance ($NOTEBOOKS_BEFORE)"
  else
    fail "Notebooks should reject missing consent (got $NOTEBOOKS_BEFORE)"
  fi
  CONSENT_BODY=$(curl -sf -X POST "$API_BASE/api/v1/consent" -H "Cookie: sa_session=$SESSION" 2>/dev/null || echo "")
  if [[ -n "$CONSENT_BODY" ]]; then
    pass "Beta consent"
  else
    fail "Beta consent failed"
  fi
fi

# Notebooks after consent
if [[ -n "${SESSION:-}" ]]; then
  curl -sf "$API_BASE/api/v1/notebooks" -H "Cookie: sa_session=$SESSION" >/dev/null \
    && pass "Notebooks list after consent" || fail "Notebooks list after consent"
fi

# Study templates
if [[ -n "${SESSION:-}" ]]; then
  TEMPLATES=$(curl -sf "$API_BASE/api/v1/study-templates" -H "Cookie: sa_session=$SESSION" || echo "")
  if [[ -n "$TEMPLATES" ]] && echo "$TEMPLATES" | grep -q '"templates"'; then
    pass "Study templates list"
    TEMPLATE_COUNT=$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(0,"utf8")); console.log(Array.isArray(data.templates)?data.templates.length:0)' <<<"$TEMPLATES" 2>/dev/null || echo 0)
    if [[ "$TEMPLATE_COUNT" -ge 3 && "$TEMPLATE_COUNT" -le 8 ]]; then
      pass "Study template launch count ($TEMPLATE_COUNT)"
    else
      fail "Study template launch count must be 3-8 (got $TEMPLATE_COUNT)"
    fi
  else
    fail "Study templates list failed"
  fi
fi

# Credits
if [[ -n "${SESSION:-}" ]]; then
  curl -sf "$API_BASE/api/v1/credits" -H "Cookie: sa_session=$SESSION" | grep -q percentRemaining \
    && pass "Credit summary" || fail "Credit summary"
fi

if [[ -n "${SESSION:-}" ]]; then
  TEMPLATE_CREATE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/api/v1/notebooks" \
    -H "Cookie: sa_session=$SESSION" \
    -H "Content-Type: application/json" \
    -d '{"title":"Bypass","studyTemplateId":"st_test"}' || echo "000")
  if [[ "$TEMPLATE_CREATE" == "400" ]]; then
    pass "POST /notebooks rejects studyTemplateId bypass"
  else
    fail "POST /notebooks should reject studyTemplateId (got $TEMPLATE_CREATE)"
  fi
fi

echo ""
if [[ "$FAILURES" -gt 0 ]]; then
  echo "Hosted beta verification failed: $FAILURES check(s) failed"
  exit 1
fi

echo "Hosted beta verification passed. For full E2E, run with Docker stack up and RUN_POSTGRES_INTEGRATION=1 pnpm test"

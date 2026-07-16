#!/bin/sh
set -eu

cd /repo/apps/server

# Enable PostgreSQL TLS for managed providers such as Neon.
if echo "${DATABASE_URL:-}" | grep -q 'sslmode=require'; then
  export PGSSLMODE=require
fi

if [ "${NODE_ENV:-production}" = "production" ]; then
  [ -n "${JWT_SECRET:-}" ] && [ "${#JWT_SECRET}" -ge 32 ] || {
    echo "[entrypoint] JWT_SECRET must contain at least 32 characters" >&2
    exit 1
  }
  [ -n "${DB_CONFIG_ENCRYPTION_KEY:-}" ] || {
    echo "[entrypoint] DB_CONFIG_ENCRYPTION_KEY must be set" >&2
    exit 1
  }
fi

DATABASE_URL_VALUE="${DATABASE_URL:?DATABASE_URL must be set}"
DB_HOST=$(printf '%s' "$DATABASE_URL_VALUE" | sed -n 's#.*@\([^:/?]*\).*#\1#p')
DB_PORT=$(printf '%s' "$DATABASE_URL_VALUE" | sed -n 's#.*@[^:/?]*:\([0-9][0-9]*\).*#\1#p')
DB_PORT="${DB_PORT:-5432}"
DB_USER_VALUE="${DB_USER:-$(printf '%s' "$DATABASE_URL_VALUE" | sed -n 's#^[^:]*://\([^:]*\):.*#\1#p')}"
DB_NAME_VALUE="${DB_NAME:-$(printf '%s' "$DATABASE_URL_VALUE" | sed -n 's#^.*/\([^/?]*\).*#\1#p')}"
DB_PASS="${DB_PASSWORD:-$(printf '%s' "$DATABASE_URL_VALUE" | sed -n 's#^[^:]*://[^:]*:\([^@]*\)@.*#\1#p')}"

[ -n "$DB_HOST" ] || { echo "[entrypoint] could not parse database host" >&2; exit 1; }
[ -n "$DB_USER_VALUE" ] || { echo "[entrypoint] could not parse database user" >&2; exit 1; }
[ -n "$DB_NAME_VALUE" ] || { echo "[entrypoint] could not parse database name" >&2; exit 1; }

# Managed databases cannot be probed with a local socket; wait for TCP only.
echo "[entrypoint] waiting for postgres at ${DB_HOST}:${DB_PORT}..."
i=0
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -le 60 ] || { echo "[entrypoint] database not reachable after 60s" >&2; exit 1; }
  sleep 1
done

echo "[entrypoint] database is reachable"
export PGPASSWORD="$DB_PASS"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER_VALUE -d $DB_NAME_VALUE"
TABLE_COUNT=$($PSQL -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('User','DataSource','ChatSession','ChatMessage','LLMConfig');" 2>/dev/null | tr -d '[:space:]')

if [ "${TABLE_COUNT:-0}" = "0" ]; then
  echo "[entrypoint] first boot detected; applying schema.sql"
  $PSQL -v ON_ERROR_STOP=1 -f prisma/schema.sql
  if [ "${INIT_SEED:-false}" = "true" ]; then
    echo "[entrypoint] running first-boot seed"
    ./node_modules/.bin/ts-node prisma/seed.ts
  fi
else
  echo "[entrypoint] existing schema detected; skipping initialization"
fi

unset PGPASSWORD
echo "[entrypoint] starting server on port ${PORT:-3000}..."
exec node dist/main.js

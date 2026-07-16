#!/bin/sh
# Production-safe server entrypoint: initialize the schema once, then start NestJS.
set -eu

cd /repo/apps/server

DB_HOST="${DATABASE_HOST:-postgres}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER_VALUE="${DB_USER:-app}"
DB_NAME_VALUE="${DB_NAME:-ai_insight}"
DB_PASSWORD_VALUE="${DB_PASSWORD:?DB_PASSWORD must be set}"

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

export PGPASSWORD="$DB_PASSWORD_VALUE"

echo "[entrypoint] waiting for postgres at ${DB_HOST}:${DB_PORT}..."
i=0
until nc -z "$DB_HOST" "$DB_PORT"; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] postgres not ready after 60s, giving up" >&2
    exit 1
  fi
  sleep 1
done

psql_cmd="psql -h $DB_HOST -p $DB_PORT -U $DB_USER_VALUE -d $DB_NAME_VALUE"
TABLE_COUNT=$($psql_cmd -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('User','DataSource','ChatSession','ChatMessage','LLMConfig');" | tr -d '[:space:]')

if [ "${TABLE_COUNT:-0}" = "0" ]; then
  echo "[entrypoint] first boot detected; applying schema.sql"
  $psql_cmd -v ON_ERROR_STOP=1 -f prisma/schema.sql

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

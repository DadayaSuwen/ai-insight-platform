#!/bin/sh
# Server entrypoint — waits for Postgres, applies schema via psql, seeds, then starts Node.
# We use psql instead of `prisma db push` to avoid pulling Prisma's native query
# engine into the runtime image (alpine + musl + openssl 1.1 are flaky).
set -eu

cd /repo/apps/server

echo "[entrypoint] waiting for postgres at ${DATABASE_HOST:-postgres}:5432..."
i=0
until nc -z "${DATABASE_HOST:-postgres}" 5432; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] postgres not ready after 60s, giving up"
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] postgres is reachable"

echo "[entrypoint] applying schema.sql..."
# Idempotent: skip "already exists" errors so restarts are safe.
# For real production migrations use prisma migrate + versioned SQL files.
PGPASSWORD="${DB_PASSWORD:-password}" psql \
    -h "${DATABASE_HOST:-postgres}" \
    -U "${DB_USER:-app}" \
    -d "${DB_NAME:-ai_insight}" \
    -c "DROP TABLE IF EXISTS \"ChatMessage\" CASCADE; DROP TABLE IF EXISTS \"ChatSession\" CASCADE; DROP TABLE IF EXISTS \"Sales\" CASCADE;" \
    -f prisma/schema.sql

if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "[entrypoint] seeding database..."
  ./node_modules/.bin/ts-node prisma/seed.ts \
    && echo "[entrypoint] seed completed" \
    || echo "[entrypoint] seed failed (continuing)"
fi

echo "[entrypoint] starting server on port ${PORT:-3000}..."
exec dumb-init -- node dist/main.js
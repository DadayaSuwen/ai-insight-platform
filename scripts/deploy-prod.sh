#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE="docker compose --env-file ${ROOT_DIR}/.env -f ${ROOT_DIR}/docker-compose.prod.yml"

[ -f "${ROOT_DIR}/.env" ] || { echo "Missing .env. Copy .env.production.example first." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }

echo "Validating production Compose configuration..."
$COMPOSE config -q

echo "Building production images..."
$COMPOSE build

echo "Starting production stack..."
$COMPOSE up -d

"${ROOT_DIR}/scripts/verify-prod.sh"
echo "Production deployment is ready at http://localhost:${WEB_PORT:-8080}"

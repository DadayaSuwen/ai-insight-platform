#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE="docker compose --env-file ${ROOT_DIR}/.env -f ${ROOT_DIR}/docker-compose.prod.yml"

[ -f "${ROOT_DIR}/.env" ] || { echo "Missing .env" >&2; exit 1; }
$COMPOSE ps

for service in postgres server web; do
  state=$($COMPOSE ps --format '{{.Service}} {{.Health}}' "$service" | tr -d '\r')
  case "$state" in
    *healthy*|*running*) echo "$service: ready ($state)" ;;
    *) echo "$service is not ready: $state" >&2; exit 1 ;;
  esac
done

curl -fsS "http://localhost:${WEB_PORT:-8080}/" >/dev/null
echo "Production smoke checks passed."

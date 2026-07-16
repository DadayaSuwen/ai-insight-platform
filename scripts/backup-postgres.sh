#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="${BACKUP_DIR}/ai-insight-${STAMP}.dump.gz"

COMPOSE="docker compose --env-file ${ROOT_DIR}/.env -f ${ROOT_DIR}/docker-compose.prod.yml"
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' | gzip > "$OUTPUT"
echo "PostgreSQL backup written to $OUTPUT"

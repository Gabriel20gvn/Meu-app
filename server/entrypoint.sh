#!/bin/sh
set -eu
mkdir -p "${COMPASSO_DATA_DIR:-/data}"
chown compasso "${COMPASSO_DATA_DIR:-/data}"
exec gosu compasso uvicorn server.api:create_app --factory --host 0.0.0.0 --port "${PORT:-8000}" --workers 1

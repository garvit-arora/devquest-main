#!/usr/bin/env bash
set -euo pipefail

cd /home/site/wwwroot

python -m uvicorn apps.api.devquest_api.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout-keep-alive 30

#!/usr/bin/env bash
set -euo pipefail

cd /home/site/wwwroot

SITE_PACKAGES="/home/site/wwwroot/.python_packages/lib/site-packages"
export PYTHONPATH="/home/site/wwwroot:${SITE_PACKAGES}:${PYTHONPATH:-}"

if ! python -c "import uvicorn" >/dev/null 2>&1; then
  python -m pip install --disable-pip-version-check -r requirements.txt --target "${SITE_PACKAGES}"
fi

exec python -m uvicorn apps.api.devquest_api.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout-keep-alive 30

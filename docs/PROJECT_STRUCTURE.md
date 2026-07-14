# DevQuest AI project structure

DevQuest AI is a monorepo with separate frontend, backend, worker, infrastructure, and documentation areas.

## Top level

```text
apps/
  web/                  Next.js dashboard, landing page, auth pages, admin UI
  api/                  FastAPI backend, gateway, Mongo stores, worker logic
packages/
  types/                Shared TypeScript types
  animation-system/     Shared frontend animation package
docs/
  mintlify-docs/        Public documentation site content
infrastructure/
  docker/               Production Dockerfiles
  azure/                Azure infrastructure templates
```

## Frontend

```text
apps/web/src/app/       Next.js routes
apps/web/src/components Shared UI components
apps/web/src/lib        Small frontend utilities and public env access
apps/web/public         Static assets such as logo and login background
```

Important routes:

```text
/                         Landing page
/signin                   GitHub OAuth entry page
/app                      User dashboard shell
/app/projects             Star-to-earn repositories
/app/pull-requests        Merged PR rewards
/app/api-keys             API key management
/app/playground           Responses playground
/app/workflows            Automation builder
/admin                    Admin login and metrics
/admin/sponsors           Sponsor campaign metrics
/terms                    Terms
/privacy                  Privacy policy
```

## Backend

```text
apps/api/devquest_api/app.py          FastAPI app factory and router registration
apps/api/devquest_api/config.py       Runtime settings and cookie constants
apps/api/devquest_api/models.py       Pydantic request and persistence models
apps/api/devquest_api/state.py        Process-local cache loaded from MongoDB
apps/api/devquest_api/routers/        HTTP route modules
apps/api/devquest_api/services/       Domain logic such as entitlement checks
apps/api/devquest_api/*_store.py      MongoDB persistence modules
apps/api/devquest_api/providers.py    Azure/OpenAI-compatible provider adapter
apps/api/devquest_api/worker.py       Background star verification worker
```

Important backend surfaces:

```text
/api/auth/*              GitHub OAuth and sessions
/api/projects            Star-to-earn repository campaigns
/api/pull-requests       Merged PR rewards
/api/api-keys            Hash-only API keys
/api/admin/*             Admin portal data
/v1/models               Public model aliases
/v1/responses            Codex-compatible gateway endpoint
/v1/chat/completions     Chat completions gateway endpoint
/v1/usage                Key-scoped usage endpoint
```

## Data

MongoDB is the source of truth. Runtime dictionaries in `state.py` are only a fast process-local cache.

Core collections:

```text
github_users
repository_campaigns
repository_entitlements
pull_request_campaigns
pull_request_rewards
api_keys
ledger_records
api_request_logs
referrals
referral_clicks
sponsor_submissions
notifications
workflows
workflow_executions
workflow_credentials
platform_logs
```

Raw API keys are never stored. The database stores key prefix, hash, owner, allowed models, limits, status, and timestamps.

## Local commands

```powershell
npm install
pip install -r apps/api/requirements.txt
npm --workspace apps/web run dev
python -m uvicorn apps.api.devquest_api.main:app --reload --port 8000
```

Production checks:

```powershell
python -m pytest apps/api/tests
npm --workspace apps/web run lint
npm --workspace apps/web run build
```

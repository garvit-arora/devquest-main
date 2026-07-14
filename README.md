# DevQuest AI

DevQuest AI is a star-to-earn API access platform:

```text
Star approved GitHub repositories or merge approved PRs -> earn prompt credits -> create a DevQuest API key -> call an Azure-backed OpenAI-compatible API.
```

No repositories are preloaded from source code. Add real star campaigns into MongoDB `repository_campaigns` using the admin API or `python -m apps.api.devquest_api.seed_repository_campaign`. PR campaigns can still be configured separately through `DEVQUEST_PR_REPOS` until a DB admin flow is added for them.

## What Is Implemented

- DevQuest AI landing page with the supplied video treatment, product-specific copy, responsive menu, and motion.
- Real GitHub OAuth login with state validation and signed HTTP-only session cookie.
- Owner-configured repository list loaded from environment JSON.
- Immediate GitHub star verification through the authenticated GitHub API.
- One-time 200-credit repository star reward with idempotency.
- One-time 150-credit merged pull request reward with GitHub author and merge verification.
- 10-minute verification worker loop and Azure Service Bus enqueue hook.
- API access blocking when no eligible approved repository is currently starred.
- Backend-generated `dq_live_...` API keys with secure hashes only, one-time raw-key display, rename, rotate, and revoke.
- OpenAI-compatible `/v1/models`, `/v1/chat/completions`, and `/v1/usage` gateway endpoints.
- Azure provider path via `DEVQUEST_PROVIDER_BASE_URL` and hidden upstream model mappings.
- Sponsor submission form with Azure Communication Services Email support.
- MongoDB persistence for users, GitHub tokens, repository campaigns, entitlements, pull request campaigns, pull request rewards, API-key hashes, ledger records, usage logs, referrals, notifications, sponsor submissions, webhook deliveries, admin users, and platform logs.
- Dashboard routes for Overview, Projects, Pull Requests, API Keys, Playground, Usage, Credit History, Offers, Sponsors, and Notifications.

## Local Setup

```bash
npm install
python -m venv .venv
.venv\Scripts\activate
pip install -r apps/api/requirements.txt
copy .env.example .env
copy apps\web\.env.local.example apps\web\.env.local
npm run dev:api
npm run dev:web
```

Frontend: `http://localhost:3000`
API: `http://localhost:8000`

## Project Structure

For a more detailed map, see `docs/PROJECT_STRUCTURE.md`.

```text
apps/api/devquest_api/app.py             FastAPI app factory and router registration
apps/api/devquest_api/config.py          typed runtime settings and cookie constants
apps/api/devquest_api/state.py           Mongo-loaded runtime cache for API request handling
apps/api/devquest_api/deps.py            shared FastAPI dependencies and response helpers
apps/api/devquest_api/routers/           auth, product, projects, keys, sponsors, webhooks, gateway
apps/api/devquest_api/services/          entitlement and gateway domain services
apps/web/src/app/                        Next.js routes
apps/web/src/components/                 route-level UI components
apps/web/src/lib/env.ts                  public frontend environment access
```

MongoDB is the single persistence database for the platform. Runtime dictionaries are used as a fast process-local cache, then loaded from and saved to MongoDB through store modules.

API keys are hash-only. The raw key is returned once at creation/rotation time and is never persisted. Database records store the key prefix, `key_hash`, user id, model restrictions, status, limits, and timestamps. Set a strong `DEVQUEST_API_KEY_PEPPER` before creating production keys.

## Required Configuration

GitHub OAuth:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- Local callback URL: `http://localhost:8000/api/auth/github/callback`
- Production callback URL: `https://your-api-domain.com/api/auth/github/callback`

Approved repositories are stored in MongoDB:

```bash
python -m apps.api.devquest_api.seed_repository_campaign \
  --owner your-org \
  --name your-repo \
  --url https://github.com/your-org/your-repo \
  --description "Real repository" \
  --reward-credits 200 \
  --status active
```

Pull request reward repositories:

```env
DEVQUEST_PR_REPOS=[{"owner":"your-org","name":"your-repo","description":"Meaningful merged PRs only","reward_credits":150,"status":"active"}]
```

Azure model gateway:

- `DEVQUEST_PROVIDER_BASE_URL`
- `DEVQUEST_PROVIDER_API_KEY`
- `DEVQUEST_PUBLIC_MODELS=DeepSeek-V4-Pro,gpt-5.5,gpt-5.6-luna,gpt-5.6-sol`
- `DEVQUEST_DEEPSEEK_V4_PRO_MODEL=DeepSeek-V4-Pro`
- `DEVQUEST_AZURE_GPT_55_MODEL=gpt-5.5`
- `DEVQUEST_AZURE_GPT_56_LUNA_MODEL=gpt-5.6-luna`
- `DEVQUEST_AZURE_GPT_56_SOL_MODEL=gpt-5.6-sol`

Azure sponsor email:

- `AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING`
- `AZURE_COMMUNICATION_EMAIL_SENDER`
- `DEVQUEST_OWNER_EMAIL`

Azure queue and secrets:

- `AZURE_SERVICE_BUS_CONNECTION_STRING`
- `AZURE_SERVICE_BUS_STAR_QUEUE`
- `AZURE_KEY_VAULT_URL`

MongoDB persistence:

- `MONGODB_URI`
- `MONGODB_DATABASE`

Put the full MongoDB connection string in `.env`:

```env
MONGODB_URI=mongodb+srv://garvit:YOUR_REAL_PASSWORD@learning.3u2np.mongodb.net/devquest?retryWrites=true&w=majority&appName=Learning
MONGODB_DATABASE=devquest
```

If you use the shard-style Atlas URI, replace only `<db_password>` with the real database user password and keep the rest of the URI:

```env
MONGODB_URI=mongodb://garvit:YOUR_REAL_PASSWORD@learning-shard-00-00.3u2np.mongodb.net:27017,learning-shard-00-01.3u2np.mongodb.net:27017,learning-shard-00-02.3u2np.mongodb.net:27017/?ssl=true&replicaSet=atlas-ne7nol-shard-0&authSource=admin&appName=Learning
```

## API Usage

```bash
curl https://api.devquest.garvitarora.xyz/v1/chat/completions \
  -H "Authorization: Bearer dq_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{"model":"devquest-fast","messages":[{"role":"user","content":"Explain this code."}]}'
```

Requests are rejected before Azure is called if the key is revoked, credits are exhausted, rate limits are exceeded, the model is unavailable, or the user has no verified starred approved repository.

## Azure Services

This repo includes production paths for:

- Azure Container Apps: frontend, API, worker deployment target.
- Azure OpenAI / Azure AI Foundry: model inference behind DevQuest aliases.
- Azure Service Bus: star-verification queue hook.
- Azure Key Vault: secret retrieval helper and deployment target.
- Azure Application Insights: infrastructure resource for telemetry.
- Azure Communication Services Email: sponsor submission emails.
- Azure Container Registry: image target for frontend/API/worker.

## Tests

```bash
npm run build:web
npm run test:api
```

Backend tests cover API-key hashing, ledger reservation/settlement, duplicate reward prevention, authenticated dashboard access, star verification, confirmed-unstar API blocking, temporary GitHub failure handling, key rename/rotation/revocation, sponsor duplicate detection, model registry, and webhook signature/idempotency.

## Deployment

For the full production split with Vercel frontend, Azure backend, MongoDB, Azure Email, Service Bus, DNS, OAuth callbacks, and git commands, see `DEPLOYMENT.md`.

For the older Azure VM-only walkthrough with `devquest.garvitarora.xyz` and `api.devquest.garvitarora.xyz`, see `docs/AZURE_VM_DEPLOYMENT.md`.

## Persistence Notes

Use only MongoDB for product persistence. Do not configure `DATABASE_URL`, PostgreSQL, SQLite, Prisma, or Redis for this project.

API keys are the exception to normal storage: only `prefix`, `key_hash`, and metadata are saved. Raw API keys are shown once and never persisted.

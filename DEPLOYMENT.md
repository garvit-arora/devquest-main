# DevQuest AI Deployment README

This guide deploys DevQuest AI as a split production system:

- Frontend: Next.js app from `apps/web` on Vercel.
- Backend: FastAPI app from `apps/api` on Azure.
- Database: MongoDB Atlas or Azure Cosmos DB for MongoDB vCore.
- Notifications: Azure Communication Services Email.
- Queues and background work: Azure Service Bus.
- Secrets and observability: Azure Key Vault, Application Insights, Log Analytics.

Recommended production domains:

- App: `https://devquest.garvitarora.xyz`
- API: `https://api.devquest.garvitarora.xyz`
- Gateway: `https://api.devquest.garvitarora.xyz/v1`

## 1. Commit The Project

Do this from the repository root.

```powershell
cd D:\Github-reward
git init
git status
git add .
git commit -m "Initial DevQuest AI production platform"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Important: do not commit `.env`. It is already ignored by `.gitignore`. Put production secrets in Vercel and Azure environment variables.

If `git status` shows unrelated folders from `D:\`, Git is using a parent repository. Running `git init` inside `D:\Github-reward` makes this project its own repository. The accidental nested Git metadata inside `apps/web` has been removed, so the monorepo can be committed from the root.

## 2. Local Production Check

Install and test locally before deploying.

```powershell
npm ci
npm run lint
npm run build
python -m pip install -r apps/api/requirements.txt
python -m pytest apps/api/tests
```

Run locally:

```powershell
npm run dev:web
python -m uvicorn apps.api.devquest_api.main:app --reload --port 8000
```

Open:

- Frontend: `http://localhost:3000`
- API health: `http://localhost:8000/health`

## 3. Production Environment Variables

Use `.env.example` as the source of truth. In production, set these in Vercel and Azure, not in a committed file.

Core production values:

```env
NEXT_PUBLIC_APP_URL=https://devquest.garvitarora.xyz
NEXT_PUBLIC_API_URL=https://api.devquest.garvitarora.xyz
NEXT_PUBLIC_DEVQUEST_GATEWAY_URL=https://api.devquest.garvitarora.xyz/v1

SESSION_SECRET=generate-a-long-random-secret
DEVQUEST_API_KEY_PEPPER=generate-a-long-random-pepper
DEVQUEST_ADMIN_PASSWORD_PEPPER=generate-a-long-random-admin-pepper

GITHUB_CLIENT_ID=your-github-oauth-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-client-secret
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret

MONGODB_URI=your-mongodb-atlas-or-cosmos-mongodb-uri
MONGODB_DATABASE=devquest

DEVQUEST_PROVIDER_BASE_URL=https://star-project-keys-resource.openai.azure.com/
DEVQUEST_PROVIDER_API_KEY=your-azure-model-api-key
DEVQUEST_PROVIDER_API_VERSION=your-api-version-if-needed
DEVQUEST_PUBLIC_MODELS=DeepSeek-V4-Pro,gpt-5.5,gpt-5.6-luna,gpt-5.6-sol
DEVQUEST_DEEPSEEK_V4_PRO_MODEL=DeepSeek-V4-Pro
DEVQUEST_AZURE_GPT_55_MODEL=gpt-5.5
DEVQUEST_AZURE_GPT_56_LUNA_MODEL=gpt-5.6-luna
DEVQUEST_AZURE_GPT_56_SOL_MODEL=gpt-5.6-sol

AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING=your-azure-communication-email-connection-string
AZURE_COMMUNICATION_EMAIL_SENDER=DoNotReply@your-verified-domain
AZURE_SERVICE_BUS_CONNECTION_STRING=your-service-bus-connection-string
AZURE_SERVICE_BUS_STAR_QUEUE=github-star-verification
AZURE_SERVICE_BUS_NOTIFICATION_QUEUE=devquest-user-notifications
AZURE_KEY_VAULT_URL=https://your-key-vault.vault.azure.net/
DEVQUEST_OWNER_EMAIL=your-admin-email@example.com
```

Generate strong secrets:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Generate admin password hash:

```powershell
python -c "import hashlib; print(hashlib.sha256(b'YOUR_ADMIN_PEPPER:YOUR_PASSWORD').hexdigest())"
```

Then set:

```env
DEVQUEST_ADMIN_USERNAME=owner
DEVQUEST_ADMIN_PASSWORD_HASH=the_hash_from_above
DEVQUEST_ADMIN_ROLE=admin
```

## 4. GitHub OAuth Setup

Create a GitHub OAuth App.

Homepage URL:

```text
https://devquest.garvitarora.xyz
```

Authorization callback URL:

```text
https://api.devquest.garvitarora.xyz/api/auth/github/callback
```

For local development, use a separate OAuth app or temporarily set:

```text
http://localhost:8000/api/auth/github/callback
```

If GitHub says `redirect_uri is not associated with this application`, the callback URL in GitHub does not exactly match `NEXT_PUBLIC_API_URL + /api/auth/github/callback`.

## 5. Frontend On Vercel

Import the GitHub repo in Vercel.

Use these project settings:

```text
Framework Preset: Next.js
Root Directory: .
Install Command: npm ci
Build Command: npm --workspace apps/web run build
Output Directory: apps/web/.next
Development Command: npm --workspace apps/web run dev
```

Set Vercel environment variables:

```env
NEXT_PUBLIC_APP_URL=https://devquest.garvitarora.xyz
NEXT_PUBLIC_API_URL=https://api.devquest.garvitarora.xyz
NEXT_PUBLIC_DEVQUEST_GATEWAY_URL=https://api.devquest.garvitarora.xyz/v1
```

Add the custom domain in Vercel:

```text
devquest.garvitarora.xyz
```

Then add the DNS record Vercel asks for. Usually this is a CNAME to Vercel, but follow Vercel's exact generated instruction.

## 6. Backend On Azure VM

This is the simplest Azure backend path if you want direct control over the server.

Recommended Azure resources:

- Azure Linux VM: Ubuntu 22.04 LTS or 24.04 LTS.
- Static Public IP.
- Network Security Group allowing ports `22`, `80`, `443`.
- Azure Key Vault for secrets.
- Azure Communication Services Email for user emails.
- Azure Service Bus for verification and notification queues.
- Azure Monitor, Log Analytics, and Application Insights for logs.
- MongoDB Atlas or Azure Cosmos DB for MongoDB vCore for persistence.

Create a resource group:

```powershell
az login
az group create --name devquest-prod-rg --location eastus
```

Create a static public IP:

```powershell
az network public-ip create `
  --resource-group devquest-prod-rg `
  --name devquest-api-ip `
  --sku Standard `
  --allocation-method Static
```

Create the VM:

```powershell
az vm create `
  --resource-group devquest-prod-rg `
  --name devquest-api-vm `
  --image Ubuntu2204 `
  --size Standard_B2s `
  --admin-username azureuser `
  --public-ip-address devquest-api-ip `
  --generate-ssh-keys
```

Open HTTP and HTTPS:

```powershell
az vm open-port --resource-group devquest-prod-rg --name devquest-api-vm --port 80
az vm open-port --resource-group devquest-prod-rg --name devquest-api-vm --port 443
```

Point DNS:

```text
api.devquest.garvitarora.xyz A <STATIC_PUBLIC_IP>
```

SSH into the VM:

```powershell
ssh azureuser@api.devquest.garvitarora.xyz
```

Install Docker:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Clone the repo:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git devquest-ai
cd devquest-ai
```

Create the production `.env` on the VM:

```bash
nano .env
```

Paste production backend variables from `.env.example`. At minimum, the backend needs:

```env
NEXT_PUBLIC_APP_URL=https://devquest.garvitarora.xyz
NEXT_PUBLIC_API_URL=https://api.devquest.garvitarora.xyz
SESSION_SECRET=...
DEVQUEST_API_KEY_PEPPER=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...
MONGODB_URI=...
MONGODB_DATABASE=devquest
DEVQUEST_PROVIDER_BASE_URL=https://star-project-keys-resource.openai.azure.com/
DEVQUEST_PROVIDER_API_KEY=...
DEVQUEST_PUBLIC_MODELS=DeepSeek-V4-Pro,gpt-5.5,gpt-5.6-luna,gpt-5.6-sol
DEVQUEST_DEEPSEEK_V4_PRO_MODEL=DeepSeek-V4-Pro
DEVQUEST_AZURE_GPT_55_MODEL=gpt-5.5
DEVQUEST_AZURE_GPT_56_LUNA_MODEL=gpt-5.6-luna
DEVQUEST_AZURE_GPT_56_SOL_MODEL=gpt-5.6-sol
AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING=...
AZURE_COMMUNICATION_EMAIL_SENDER=...
AZURE_SERVICE_BUS_CONNECTION_STRING=...
AZURE_SERVICE_BUS_STAR_QUEUE=github-star-verification
AZURE_SERVICE_BUS_NOTIFICATION_QUEUE=devquest-user-notifications
DEVQUEST_OWNER_EMAIL=...
```

Build and run API plus worker:

```bash
docker build -f infrastructure/docker/api.Dockerfile -t devquest-api:latest .

docker network create devquest || true

docker run -d \
  --name devquest-api \
  --restart unless-stopped \
  --env-file .env \
  --network devquest \
  -p 8000:8000 \
  devquest-api:latest

docker run -d \
  --name devquest-worker \
  --restart unless-stopped \
  --env-file .env \
  --network devquest \
  devquest-api:latest \
  python -m apps.api.devquest_api.worker
```

Configure Nginx:

```bash
sudo nano /etc/nginx/sites-available/devquest-api
```

Paste:

```nginx
server {
    listen 80;
    server_name api.devquest.garvitarora.xyz;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/devquest-api /etc/nginx/sites-enabled/devquest-api
sudo nginx -t
sudo systemctl reload nginx
```

Add HTTPS:

```bash
sudo certbot --nginx -d api.devquest.garvitarora.xyz
```

Smoke test:

```bash
curl https://api.devquest.garvitarora.xyz/health
```

Expected:

```json
{"status":"ok"}
```

Update backend:

```bash
cd ~/devquest-ai
git pull
docker build -f infrastructure/docker/api.Dockerfile -t devquest-api:latest .
docker rm -f devquest-api devquest-worker
docker run -d --name devquest-api --restart unless-stopped --env-file .env --network devquest -p 8000:8000 devquest-api:latest
docker run -d --name devquest-worker --restart unless-stopped --env-file .env --network devquest devquest-api:latest python -m apps.api.devquest_api.worker
```

## 7. Backend On Azure Container Apps

The repo already includes `infrastructure/azure/main.bicep`, which provisions:

- Log Analytics
- Application Insights
- Key Vault
- Service Bus namespace
- `github-star-verification` queue
- Azure Container Registry
- Azure Communication Services
- Azure Email Service
- Azure Container Apps environment
- API container app
- Worker container app
- Web container app

Since the frontend is going to Vercel, you can ignore or remove the web container app later. Keep API and worker.

Create Azure resources:

```powershell
az group create --name devquest-prod-rg --location eastus
az deployment group create `
  --resource-group devquest-prod-rg `
  --template-file infrastructure/azure/main.bicep `
  --parameters appName=devquest-ai
```

Build and push API image to Azure Container Registry:

```powershell
$ACR_NAME="devquestaicr"
az acr login --name $ACR_NAME
docker build -f infrastructure/docker/api.Dockerfile -t "$ACR_NAME.azurecr.io/devquest-api:latest" .
docker push "$ACR_NAME.azurecr.io/devquest-api:latest"
```

Set Container App secrets and env vars using Azure Portal or CLI. Required values are the same backend env vars listed above.

Use Azure Container Apps custom domain:

```text
api.devquest.garvitarora.xyz
```

For a small team, Azure VM is easier to understand. For production scaling, Azure Container Apps is cleaner because API and worker can be scaled independently.

## 8. MongoDB Persistence

Recommended first choice:

- MongoDB Atlas dedicated/shared cluster.

Azure-native choice:

- Azure Cosmos DB for MongoDB vCore.

Set:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/devquest?retryWrites=true&w=majority
MONGODB_DATABASE=devquest
```

DevQuest stores:

- Users and GitHub tokens.
- API key hashes only, never raw keys.
- Credit ledger records.
- Usage logs.
- Referral clicks and conversions.
- Repository star entitlements.
- Pull request and issue bounty rewards.
- Sponsor submissions.
- Workflows, workflow executions, and workflow credential hashes.
- Notifications and admin records.

## 9. Azure Email Notifications

The backend already sends user notifications through Azure when configured.

Code path:

```text
apps/api/devquest_api/deps.py
apps/api/devquest_api/azure_services.py
```

Every `add_notification(...)` call stores the notification in MongoDB and then calls Azure delivery.

Set:

```env
AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING=...
AZURE_COMMUNICATION_EMAIL_SENDER=DoNotReply@your-verified-domain
DEVQUEST_OWNER_EMAIL=your-admin-email@example.com
AZURE_SERVICE_BUS_CONNECTION_STRING=...
AZURE_SERVICE_BUS_NOTIFICATION_QUEUE=devquest-user-notifications
```

User emails are sent to the email GitHub returns during login. Make sure the GitHub OAuth scope includes:

```text
read:user user:email public_repo
```

The code already requests this scope.

Azure Communication Email setup:

1. Create an Azure Communication Services resource.
2. Create an Email Communication Services resource.
3. Connect or verify a sender domain.
4. Create a sender address, for example `DoNotReply@devquest.space`.
5. Copy the connection string into `AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING`.
6. Put the sender address into `AZURE_COMMUNICATION_EMAIL_SENDER`.

Notifications currently sent by the app include:

- API key created.
- Repository star verified or removed.
- Credits earned or spent.
- Referral reward unlocked.
- Marketplace purchase complete.
- Workflow created or executed.
- Sponsor submission emails to the owner.

## 10. Azure Services Worth Using

Use these Azure services for DevQuest AI:

- Azure Virtual Machines: straightforward FastAPI deployment with Docker and Nginx.
- Azure Container Apps: better production API and worker scaling.
- Azure Container Registry: store Docker images.
- Azure Communication Services Email: send user and sponsor notifications.
- Azure Service Bus: queue star verification, notification delivery, webhook work, and future workflow jobs.
- Azure Key Vault: store GitHub OAuth secret, provider API keys, peppers, email connection strings, and webhook secrets.
- Azure Monitor: central metrics and alerts.
- Log Analytics: searchable backend logs.
- Application Insights: request tracing, failures, latency, dependency calls.
- Azure OpenAI or Azure AI Foundry: host the model deployments behind DevQuest `/v1/responses`.
- Azure Cosmos DB for MongoDB vCore: Azure-native MongoDB-compatible persistence if you do not want Atlas.
- Azure Storage Account: store uploaded CSV files, workflow payload artifacts, exports, receipts, and future datasets.
- Azure CDN or Front Door: optional edge caching, WAF, TLS, and routing in front of API if traffic grows.
- Azure Functions: lightweight scheduled jobs for cleanup, email retries, leaderboard recalculation, or webhook retries.
- Azure App Configuration: centralized non-secret feature flags for boosts, campaigns, and model availability.

## 11. Production DNS

Frontend on Vercel:

```text
devquest.garvitarora.xyz -> Vercel
```

Backend on Azure VM:

```text
api.devquest.garvitarora.xyz -> Azure VM static public IP
```

Backend on Azure Container Apps:

```text
api.devquest.garvitarora.xyz -> Azure Container Apps custom domain target
```

After DNS is live, update:

```env
NEXT_PUBLIC_APP_URL=https://devquest.garvitarora.xyz
NEXT_PUBLIC_API_URL=https://api.devquest.garvitarora.xyz
NEXT_PUBLIC_DEVQUEST_GATEWAY_URL=https://api.devquest.garvitarora.xyz/v1
```

## 12. Final Production Smoke Tests

Check API:

```powershell
curl https://api.devquest.garvitarora.xyz/health
```

Check OAuth login:

```text
https://devquest.garvitarora.xyz/signin
```

Check gateway route:

```powershell
curl https://api.devquest.garvitarora.xyz/v1/models
```

Check Vercel frontend can reach backend:

```text
Open dashboard pages and confirm requests go to https://api.devquest.garvitarora.xyz
```

Check Azure email:

1. Log in with GitHub.
2. Create an API key.
3. Confirm notification appears in `/app/notifications`.
4. Confirm email arrives at the GitHub account email if GitHub provided one.

## 13. Production Security Checklist

- Keep `.env` out of git.
- Rotate `SESSION_SECRET`, `DEVQUEST_API_KEY_PEPPER`, and admin pepper before launch.
- Use HTTPS for both frontend and API.
- Set GitHub OAuth callback to the production API URL.
- Use static public IP for VM backend.
- Restrict VM SSH by IP if possible.
- Use Azure Key Vault for long-lived secrets.
- Store only API key hashes, never raw keys.
- Use MongoDB network access rules.
- Enable Azure Monitor alerts for API 5xx, high latency, and VM CPU/memory.
- Back up MongoDB.
- Test credit deduction and repository star revocation before launch.

## 14. Should Frontend And Backend Be Separate?

Yes.

Keep frontend and backend separate in production:

- Vercel is excellent for the Next.js frontend, previews, and static assets.
- Azure is better for backend API, workers, model gateway calls, queues, email, secrets, and logs.
- Separate domains make OAuth, cookies, API routing, scaling, and debugging clearer.

The only rule is to keep env URLs consistent:

```env
NEXT_PUBLIC_APP_URL=https://devquest.garvitarora.xyz
NEXT_PUBLIC_API_URL=https://api.devquest.garvitarora.xyz
```

That gives DevQuest a clean production shape:

```text
User browser
  -> Vercel frontend
  -> Azure backend API
  -> MongoDB + Azure OpenAI + Azure Service Bus + Azure Email
```

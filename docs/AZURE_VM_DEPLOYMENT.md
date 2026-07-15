# Azure VM deployment guide

Recommended production domain layout:

```text
https://devquest.garvitarora.xyz       Frontend dashboard and landing page
https://api.devquest.garvitarora.xyz   Backend API and /v1 gateway
```

This is cleaner than putting everything on one hostname because Codex should point directly at the API base URL:

```toml
base_url = "https://devquest.garvitarora.xyz/v1"
```

You can still deploy both containers on one Azure VM at first. Split into separate VMs later when traffic grows.

## Should frontend and backend be separate?

For production, deploy them as separate processes or containers:

```text
web container     Next.js standalone server, internal port 3000
api container     FastAPI / Uvicorn server, internal port 8000
worker container  Background verification worker
MongoDB           Prefer MongoDB Atlas instead of running Mongo on the VM
Nginx/Caddy       Public reverse proxy with TLS
```

One VM is fine for launch if the VM has enough RAM and CPU. Separate frontend/backend VMs are useful when you need independent scaling, stricter isolation, or zero-downtime deploys.

## Static IP

Azure's equivalent of an Elastic IP is a **Static Public IP address**.

Use one if you point DNS directly at the VM:

```text
devquest.garvitarora.xyz      A record -> Azure static public IP
api.devquest.garvitarora.xyz  A record -> same Azure static public IP
```

If you later use Azure Application Gateway, Azure Front Door, or a load balancer, DNS should point at that public endpoint instead of the VM.

## VM baseline

Recommended starting VM:

```text
Ubuntu 22.04 LTS
Standard B2s or B2ms for testing
Standard D2s_v5 or better for production
30GB+ OS disk
Static Standard Public IP
NSG inbound: 22, 80, 443
```

Keep MongoDB in Atlas if possible. Do not expose MongoDB from the VM to the public internet.

## DNS

Create these records at your DNS provider:

```text
Type  Name       Value
A     devquest   <AZURE_STATIC_PUBLIC_IP>
A     api.devquest <AZURE_STATIC_PUBLIC_IP>
```

Some DNS panels want the full names:

```text
devquest.garvitarora.xyz
api.devquest.garvitarora.xyz
```

## Environment values

On production, set:

```env
NEXT_PUBLIC_APP_URL=https://devquest.garvitarora.xyz
NEXT_PUBLIC_API_URL=https://api.devquest.garvitarora.xyz
NEXT_PUBLIC_DEVQUEST_GATEWAY_URL=https://api.devquest.garvitarora.xyz/v1

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
MONGODB_URI=...
MONGODB_DATABASE=devquest

DEVQUEST_PROVIDER_BASE_URL=https://your-resource.openai.azure.com/openai/v1
DEVQUEST_PROVIDER_API_KEY=...
DEVQUEST_PROVIDER_API_VERSION=...

DEVQUEST_PUBLIC_MODELS=devquest-gpt-56-sol,devquest-gpt-55,devquest-deepseek-research
DEVQUEST_GPT_56_SOL_MODEL=your-codex-capable-azure-deployment

# Repository campaigns are stored in MongoDB. Seed/update them after deploy:
# python -m apps.api.devquest_api.seed_repository_campaign --owner your-org --name your-repo --url https://github.com/your-org/your-repo --reward-credits 200 --status active
DEVQUEST_APPROVED_REPOS=
DEVQUEST_PR_REPOS=[{"owner":"your-org","name":"your-repo","reward_credits":150,"status":"active"}]
```

GitHub OAuth callback URLs:

```text
Local:      http://localhost:8000/api/auth/github/callback
Production: https://api.devquest.garvitarora.xyz/api/auth/github/callback
```

## Install server dependencies

On the VM:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Install Docker Compose plugin if it is not already available:

```bash
docker compose version
```

## Deploy with Docker Compose

Clone the repo:

```bash
git clone <your-repo-url> /opt/devquest
cd /opt/devquest
```

Create `.env`:

```bash
cp .env.example .env
nano .env
```

Build and start:

```bash
docker compose build
docker compose up -d api worker web
```

Check logs:

```bash
docker compose logs -f api
docker compose logs -f web
```

Health checks:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/v1/models
curl http://localhost:3000
```

## Nginx reverse proxy

Create:

```bash
sudo nano /etc/nginx/sites-available/devquest
```

Use:

```nginx
server {
    listen 80;
    server_name devquest.garvitarora.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

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
        proxy_buffering off;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/devquest /etc/nginx/sites-enabled/devquest
sudo nginx -t
sudo systemctl reload nginx
```

## TLS

Use Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d devquest.garvitarora.xyz -d api.devquest.garvitarora.xyz
```

After TLS, test:

```bash
curl https://api.devquest.garvitarora.xyz/v1/models
curl https://devquest.garvitarora.xyz
```

## Codex config

Use this only after the API domain is live over HTTPS:

```toml
model = "devquest-gpt-56-sol"
model_provider = "devquest"
model_reasoning_effort = "medium"

[model_providers.devquest]
name = "DevQuest"
base_url = "https://devquest.garvitarora.xyz/v1"
env_key = "DEVQUEST_API_KEY"
wire_api = "responses"
```

Windows PowerShell:

```powershell
setx DEVQUEST_API_KEY "dq_live_xxxxxxxxx"
```

Restart VS Code, Cursor, Windsurf, or the Codex CLI terminal after `setx`.

## Reality check for Codex

Codex supports custom model providers that expose Chat Completions or Responses APIs. DevQuest exposes `/v1/responses`, `/v1/models`, and authentication through `Authorization: Bearer <key>`.

What should work after deployment:

- Basic Codex questions
- Repository inspection prompts
- Text streaming
- Local file edits and command approval remain handled by Codex locally
- Non-streaming function-call outputs from the gateway shape

What still needs production validation:

- Streaming tool-call deltas with your exact Codex client version
- Long-running agent sessions under real latency
- Any proprietary Codex Cloud behavior

Do not promise Codex Cloud tasks, ChatGPT plan usage, OpenAI-hosted remote agents, or cloud delegation through DevQuest keys.

## Updating production

```bash
cd /opt/devquest
git pull
docker compose build api worker web
docker compose up -d api worker web
docker compose logs -f api
```

## When to split VMs

Stay on one VM while validating product-market fit. Split later:

```text
VM 1: web only
VM 2: api + worker
MongoDB Atlas: managed database
Azure Front Door or Application Gateway: TLS and routing
```

If you split, give the API VM its own static private networking path or put both VMs behind a load balancer/application gateway. Keep only 80/443 public.

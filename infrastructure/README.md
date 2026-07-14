# Infrastructure

Keep this folder. It is used for production deployment and local container builds.

## `docker/`

Dockerfiles for the deployable services:

- `api.Dockerfile`: builds the FastAPI backend and worker image.
- `web.Dockerfile`: builds the standalone Next.js frontend image if you choose Azure/container hosting instead of Vercel.

Current recommended production split:

- Use Vercel for `apps/web`.
- Use `infrastructure/docker/api.Dockerfile` for the Azure backend image.
- Use the same API image for the worker with command `python -m apps.api.devquest_api.worker`.

## `azure/`

Bicep templates for Azure-managed infrastructure:

- Log Analytics
- Application Insights
- Key Vault
- Service Bus
- Azure Container Registry
- Azure Communication Services Email
- Container Apps environment
- API and worker Container Apps

Use this when you want Azure Container Apps. If you deploy the backend on a plain Azure VM, keep the folder as an upgrade path and reference only `infrastructure/docker/api.Dockerfile`.

Do not put secrets in this folder. Use Azure Key Vault, Azure Container App secrets, VM `.env`, or Vercel environment variables.

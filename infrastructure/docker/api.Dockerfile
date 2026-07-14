FROM python:3.11-slim

WORKDIR /app
COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip install --no-cache-dir -r /app/apps/api/requirements.txt
COPY apps/api /app/apps/api
CMD ["python", "-m", "uvicorn", "apps.api.devquest_api.main:app", "--host", "0.0.0.0", "--port", "8000"]

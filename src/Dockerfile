FROM python:3.12-slim

# libgomp1 is required by LightGBM
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Seed data + train models at build time so the image is demo-ready
RUN python -m scripts.seed

EXPOSE 8000
# Serves IPv4 and IPv6 on one socket — see backend/serve.py for why that is
# not the same as `uvicorn --host 0.0.0.0`.
CMD ["python", "-m", "backend.serve", "--port", "8000"]

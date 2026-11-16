FROM node:24.18.0-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend \
    ANALYSIS_DB_PATH=/var/lib/earth-detective/analyses.sqlite3 PORT=8000
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && useradd --create-home --uid 10001 earth \
    && mkdir -p /var/lib/earth-detective \
    && chown earth:earth /var/lib/earth-detective
COPY backend/ /app/backend/
COPY data/ /app/data/
COPY serve.py /app/serve.py
COPY --from=frontend /build/frontend/dist /app/frontend/dist
USER earth
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/health',timeout=4)"
CMD ["sh", "-c", "exec uvicorn serve:app --host 0.0.0.0 --port \"$PORT\" --workers 1 --no-server-header"]

FROM python:3.10-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 COMPASSO_BACKEND=cloud-run
WORKDIR /app
COPY server/requirements.txt server/cloud-requirements.txt ./server/
RUN pip install --no-cache-dir -r server/requirements.txt -r server/cloud-requirements.txt
COPY server ./server
RUN useradd -m -u 10001 compasso && chmod -R a+rX /app/server
USER 10001:10001
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn server.api:create_app --factory --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]

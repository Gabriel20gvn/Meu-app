FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.single.config.js ./
COPY src ./src
RUN npm run build:standalone

FROM denoland/deno:bin-2.5.6 AS deno
FROM python:3.10-slim-bookworm AS processor
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 CUDA_VISIBLE_DEVICES=-1 \
    OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 TF_NUM_INTRAOP_THREADS=2 TF_NUM_INTEROP_THREADS=2 \
    COMPASSO_DATA_DIR=/data COMPASSO_STATIC_DIR=/app/dist-single
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential ffmpeg ca-certificates gosu && rm -rf /var/lib/apt/lists/*
COPY --from=deno /deno /usr/local/bin/deno
COPY server/constraints.txt server/requirements.txt /app/server/
RUN pip install --no-cache-dir -c server/constraints.txt numpy scipy Cython setuptools wheel tensorflow librosa numba matplotlib pandas scikit-learn
RUN pip install --no-cache-dir --no-build-isolation -c server/constraints.txt madmom==0.16.1 mir_eval jellyfish pyunpack ffmpeg-python pretty_midi argparse beautifulsoup4 mido 'yt-dlp[default]' -r server/requirements.txt
RUN pip install --no-cache-dir --no-deps --no-build-isolation \
    git+https://github.com/MZehren/ADTOF@b3968fb332f69b65ee07c089fc62f436503755db \
    'git+https://github.com/MZehren/tapcorrect@4f2d21e73fb0137119a4136513c42936b322fc0b#subdirectory=python'
COPY server ./server
COPY colab/auto_rhythm.py ./colab/auto_rhythm.py
COPY --from=web /app/dist-single ./dist-single
RUN useradd -m -u 10001 compasso && mkdir -p /data && chown compasso /data \
    && chmod -R a+rX /app/server /app/colab /app/dist-single
EXPOSE 8000
COPY --chmod=755 server/entrypoint.sh /app/server/entrypoint.sh
CMD ["/app/server/entrypoint.sh"]

# Optional Google Cloud worker. The default target below keeps local/Render behavior.
FROM processor AS cloud-worker
RUN pip install --no-cache-dir -c server/constraints.txt -r server/cloud-requirements.txt
USER 10001:10001
CMD ["python", "-m", "server.cloud_worker"]

FROM processor AS default

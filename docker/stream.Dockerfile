FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ffmpeg xvfb ca-certificates fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/start-stream.sh ./scripts/start-stream.sh
RUN chmod +x ./scripts/start-stream.sh
CMD ["./scripts/start-stream.sh"]

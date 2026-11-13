FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY engine ./engine
COPY public ./public
COPY index.html tsconfig.json ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY engine ./engine
COPY scripts/lunar_terrain.py scripts/remote_dem.py scripts/surface_imagery.py ./scripts/
COPY public/data ./public/data
COPY data/sites.json data/terrain-regional.json ./data/
ENV NODE_ENV=production HOST=0.0.0.0 LUNAR_TERRAIN_MODE=remote LUNAR_TERRAIN_PYTHON=/opt/venv/bin/python PYTHONUNBUFFERED=1
RUN mkdir -p .cache && chown -R node:node /app/.cache
USER node
EXPOSE 10000
CMD ["node", "server/index.mjs", "--production"]

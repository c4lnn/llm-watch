# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS build
WORKDIR /app

# react-scripts + react live in the ROOT package.json (client has no deps of its own),
# so install root deps first, then build the client into /app/client/build.
COPY package*.json ./
RUN npm ci
COPY client/ ./client/
ENV CI=false
RUN npm run build

# ---------- Stage 2: runtime (API server + static frontend) ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# tzdata so TZ=Asia/Shanghai resolves (timestamps use zh-CN locale time)
RUN apk add --no-cache tzdata

# Only production dependencies for the server (axios/cors/express/node-cron/sql.js)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App code + the built frontend from stage 1
COPY server/ ./server/
COPY --from=build /app/client/build ./client/build

# SQLite file and config file live here; mounted as volumes in compose
RUN mkdir -p data

# Copy example config if no config.yaml exists
COPY config.example.yaml ./config.example.yaml

EXPOSE 8888
CMD ["node", "server/index.js"]

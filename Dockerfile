# ── Stage 1: Install deps ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: Test ─────────────────────────────────────────────────────────────
FROM deps AS test

COPY . .
CMD ["npm", "run", "test:run"]

# ── Stage 3: Build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .
RUN npm run build

# ── Stage 4: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

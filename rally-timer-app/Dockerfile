FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG PUBLIC_BUILD_SHA=dev
ENV PUBLIC_BUILD_SHA=$PUBLIC_BUILD_SHA
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ARG PUBLIC_BUILD_SHA=dev
ENV PUBLIC_BUILD_SHA=$PUBLIC_BUILD_SHA
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/build ./build
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
	CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "build/index.js"]

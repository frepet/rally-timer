FROM node:24-alpine AS builder
WORKDIR /app
ARG BUILD_SHA=dev
ENV PUBLIC_BUILD_SHA=$BUILD_SHA
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/build ./build
EXPOSE 3000
CMD ["node", "build/index.js"]

# Stage 1: build the React frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/index.html web/vite.config.ts web/tsconfig.json web/tailwind.config.js web/postcss.config.js ./
COPY web/public ./public
COPY web/src ./src
RUN npx vite build

# Stage 2: build the Go API server (dependencies are vendored, so no network is needed for them)
FROM golang:1.23-alpine AS api
WORKDIR /src
COPY server/ ./
RUN CGO_ENABLED=0 go build -mod=vendor -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Stage 3: tiny runtime image: the server binary, CA certificates (for web push) and the built frontend
FROM scratch
COPY --from=api /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=api /out/server /server
COPY --from=web /web/dist /app/public
ENV STATIC_DIR=/app/public PORT=8080
EXPOSE 8080
ENTRYPOINT ["/server"]

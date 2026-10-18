# Stage 1: build the React frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/index.html web/vite.config.ts web/tsconfig.json web/tailwind.config.js web/postcss.config.js ./
COPY web/public ./public
COPY web/src ./src
# the server that builds this is small (1.6 GB of memory): node may not take more than this, or the machine starts swapping and the web service stops answering
ENV NODE_OPTIONS=--max-old-space-size=900
RUN npx vite build

# Stage 2: build the Go API server (dependencies are vendored, so no network is needed for them)
FROM golang:1.23-alpine AS api
WORKDIR /src
# this stage starts only when the frontend is built (the two builds never run side by side: together they need more memory than the server has)
COPY --from=web /web/dist/index.html /tmp/frontend-built
COPY server/ ./
RUN CGO_ENABLED=0 go build -p 1 -mod=vendor -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Stage 3: tiny runtime image: the server binary, CA certificates (for web push) and the built frontend
FROM scratch
COPY --from=api /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=api /out/server /server
COPY --from=web /web/dist /app/public
COPY VERSION /app/VERSION
# the program on the accounting computer (tools/sepidar) updates itself from these files, so it follows Git together with the app
COPY tools/sepidar/sepidar-sync.mjs tools/sepidar/sepidar-client.mjs tools/sepidar/console-fa.mjs tools/sepidar/config-help.mjs tools/sepidar/ui.mjs tools/sepidar/updater.mjs tools/sepidar/Vazirmatn-Regular.woff2 tools/sepidar/Vazirmatn-Bold.woff2 /app/sepidar-tool/
ENV STATIC_DIR=/app/public SEPIDAR_TOOL_DIR=/app/sepidar-tool PORT=8080
EXPOSE 8080
ENTRYPOINT ["/server"]

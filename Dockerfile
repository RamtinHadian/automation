## ---- Build stage ----
FROM golang:1.27-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/api

## ---- Runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata curl
WORKDIR /app

COPY --from=build /out/server ./server
COPY web ./web

RUN mkdir -p /app/uploads
EXPOSE 8090

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
    CMD curl -fs "http://localhost:${PORT:-8090}/health" || exit 1

ENTRYPOINT ["./server"]

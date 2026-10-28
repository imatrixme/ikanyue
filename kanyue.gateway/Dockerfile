FROM node:22-alpine AS console

WORKDIR /console
COPY console/package.json console/package-lock.json ./
RUN npm ci
COPY console/ .
RUN npx tsc -b && npx vite build --outDir /out/site

FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=console /out/site ./internal/console/site
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kanyue-gateway .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/kanyue-gateway /usr/local/bin/kanyue-gateway

# 1460 is the data plane (GATEWAY_LISTEN), 1461 the admin plane and console; publish 1461 on loopback only.
EXPOSE 1460 1461
CMD ["kanyue-gateway", "serve", "--http=127.0.0.1:1461", "--dir=/pb_data", "--encryptionEnv=GATEWAY_ENCRYPTION_KEY"]

FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kanyue-pay .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/kanyue-pay /usr/local/bin/kanyue-pay

ENV NODE_ENV=production
EXPOSE 1340
# Schema changes never run here: release with `kanyue-pay migrate up --dir=/pb_data` after a backup.
CMD ["kanyue-pay", "serve", "--http=0.0.0.0:1340", "--dir=/pb_data"]

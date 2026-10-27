FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kanyue-server .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/kanyue-server /usr/local/bin/kanyue-server

EXPOSE 8090
# Schema changes never run here: release with `kanyue-server migrate up --dir=/pb_data` after a backup.
CMD ["kanyue-server", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]

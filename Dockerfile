# 多阶段构建：编译 Go 服务，最终镜像仅含静态二进制。
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/keyboard .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/keyboard .
EXPOSE 9212
ENTRYPOINT ["./keyboard"]

# 多阶段构建：编译 Go 服务，最终镜像仅含静态二进制。
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
# 阿里云 gomod 镜像，国内构建更稳。
ENV GOPROXY="https://mirrors.aliyun.com/goproxy/,direct"
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/keyboard .

FROM alpine:3.20
# 阿里云 apk 镜像。
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
WORKDIR /app
# 运行环境需要完整的 ca 证书链与时区数据。
RUN apk --no-cache add ca-certificates tzdata
COPY --from=build /out/keyboard .
EXPOSE 9212
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:9212/api/v1/health || exit 1
ENTRYPOINT ["./keyboard"]

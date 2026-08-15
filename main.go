package main

import (
	"embed"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bunnier/keyboard/api"
	"github.com/bunnier/keyboard/api/api_base"
	"github.com/bunnier/keyboard/internal/config"
	"github.com/bunnier/keyboard/resx"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

//go:embed api/static
var staticFS embed.FS

// staticSubFS 是剥离了 "api/static" 前缀后的静态资源文件系统，供生产环境使用。
var staticSubFS fs.FS

func main() {
	if _, err := config.Load("conf.toml"); err != nil {
		fmt.Printf("加载配置失败: %v\n", err)
		os.Exit(1)
	}

	// 初始化 SQLite（建表 + 连接），必须在路由注册前完成。
	resx.InitDb()

	// 注册 PWA manifest 的 MIME 类型（Go 标准库不认识 .webmanifest，否则会被当成 text/plain 导致浏览器拒绝安装）。
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")

	sub, err := fs.Sub(staticFS, "api/static")
	if err != nil {
		fmt.Printf("初始化静态资源失败: %v\n", err)
		os.Exit(1)
	}
	staticSubFS = sub

	r := newRouter()
	server := newHTTPServer(r)

	fmt.Printf("Server starting on port %d...\n", config.Conf.ApiPort)
	if err := server.ListenAndServe(); err != nil {
		fmt.Printf("Server error: %v\n", err)
		os.Exit(1)
	}
}

func newHTTPServer(handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              fmt.Sprintf(":%d", config.Conf.ApiPort),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

func newRouter() chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(api_base.ErrorHandler)

	r.Get("/api/v1/health", healthHandler)

	// 业务 API 路由组。后续可在分组内追加鉴权中间件。
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/lessons", api_base.Bind(api.TypingApi.GetLessons))
		r.Get("/progress", api_base.Bind(api.TypingApi.GetProgress))
		r.Post("/progress", api_base.Bind(api.TypingApi.SaveProgress))
	})

	// 静态文件服务：开发环境可经 StaticDir 热更新，生产环境使用内置 embed 资源。
	staticFileSystem := resolveStaticFS()
	filesDir := NeuteredFileSystem{staticFileSystem}
	r.Get("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	})
	FileServer(r, "/", filesDir)

	return r
}

// resolveStaticFS 决定使用哪个静态文件系统。
// DevMode 下若未显式配置 StaticDir 则自动回退到 api/static 目录（便于热更新）；
// 否则（或目录不存在时）使用编译内置的 embed 资源。
func resolveStaticFS() http.FileSystem {
	dir := config.Conf.StaticDir
	if dir == "" && config.Conf.DevMode {
		dir = "api/static"
	}
	if dir != "" {
		if _, err := os.Stat(dir); err == nil {
			return http.Dir(dir)
		}
	}
	return http.FS(staticSubFS)
}

// healthHandler 健康检查端点。
func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// NeuteredFileSystem 包装 http.FileSystem，防止目录列表展示。
type NeuteredFileSystem struct {
	fs http.FileSystem
}

func (nfs NeuteredFileSystem) Open(path string) (http.File, error) {
	f, err := nfs.fs.Open(path)
	if err != nil {
		return nil, err
	}

	s, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	if s.IsDir() {
		index := filepath.Join(path, "index.html")
		indexFile, err := nfs.fs.Open(index)
		if err != nil {
			_ = f.Close()
			return nil, err
		}
		if err := indexFile.Close(); err != nil {
			_ = f.Close()
			return nil, err
		}
	}

	return f, nil
}

// FileServer 方便地设置 http.FileServer 以提供静态文件服务。
func FileServer(r chi.Router, path string, root http.FileSystem) {
	if strings.ContainsAny(path, "{}*") {
		panic("FileServer does not permit any URL parameters.")
	}

	if path != "/" && path[len(path)-1] != '/' {
		r.Get(path, http.RedirectHandler(path+"/", http.StatusMovedPermanently).ServeHTTP)
		path += "/"
	}
	path += "*"

	r.Get(path, func(w http.ResponseWriter, r *http.Request) {
		setStaticCacheHeaders(w, r.URL.Path)
		rctx := chi.RouteContext(r.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		fs := http.StripPrefix(pathPrefix, http.FileServer(root))
		fs.ServeHTTP(w, r)
	})
}

func setStaticCacheHeaders(w http.ResponseWriter, requestPath string) {
	ext := strings.ToLower(filepath.Ext(requestPath))
	switch ext {
	case ".html", "":
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
	case ".css", ".js":
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
	default:
		w.Header().Set("Cache-Control", "public, max-age=86400")
	}
}

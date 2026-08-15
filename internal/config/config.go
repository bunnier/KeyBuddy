// Package config 负责加载服务的运行时配置（对应 conf.toml）。
package config

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
)

// Config 保存服务的运行时配置，字段与 conf.toml 的 TOML key 一一对应。
type Config struct {
	// DevMode 是否为开发/测试环境，用于启用调试相关行为。
	DevMode bool `toml:"DevMode"`
	// ApiPort Web 服务监听的端口。
	ApiPort int `toml:"ApiPort"`
	// StaticDir 可选：覆盖内置静态资源目录，本地开发时指向 api/static 实现热更新。
	StaticDir string `toml:"StaticDir"`
	// BaseURL 站点基础路径（可选），用于生成资源链接，默认空字符串。
	BaseURL string `toml:"BaseURL"`
	// SqlitePath SQLite 数据库文件路径（相对或绝对）。留空默认 "keyboard.db"。
	// 进度等数据持久化到该文件，部署时可挂载卷保证数据不丢。
	SqlitePath string `toml:"SqlitePath"`
}

// Conf 是全局配置实例，由 Load 初始化后供其他包读取。
var Conf *Config

// Load 从 path 读取 TOML 配置文件。
// 若文件不存在，则回退到 defaultConfig，保证服务在零配置下也能启动。
func Load(path string) (*Config, error) {
	cfg := defaultConfig()
	if path == "" {
		path = "conf.toml"
	}
	if _, err := os.Stat(path); err == nil {
		if _, err := toml.DecodeFile(path, cfg); err != nil {
			return nil, fmt.Errorf("解析配置文件 %s 失败: %w", path, err)
		}
	}
	Conf = cfg
	return cfg, nil
}

// defaultConfig 返回零配置下可用的默认值。
func defaultConfig() *Config {
	return &Config{
		DevMode:    true,
		ApiPort:    8080,
		SqlitePath: "keyboard.db",
	}
}

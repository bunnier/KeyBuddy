// Package resx 负责数据库资源的初始化与共用访问入口（参考 xpoint 的 resx 约定）。
// 这里使用 SQLite（sqlmer 自带的 sqlite 驱动，底层为 modernc.org/sqlite，纯 Go 无 CGO 依赖），
// 满足"先用 SQLite、不碰 MySQL"的诉求；后续若需切换，只需改 InitDb 的驱动即可。
package resx

import (
	"fmt"

	"github.com/bunnier/keyboard/internal/config"
	"github.com/bunnier/sqlmer"
	"github.com/bunnier/sqlmer/sqlite"
)

// Db 数据库客户端实例（扩展版，提供 Must* API 与轻量 ORM）。
var Db *sqlmer.DbClientEx

// InitDb 初始化 SQLite 数据库连接并建表。在 main 中 config.Load 之后调用。
func InitDb() {
	path := config.Conf.SqlitePath
	if path == "" {
		path = "keyboard.db"
	}

	// modernc.org/sqlite 的 DSN：file: 前缀 + 查询参数形式的 pragma。
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)", path)

	dbClient, err := sqlite.NewSqliteDbClient(dsn)
	if err != nil {
		panic(fmt.Errorf("初始化 SQLite 失败: %w", err))
	}

	Db = sqlmer.Extend(dbClient)
	createSchema()
}

// createSchema 建表。SQLite 的 CREATE TABLE IF NOT EXISTS 可安全重复执行。
func createSchema() {
	Db.MustExecute(`
		CREATE TABLE IF NOT EXISTS progress (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			lesson_id  TEXT    NOT NULL,
			wpm        REAL    NOT NULL,
			accuracy   REAL    NOT NULL,
			duration   INTEGER NOT NULL,
			errors     INTEGER NOT NULL DEFAULT 0,
			created_at TEXT    NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_progress_lesson ON progress(lesson_id, id DESC);
	`)
	migrateProfileColumn()
}

// migrateProfileColumn 把 progress 表升级到带身份(profile_id)的版本。
// 旧表没有 profile_id 列时，ALTER 补一列（默认空串）。
// 不再把历史空身份记录认领为 legacy，老数据直接废弃。
func migrateProfileColumn() {
	type colInfo struct {
		Name string `conv:"name"`
	}
	cols := Db.MustListOf(new(colInfo), `PRAGMA table_info(progress)`).([]*colInfo)
	hasProfile := false
	for _, c := range cols {
		if c.Name == "profile_id" {
			hasProfile = true
			break
		}
	}
	if !hasProfile {
		Db.MustExecute(`ALTER TABLE progress ADD COLUMN profile_id TEXT NOT NULL DEFAULT ''`)
	}
}

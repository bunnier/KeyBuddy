# KeyBuddy · 儿童键盘打字练习

一个给小朋友熟悉键盘、练习打字的网页应用。面向 **iPad 平板（主场景）** 和 **桌面电脑（每周一次）** 两个场景设计：

- **平板**：没有物理键盘，孩子直接点屏幕上的「虚拟键盘」输入，用来认识键位、建立键盘空间感。
- **桌面**：敲真实键盘，逐字练习打字速度与正确率；功能键（Esc / F1–F12 / Ctrl 组合）专项认知也在这里完成。

纯前端实现（HTML/CSS/JS，**无构建步骤**），Go 服务端只负责输出静态页面和成绩接口，方便儿童设备直接打开。已支持 **PWA**，iPad 上「添加到主屏幕」即可全屏像 App 一样使用。

## 功能特性

- **关卡化练习**：共 8 个关卡（5 个打字 + 3 个功能键）
  - 打字类（kind=`type`）：回家键行、字母、数字、单词、句子
  - 功能键类（kind=`keys`）：常用功能键、F1–F12、Ctrl 组合键（Ctrl+C/V/Z/A/S）
- **核心打字引擎**：逐字符高亮（当前黄 / 正确绿 / 错误红）、实时统计 **速度(WPM) / 正确率 / 进度**。
- **可视化虚拟键盘**：桌面端敲真键时同步高亮；平板端直接点按输入——一套 UI 同时适配两个场景。功能键关卡的虚拟键盘会**高亮「下一个要按的键」**。
- **成绩持久化**：用 **SQLite**（经框架 `sqlmer` 驱动，纯 Go、无 CGO）保存每次练习成绩，可查历史明细与最佳成绩。
- **PWA**：`manifest.webmanifest` + `service worker`（网络优先、离线回退）+ 应用图标，支持离线使用。
- **抗中文输入法**：打字匹配优先按物理键位 `event.code`，避免中文输入法把 `;`、`'` 等符号键改写成全角导致按不对。

## 技术栈

- **后端**：Go（`net/http` + `go-chi` 路由）
- **数据库**：SQLite（通过 `sqlmer` 的 `sqlite` 驱动，底层 `modernc.org/sqlite`）
- **前端**：原生 HTML / CSS / JS，无打包构建
- **配置**：TOML
- **部署**：自带 `Dockerfile` 与 `deploy/nginx` 反代配置（参考 xpoint 项目的部署约定）

## 项目结构

```
keyboard/
├── main.go                 # 入口：加载配置、注册路由、serve 静态资源、初始化 DB
├── go.mod / go.sum
├── internal/config/        # 配置加载（conf.toml）
├── resx/                   # 数据层：sqlmer 连接 + 建表（对齐 xpoint 的 resx 约定）
│   └── db.go
├── api/
│   ├── api_base/           # 公共组件：响应封装、Bind 反射绑定、错误恢复中间件
│   ├── typing.go           # 打字相关接口实现
│   └── static/             # 前端静态资源（DevMode 从磁盘读，生产编译进二进制）
│       ├── index.html
│       ├── manifest.webmanifest / sw.js
│       └── assets/{css,js,icons}
├── deploy/nginx/conf.d/    # Nginx 反代配置
├── conf.example.toml       # 配置样例
├── Dockerfile
└── README.md
```

> 目录组织参考作者已有的 `coding/xpoint` 项目：`main.go` 在根、`api/` 按业务拆分 handler、`api/api_base/` 放公共组件、静态资源由 Go 直接 serve。

## 配置

复制 `conf.example.toml` 为 `conf.toml` 按需修改（默认即可本地运行）：

| 字段 | 说明 | 默认 |
|---|---|---|
| `DevMode` | 开发模式，开启后直接从 `api/static` 目录读文件（热更新、无需重编译） | `true` |
| `ApiPort` | 监听端口 | `8080` |
| `StaticDir` | 覆盖静态目录（留空则按 DevMode 决定：开发用磁盘、生产用内置） | `""` |
| `BaseURL` | 站点基础路径（可选），用于生成资源链接 | `""` |
| `SqlitePath` | SQLite 数据库文件路径 | `keyboard.db` |

## 接口架构

标准响应格式：`{"Code":0,"Message":"","Data":...}`（HTTP 始终 200，业务结果在 `Code`）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/lessons` | 练习关卡列表（前端从此拉取文本与步骤） |
| POST | `/api/v1/progress` | 保存一次练习成绩（写入 SQLite） |
| GET | `/api/v1/progress` | 查询成绩：带 `lesson_id` 返回该关明细+聚合；不带返回各关汇总 |

请求/响应示例：

```bash
# 上报成绩
curl -X POST http://localhost:8080/api/v1/progress \
  -H 'Content-Type: application/json' \
  -d '{"lesson_id":"home-row","wpm":18,"accuracy":98,"duration":25,"errors":1}'

# 查询某关成绩
curl "http://localhost:8080/api/v1/progress?lesson_id=home-row"
```

## 数据库

`resx/db.go` 在启动时通过 `sqlmer.sqlite.NewSqliteDbClient(dsn)` 建立连接并自动创建 `progress` 表：

```sql
CREATE TABLE IF NOT EXISTS progress (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id  TEXT    NOT NULL,
  wpm        INTEGER NOT NULL DEFAULT 0,
  accuracy   REAL    NOT NULL,
  duration   INTEGER NOT NULL,
  errors     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

> 选用 SQLite 而非 MySQL：零运维、单文件、适合此类单机/小流量儿童应用；后续如需多实例再换 `sqlmer` 的 MySQL 驱动即可，数据层改动很小。

## 设计要点

- **分场景输入**：桌面真键捕获 + 平板点屏输入共用一套虚拟键盘 UI，契合「平板认知、桌面实操」的产品思路。
- **物理键位匹配**：打字关卡用 `event.code`（如 `Semicolon` / `KeyA` / `Digit5`）比对，输入法与键盘布局改不了它——既修了中文输入法把 `;` 变全角 `；` 的坑，也让非 QWERTY 布局下「按对位置」仍能判对。
- **功能键学习**：平板上软键盘没有 F1–F12 / Esc / Ctrl 区，物理上无法练；所以功能键专项放在桌面端，且 Mac 需开启「将 F1–F12 用作标准功能键」，否则系统会把 F 键当亮度/音量吃掉。

## 本地运行

```bash
cd keyboard
go run .                 # DevMode 默认开启，自动热更新 api/static
# 浏览器打开 http://localhost:8080

# 生产/离线构建
go build -o keyboard .
./keyboard               # 静态资源已编译进二进制，无需 api/static 目录
```

> 依赖（go-chi / BurntSushi/toml / sqlmer / modernc.org/sqlite）走 `go mod tidy` 联网获取即可；本项目最初在未联网环境用本地模块缓存构建（`GOSUMDB=off GOPROXY=file://$(go env GOMODCACHE)/cache/download`）。

## 部署

- **Docker**：`docker build -t keybuddy . && docker run -p 8080:8080 keybuddy`
- **Nginx**：参考 `deploy/nginx/conf.d/keyboard.conf` 反代到后端 8080 端口（建议开启 HTTPS，PWA 在 HTTPS 下才能安装）。

## 后续规划

- 进度可视化（成长曲线 / 关卡解锁）
- 中文拼音 / 汉字输入练习
- 关卡编辑器 / 自定义练习文本
- 多设备进度同步（引入账号）

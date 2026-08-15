# 键盘小能手 (keyboard)

面向儿童的学打字网页。用 **Go 服务端输出静态页面**，前端实现核心打字功能。
项目结构参考 [xpoint](https://github.com/bunnier/xpoint) 的约定：`api/` 放 handler、`api/api_base/` 放公共组件、`api/static/` 直接放前端、由 Go 统一 serve。

## 技术栈

- Go（`net/http` + `go-chi` 路由）
- 原生前端（HTML / CSS / JS，**无构建步骤**，方便儿童设备直接打开）
- 数据持久化：SQLite（经框架 `sqlmer` 的 `sqlite` 驱动，纯 Go、无 CGO，**不依赖 MySQL**）
- 配置：TOML

## 目录结构

```
keyboard/
├── main.go                 # 服务入口：加载配置、注册路由、serve 静态资源
├── internal/config/        # 配置加载（对齐 xpoint 的 conf.toml）
├── resx/                   # 数据库入口（sqlmer.Extend + SQLite 建表，参考 xpoint 的 resx）
├── api/
│   ├── api_base/           # 公共组件：响应封装、Bind 反射绑定、错误恢复中间件
│   ├── typing.go           # 打字相关接口实现（关卡 + 进度持久化）
│   └── static/             # 前端静态资源（由 Go 直接 serve，含 PWA 资源）
│       ├── index.html
│       ├── manifest.webmanifest / sw.js   # PWA：iPad 添加到主屏幕可全屏/离线
│       ├── assets/icons/                 # 应用图标（180/192/512）
│       └── assets/{css,js}
├── deploy/                 # 部署配置（参考 xpoint 的 deploy 约定）
│   └── nginx/conf.d/
├── conf.example.toml       # 配置样例
├── Dockerfile
└── go.mod
```

## 运行

```bash
# 开发模式（自动从 api/static 热更新）
go run .

# 或编译后运行（生产模式使用 embed 内置静态资源）
go build -o keyboard . && ./keyboard
```

默认监听 `:8080`，访问 http://localhost:8080 。

配置项（`conf.toml`）：

| 字段 | 说明 | 默认 |
|---|---|---|
| `DevMode` | 开发模式，开启后自动用 `api/static` 目录（热更新） | `true` |
| `ApiPort` | 监听端口 | `8080` |
| `StaticDir` | 覆盖静态目录（留空则按 DevMode 决定） | `""` |
| `SqlitePath` | SQLite 数据库文件路径（进度等数据落盘处） | `keyboard.db` |

## 接口架构

标准响应格式：`{"Code":0,"Message":"","Data":...}`（HTTP 始终 200，业务结果在 `Code`）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/lessons` | 练习关卡列表（内置，前端从此拉取文本/功能键步骤） |
| GET | `/api/v1/progress?lesson_id=X` | 某关卡最近成绩明细 + 聚合统计 |
| GET | `/api/v1/progress` | 全部关卡的进度汇总（最佳速度/平均正确率/次数） |
| POST | `/api/v1/progress` | 保存一次练习成绩（持久化到 SQLite） |

进度数据使用框架 `sqlmer` 的 `sqlite` 驱动写入本地 `keyboard.db`，
部署时把该文件挂到卷上即可保留数据；后续若需换 MySQL，只需改 `resx/db.go` 的驱动初始化。

## 设计要点

- **分场景输入**：桌面端敲真实键盘（`keydown` 捕获 + 虚拟键盘同步高亮）；平板端没有物理键盘，
  孩子直接点屏幕上的虚拟键盘输入——契合「平板认知、桌面实操」的产品思路。
- **核心打字引擎**：逐字符高亮（当前/正确/错误）、实时统计速度（WPM）/正确率/进度。
- **功能键认知关卡**：内置「常用功能键 / F1–F12 / 组合小能手」三关，每一步是单键或组合键
  （如 `Ctrl+C`），桌面端虚拟键盘会高亮「下一个要按的键」，帮孩子建立功能键的空间记忆。
  （F 键在 Mac 上需开启「将 F1–F12 用作标准功能键」才能被网页捕获。）
- **PWA**：`manifest.webmanifest` + `sw.js` 缓存应用外壳，iPad「添加到主屏幕」后可全屏、可离线运行。

## 下一步

- 进度可视化（成长曲线 / 关卡解锁）
- 中文拼音 / 汉字输入练习、关卡编辑器
- 多孩子档案（当前进度按关卡聚合，尚无用户体系）

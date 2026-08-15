// Package api_base 提供 API 层的公共组件：标准响应封装、请求绑定(Bind)、
// 错误恢复中间件。参考 xpoint 项目的 api/api_base 约定，按键盘项目需求做了精简。
package api_base

import (
	"encoding/json"
	"net/http"
)

// ApiContext 封装 HTTP 请求和响应，供需要直接访问底层对象的 Handler 使用。
type ApiContext struct {
	Writer  http.ResponseWriter
	Request *http.Request
}

// ResponseEnvelope 是标准 API 响应格式。HTTP 状态码始终为 200，业务结果由 Code 字段表示。
type ResponseEnvelope struct {
	Code    int    `json:"Code"`
	Message string `json:"Message"`
	Data    any    `json:"Data"`
}

// ListResponse 包装列表类型响应，便于后期扩展分页等字段。
type ListResponse[T any] struct {
	Items []T `json:"Items"`
}

const (
	maxRequestBodyBytes = 1 << 20

	CodeOK = 0
	// 与 HTTP 状态码映射的标准错误码。
	CodeBadRequest    = 400
	CodeUnauthorized  = 401
	CodeForbidden     = 403
	CodeNotFound      = 404
	CodeInternalError = 500
	CodeUnspecified   = -1
)

// Success 返回 Code 为 0 的成功响应。
func Success(w http.ResponseWriter, data any) {
	respondJSON(w, CodeOK, "", data)
}

// respondJSON 写入标准 JSON 响应。
func respondJSON(w http.ResponseWriter, code int, message string, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK) // HTTP 始终 200，业务码在 Body。
	_ = json.NewEncoder(w).Encode(ResponseEnvelope{
		Code:    code,
		Message: message,
		Data:    data,
	})
}

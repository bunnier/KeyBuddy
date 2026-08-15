package api_base

import (
	"fmt"
	"net/http"
)

// ErrorHandler 是一个中间件，用于从 panic 中恢复并渲染为标准 JSON 响应。
// 业务错误(*BizError) 会映射到对应的业务码；其余 panic 视为内部错误。
func ErrorHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rvr := recover(); rvr != nil {
				var code int
				var message string

				if bizErr, ok := rvr.(*BizError); ok {
					code = bizErr.Code
					message = bizErr.Message
				} else {
					code = CodeInternalError
					message = "Internal Server Error"
					// 记录完整错误用于内部调试。
					fmt.Printf("PANIC RECOVERED: %v\n", rvr)
				}

				respondJSON(w, code, message, nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

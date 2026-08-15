package api_base

// BizError 业务错误，可被 ErrorHandler 识别并转换为对应的业务错误码与描述。
type BizError struct {
	Code    int
	Message string
}

// Error 实现 error 接口。
func (e *BizError) Error() string { return e.Message }

// NewBizError 构造一个业务错误。
func NewBizError(code int, message string) *BizError {
	return &BizError{Code: code, Message: message}
}

// 常见业务错误实例。
var (
	ErrInvalidRequest = NewBizError(CodeBadRequest, "请求格式不正确")
	ErrNotFound       = NewBizError(CodeNotFound, "资源不存在")
)

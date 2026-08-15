package api_base

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"reflect"
	"strconv"
)

// Bind 将高层级 API Handler 封装为 http.HandlerFunc。
// 它会自动解析 JSON Body，并将 URL Query 参数绑定到请求结构体。
// 支持以下参数类型：
//   - *ApiContext：注入原始请求/响应对象。
//   - 结构体或结构体指针：从 Body(JSON) 与 Query 参数绑定字段。
//
// Handler 的返回值（若有）将作为响应 Data 写入。
func Bind(fn any) http.HandlerFunc {
	fnVal := reflect.ValueOf(fn)
	fnTyp := fnVal.Type()
	if fnTyp.Kind() != reflect.Func {
		panic("api_base.Bind: 参数必须是一个函数。")
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		}

		var args []reflect.Value
		for i := 0; i < fnTyp.NumIn(); i++ {
			argTyp := fnTyp.In(i)

			// 情况 1: *ApiContext。
			if argTyp == reflect.TypeOf((*ApiContext)(nil)) {
				args = append(args, reflect.ValueOf(&ApiContext{Writer: w, Request: r}))
				continue
			}

			// 情况 2: 请求结构体或结构体指针。
			var structTyp reflect.Type
			if argTyp.Kind() == reflect.Struct {
				structTyp = argTyp
			} else if argTyp.Kind() == reflect.Ptr && argTyp.Elem().Kind() == reflect.Struct {
				structTyp = argTyp.Elem()
			}

			if structTyp != nil {
				reqVal := reflect.New(structTyp)
				if r.Method != http.MethodGet && r.Body != nil {
					decodeRequestBody(r.Body, reqVal.Interface())
				}
				bindQuery(r, reqVal.Interface())
				if argTyp.Kind() == reflect.Ptr {
					args = append(args, reqVal)
				} else {
					args = append(args, reqVal.Elem())
				}
				continue
			}

			panic("api_base.Bind: 存在不支持的参数类型 " + argTyp.String())
		}

		results := fnVal.Call(args)
		var resp any
		if len(results) > 0 {
			resp = results[0].Interface()
		}
		Success(w, resp)
	}
}

func decodeRequestBody(body io.Reader, target any) {
	decoder := json.NewDecoder(body)
	if err := decoder.Decode(target); err != nil {
		if errors.Is(err, io.EOF) {
			return
		}
		panic(ErrInvalidRequest)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		panic(ErrInvalidRequest)
	}
}

// bindQuery 使用反射从 URL Query 参数填充结构体字段，以 json tag 作为 key。
func bindQuery(r *http.Request, target any) {
	val := reflect.ValueOf(target)
	if val.Kind() != reflect.Ptr || val.Elem().Kind() != reflect.Struct {
		return
	}
	val = val.Elem()
	typ := val.Type()
	query := r.URL.Query()
	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		fieldType := typ.Field(i)

		name := fieldType.Tag.Get("json")
		if name == "" || name == "-" {
			name = fieldType.Name
		}
		paramVal := query.Get(name)
		if paramVal == "" {
			continue
		}
		if !field.CanSet() {
			continue
		}
		switch field.Kind() {
		case reflect.String:
			field.SetString(paramVal)
		case reflect.Int, reflect.Int64:
			if iv, err := strconv.ParseInt(paramVal, 10, 64); err == nil {
				field.SetInt(iv)
			}
		case reflect.Bool:
			if bv, err := strconv.ParseBool(paramVal); err == nil {
				field.SetBool(bv)
			}
		}
	}
}

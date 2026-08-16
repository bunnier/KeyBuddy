// Package api 存放所有 HTTP Handler。按业务拆分文件（当前为打字相关）。
package api

import (
	"time"

	"github.com/bunnier/keyboard/api/api_base"
	"github.com/bunnier/keyboard/resx"
)

// TypingApi 聚合打字练习相关的接口实现。
var TypingApi = typingApi{}

type typingApi struct{}

// Lesson 表示一个打字练习关卡。
type Lesson struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Level       string    `json:"level"`            // 难度：basic / intermediate / advanced
	Kind        string    `json:"kind"`             // 类型："type" 逐字输入 / "keys" 功能键认知
	Text        string    `json:"text,omitempty"`   // 逐字练习文本（kind=type 时有效）
	Steps       []KeyStep `json:"steps,omitempty"`  // 功能键步骤（kind=keys 时有效）
}

// KeyStep 功能键关卡中的一个步骤：单键或组合键。
type KeyStep struct {
	Display string    `json:"display"`           // 展示用标签，如 "Ctrl+C"
	Match   string    `json:"match"`             // 期望的 event.key（主匹配条件）
	Code    string    `json:"code,omitempty"`    // 期望的 event.code（物理按键，可选）
	Combo   []KeyPart `json:"combo,omitempty"`   // 组合键的子步骤（如 Ctrl + C）
}

// KeyPart 组合键中的单个按键。
type KeyPart struct {
	Display string `json:"display"`
	Match   string `json:"match"`
	Code    string `json:"code,omitempty"`
}

// builtinLessons 内置的练习关卡。后续可改为从配置或数据库加载。
var builtinLessons = []Lesson{
	// —— 逐字输入关卡 ——
	{ID: "home-row", Title: "回家键行", Description: "先熟悉 A S D F J K L ; 这一行", Level: "basic", Kind: "type",
		Text: "asdf jkl; asdf jkl; fdsa lkj; f j d k s l a;"},
	{ID: "letters", Title: "全部字母", Description: "练习 26 个英文字母", Level: "basic", Kind: "type",
		Text: "the quick brown fox jumps over the lazy dog"},
	{ID: "digits", Title: "数字键", Description: "练习主键盘区的数字", Level: "basic", Kind: "type",
		Text: "1234567890 0987654321 24680 13579"},
	{ID: "words", Title: "常用单词", Description: "练习常见英文单词", Level: "intermediate", Kind: "type",
		Text: "hello world apple banana cat dog sun moon star"},
	{ID: "sentence", Title: "完整句子", Description: "练习整句输入与空格标点", Level: "advanced", Kind: "type",
		Text: "The little cat sat on the big red mat. Where is my book?"},

	// —— 功能键认知关卡（平板认知、桌面实操）——
	{ID: "fn-basics", Title: "常用功能键", Description: "认识 Esc / Tab / 回车 / 方向键 在哪", Level: "basic", Kind: "keys",
		Steps: []KeyStep{
			{Display: "Esc", Match: "Escape"},
			{Display: "Tab", Match: "Tab"},
			{Display: "Caps", Match: "CapsLock"},
			{Display: "Enter", Match: "Enter"},
			{Display: "⌫", Match: "Backspace"},
			{Display: "Del", Match: "Delete"},
			{Display: "Space", Match: " "},
			{Display: "↑", Match: "ArrowUp"},
			{Display: "↓", Match: "ArrowDown"},
			{Display: "←", Match: "ArrowLeft"},
			{Display: "→", Match: "ArrowRight"},
		}},
	{ID: "fn-frow", Title: "F1–F12 一排", Description: "找到键盘最上面那排 F 键", Level: "intermediate", Kind: "keys",
		Steps: fRowSteps()},
	{ID: "fn-combos", Title: "组合小能手", Description: "试试 Ctrl 加字母的组合键", Level: "advanced", Kind: "keys",
		Steps: []KeyStep{
			combo("Ctrl", "Control", "C", "c"),
			combo("Ctrl", "Control", "V", "v"),
			combo("Ctrl", "Control", "Z", "z"),
			combo("Ctrl", "Control", "A", "a"),
			combo("Ctrl", "Control", "S", "s"),
		}},
}

// fRowSteps 生成 F1–F12 的步骤列表。
func fRowSteps() []KeyStep {
	steps := make([]KeyStep, 0, 12)
	for i := 1; i <= 12; i++ {
		name := "F" + itoa(i)
		steps = append(steps, KeyStep{Display: name, Match: name})
	}
	return steps
}

// combo 构造一个组合键步骤（如 Ctrl + C）。
func combo(modDisplay, modMatch, keyDisplay, keyMatch string) KeyStep {
	return KeyStep{
		Display: modDisplay + " + " + keyDisplay,
		Combo: []KeyPart{
			{Display: modDisplay, Match: modMatch},
			{Display: keyDisplay, Match: keyMatch},
		},
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// GetLessons 返回内置的练习关卡列表。前端核心打字功能从此拉取练习内容。
//
//	@route GET /api/v1/lessons
func (typingApi) GetLessons(_ *api_base.ApiContext) any {
	return api_base.ListResponse[Lesson]{Items: builtinLessons}
}

// ProgressReq 是保存打字练习结果的请求体。
type ProgressReq struct {
	LessonID  string  `json:"lesson_id"`
	ProfileID string  `json:"profile_id"` // 身份随机串（仅本地名称不传，接口只存这个串）
	Wpm       float64 `json:"wpm"`
	Accuracy  float64 `json:"accuracy"`
	Duration  int     `json:"duration"` // 耗时（秒）
	Errors    int     `json:"errors"`   // 错误次数
}

// ProgressRow 是 progress 表的一行（用于 ORM 映射，conv tag 对应数据库列名）。
type ProgressRow struct {
	ID        int64   `conv:"id" json:"id"`
	LessonID  string  `conv:"lesson_id" json:"lesson_id"`
	ProfileID string  `conv:"profile_id" json:"profile_id"`
	Wpm       float64 `conv:"wpm" json:"wpm"`
	Accuracy  float64 `conv:"accuracy" json:"accuracy"`
	Duration  int     `conv:"duration" json:"duration"`
	Errors    int     `conv:"errors" json:"errors"`
	CreatedAt string  `conv:"created_at" json:"created_at"`
}

// LessonStat 是某关卡的统计聚合。
type LessonStat struct {
	LessonID    string  `conv:"lesson_id" json:"lesson_id"`
	ProfileID   string  `conv:"profile_id" json:"profile_id"`
	Attempts    int64   `conv:"attempts" json:"attempts"`
	BestWpm     float64 `conv:"best_wpm" json:"best_wpm"`
	AvgAccuracy float64 `conv:"avg_accuracy" json:"avg_accuracy"`
}

// SaveProgress 保存一次打字练习结果到 SQLite。
//
//	@route POST /api/v1/progress
func (typingApi) SaveProgress(_ *api_base.ApiContext, req ProgressReq) any {
	if req.LessonID == "" || req.ProfileID == "" {
		panic(api_base.ErrInvalidRequest)
	}
	_, err := resx.Db.Execute(
		"INSERT INTO progress(lesson_id, profile_id, wpm, accuracy, duration, errors, created_at) VALUES(@p1,@p2,@p3,@p4,@p5,@p6,@p7)",
		req.LessonID, req.ProfileID, req.Wpm, req.Accuracy, req.Duration, req.Errors,
		time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		panic(api_base.NewBizError(api_base.CodeInternalError, "保存进度失败"))
	}
	return map[string]any{"saved": true, "lesson_id": req.LessonID, "profile_id": req.ProfileID}
}

// ProgressQuery 是 GET /api/v1/progress 的查询参数。
type ProgressQuery struct {
	LessonID  string `json:"lesson_id"`  // 可选：指定关卡则返回该关卡明细，否则返回全部关卡汇总
	ProfileID string `json:"profile_id"` // 必填：按身份随机串隔离查询
}

// GetProgress 查询打字进度（按 profile_id 隔离）。
//   - 指定 lesson_id：返回该关卡最近 50 条记录(items)与聚合统计(stats)；
//   - 未指定：返回该身份各关卡的聚合统计汇总(by_lesson)。
//
//	@route GET /api/v1/progress
func (typingApi) GetProgress(_ *api_base.ApiContext, q ProgressQuery) any {
	if q.ProfileID == "" {
		panic(api_base.ErrInvalidRequest)
	}
	if q.LessonID != "" {
		rows := resx.Db.MustListOf(new(ProgressRow),
			`SELECT id, lesson_id, profile_id, wpm, accuracy, duration, errors, created_at
			 FROM progress WHERE lesson_id=@p1 AND profile_id=@p2 ORDER BY id DESC LIMIT 50`,
			q.LessonID, q.ProfileID,
		).([]*ProgressRow)

		var stat LessonStat
		resx.Db.MustGetStruct(&stat,
			`SELECT lesson_id, profile_id, COUNT(1) AS attempts, MAX(wpm) AS best_wpm, AVG(accuracy) AS avg_accuracy
			 FROM progress WHERE lesson_id=@p1 AND profile_id=@p2`,
			q.LessonID, q.ProfileID,
		)

		return map[string]any{"items": rows, "stats": &stat}
	}

	stats := resx.Db.MustListOf(new(LessonStat),
		`SELECT lesson_id, profile_id, COUNT(1) AS attempts, MAX(wpm) AS best_wpm, AVG(accuracy) AS avg_accuracy
		 FROM progress WHERE profile_id=@p1 GROUP BY lesson_id`,
		q.ProfileID,
	).([]*LessonStat)

	byLesson := make(map[string]*LessonStat, len(stats))
	for _, s := range stats {
		byLesson[s.LessonID] = s
	}
	return map[string]any{"by_lesson": byLesson}
}

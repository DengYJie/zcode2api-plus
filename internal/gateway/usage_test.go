package gateway

import (
	"testing"

	"zcode2api/internal/model"
)

func TestUsageCollectorSSE(t *testing.T) {
	u := NewUsageCollector(true)
	u.Feed([]byte(`data: {"type":"message_start","message":{"usage":{"input_tokens":11,"output_tokens":1,"cache_creation_input_tokens":2,"cache_read_input_tokens":5}}}` + "\n"))
	// 故意把一行拆到两个 Feed，验证跨块缓冲
	u.Feed([]byte(`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}` + "\n" + `data: {"type":"message_delta","us`))
	u.Feed([]byte(`age":{"output_tokens":22}}` + "\n"))
	u.Feed([]byte(`data: {"type":"message_delta","usage":{"output_tokens":30}}` + "\n" + "data: [DONE]\n\n"))
	u.Finish()

	got := u.AsDict()
	if got.Input != 11 || got.CacheCreation != 2 || got.CacheRead != 5 {
		t.Fatalf("输入侧统计不符: %+v", got)
	}
	if got.Output != 30 {
		t.Fatalf("output 为累计值应取最大而非累加: %d", got.Output)
	}
}

// TestUsageCollectorDeltaCarriesInput 实测 zcode plan 端点的真实形态：
// message_start 的 input_tokens 恒 0 且无 cache 字段，最终 input/cache 全在
// message_delta 里——输入侧必须从 message_delta 按 max 合并，否则恒为 0。
func TestUsageCollectorDeltaCarriesInput(t *testing.T) {
	u := NewUsageCollector(true)
	u.Feed([]byte(`data: {"type":"message_start","message":{"usage":{"input_tokens":0,"output_tokens":0}}}` + "\n"))
	u.Feed([]byte(`data: {"type":"message_delta","usage":{"input_tokens":293,"output_tokens":3,"cache_read_input_tokens":0}}` + "\n" + "data: [DONE]\n\n"))
	u.Finish()

	got := u.AsDict()
	if got.Input != 293 {
		t.Fatalf("message_delta 的 input_tokens 应计入: %+v", got)
	}
	if got.Output != 3 {
		t.Fatalf("output 不符: %d", got.Output)
	}
}

func TestUsageCollectorJSON(t *testing.T) {	u := NewUsageCollector(false)
	u.Feed([]byte(`{"id":"msg_1","usage":{"input_tokens":7,"output_tokens":8,"cache_creation_input_tokens":0,"cache_read_input_tokens":3}}`))
	u.Finish()
	got := u.AsDict()
	if got.Input != 7 || got.Output != 8 || got.CacheRead != 3 {
		t.Fatalf("JSON 统计不符: %+v", got)
	}
}

func TestUsageCollectorFinishWithoutUsage(t *testing.T) {
	u := NewUsageCollector(false)
	u.Feed([]byte(`{"id":"msg_1","choices":[]}`))
	u.Finish()
	if got := u.AsDict(); got != (model.Usage{}) {
		t.Fatalf("无 usage 字段应全为 0: %+v", got)
	}

	u2 := NewUsageCollector(false)
	u2.Feed([]byte(`not json at all`))
	u2.Finish()
	if got := u2.AsDict(); got != (model.Usage{}) {
		t.Fatalf("坏 JSON 应全为 0: %+v", got)
	}
}

func TestUsageCollectorNegativeClamped(t *testing.T) {
	u := NewUsageCollector(true)
	u.FeedLine(`data: {"type":"message_start","message":{"usage":{"input_tokens":-3.7,"output_tokens":null}}}`)
	u.Finish()
	got := u.AsDict()
	if got.Input != 0 || got.Output != 0 {
		t.Fatalf("负数/空值应截为 0: %+v", got)
	}
}

func TestUsageCollectorIgnoresNoise(t *testing.T) {
	u := NewUsageCollector(true)
	u.FeedLine("event: message_start")
	u.FeedLine(": keepalive")
	u.FeedLine("data: [DONE]")
	u.FeedLine("data: not-json")
	u.Finish()
	if got := u.AsDict(); got != (model.Usage{}) {
		t.Fatalf("噪音行不应计入: %+v", got)
	}
}

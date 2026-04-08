package ai

import (
	"testing"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/structpb"

	aiv1 "github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/ai/v1"
)

func TestBuildGeminiRequestIncludesToolDeclarationsAndResults(t *testing.T) {
	params, err := structpb.NewStruct(map[string]any{
		"type": "object",
		"properties": map[string]any{
			"path": map[string]any{"type": "string"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	args, err := structpb.NewStruct(map[string]any{"path": "notes.md"})
	if err != nil {
		t.Fatal(err)
	}

	request, err := buildGeminiRequest(CompleteInput{
		Mode: aiv1.ConversationMode_CONVERSATION_MODE_AGENT,
		Tools: []*aiv1.ToolDescriptor{{
			Name:        proto.String("read_file"),
			Description: proto.String("Read a file"),
			Parameters:  params,
		}},
		Messages: []*aiv1.ChatMessage{
			{
				Role:    aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_USER.Enum(),
				Content: proto.String("Read notes.md"),
			},
			{
				Role: aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_ASSISTANT.Enum(),
				ToolCalls: []*aiv1.ModelToolCall{{
					CallId:         proto.String("call-1"),
					ToolName:       proto.String("read_file"),
					Arguments:      args,
					ToolCallId:     proto.String("call-1"),
					ProviderCallId: proto.String("call-1"),
				}},
			},
			{
				Role:           aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_TOOL_RESULT.Enum(),
				CallId:         proto.String("call-1"),
				ToolName:       proto.String("read_file"),
				Content:        proto.String("hello"),
				ToolCallId:     proto.String("call-1"),
				ProviderCallId: proto.String("call-1"),
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	if got := request.Tools[0].FunctionDeclarations[0].Name; got != "read_file" {
		t.Fatalf("tool declaration name = %q, want read_file", got)
	}
	if got := request.Contents[1].Parts[0].FunctionCall.ID; got != "call-1" {
		t.Fatalf("function call id = %q, want call-1", got)
	}
	if got := request.Contents[2].Parts[0].FunctionResponse.ID; got != "call-1" {
		t.Fatalf("function response id = %q, want call-1", got)
	}
	if got := request.Contents[2].Parts[0].FunctionResponse.Response["result"]; got != "hello" {
		t.Fatalf("function response result = %v, want hello", got)
	}
}

func TestGeminiGenerateResponseToolCalls(t *testing.T) {
	response := geminiGenerateResponse{
		Candidates: []struct {
			Content geminiContent `json:"content"`
		}{{
			Content: geminiContent{
				Parts: []geminiPart{{
					FunctionCall: &geminiFunctionCall{
						ID:   "call-1",
						Name: "search_vault",
						Args: map[string]any{"query": "kuku"},
					},
					ThoughtSignature: "sig",
				}},
			},
		}},
	}

	calls, err := response.ToolCalls()
	if err != nil {
		t.Fatal(err)
	}
	if len(calls) != 1 {
		t.Fatalf("len(calls) = %d, want 1", len(calls))
	}
	if got := calls[0].GetProviderCallId(); got != "call-1" {
		t.Fatalf("provider call id = %q, want call-1", got)
	}
	if got := calls[0].GetArguments().AsMap()["query"]; got != "kuku" {
		t.Fatalf("argument query = %v, want kuku", got)
	}
	if got := calls[0].GetSignature(); got != "sig" {
		t.Fatalf("signature = %q, want sig", got)
	}
}

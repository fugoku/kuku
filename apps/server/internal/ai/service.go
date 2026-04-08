package ai

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/structpb"

	aiv1 "github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/ai/v1"

	"github.com/kuku-mom/kuku/apps/server/internal/config"
)

var ErrNotConfigured = errors.New("remote ai is not configured")

type Service struct {
	apiKey string
	model  string
	client *http.Client
}

type CompleteInput struct {
	Mode         aiv1.ConversationMode
	Message      string
	ContextFiles []string
	Model        string
	Messages     []*aiv1.ChatMessage
	Tools        []*aiv1.ToolDescriptor
	SystemPrompt string
}

type CompleteOutput struct {
	Text         string
	Usage        *aiv1.TokenUsage
	ToolCalls    []*aiv1.ModelToolCall
	FinishReason aiv1.FinishReason
}

func NewService(cfg *config.Config) *Service {
	return &Service{
		apiKey: cfg.GeminiAPIKey,
		model:  cfg.GeminiModel,
		client: &http.Client{Timeout: 60 * time.Second},
	}
}

func (s *Service) Complete(ctx context.Context, input CompleteInput) (*CompleteOutput, error) {
	if s.apiKey == "" {
		return nil, ErrNotConfigured
	}

	model := strings.TrimSpace(input.Model)
	if model == "" {
		model = s.model
	}
	if model == "" {
		model = "gemini-2.5-flash"
	}

	body, err := buildGeminiRequest(input)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini request: %w", err)
	}

	endpoint := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		url.PathEscape(strings.TrimPrefix(model, "models/")),
		url.QueryEscape(s.apiKey),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gemini request: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read gemini response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gemini response %s: %s", resp.Status, truncate(raw, 512))
	}

	var out geminiGenerateResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode gemini response: %w", err)
	}

	text := out.Text()
	toolCalls, err := out.ToolCalls()
	if err != nil {
		return nil, err
	}
	finishReason := aiv1.FinishReason_FINISH_REASON_STOP
	if len(toolCalls) > 0 {
		finishReason = aiv1.FinishReason_FINISH_REASON_TOOL_CALLS
	}

	if text == "" && len(toolCalls) == 0 {
		return nil, errors.New("gemini response did not include text or tool calls")
	}

	return &CompleteOutput{
		Text: text,
		Usage: &aiv1.TokenUsage{
			InputTokens:  proto.Uint64(uint64(out.UsageMetadata.PromptTokenCount)),
			OutputTokens: proto.Uint64(uint64(out.UsageMetadata.CandidatesTokenCount)),
			TotalTokens:  proto.Uint64(uint64(out.UsageMetadata.TotalTokenCount)),
		},
		ToolCalls:    toolCalls,
		FinishReason: finishReason,
	}, nil
}

func buildGeminiRequest(input CompleteInput) (*geminiGenerateRequest, error) {
	contents, err := geminiContents(input)
	if err != nil {
		return nil, err
	}

	system := strings.TrimSpace(input.SystemPrompt)
	if system == "" {
		system = systemPrompt(input.Mode)
	}

	body := &geminiGenerateRequest{
		Contents: contents,
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: system}},
		},
	}

	if len(input.Tools) > 0 {
		declarations := make([]geminiFunctionDeclaration, 0, len(input.Tools))
		for _, tool := range input.Tools {
			if tool == nil || strings.TrimSpace(tool.GetName()) == "" {
				continue
			}
			declarations = append(declarations, geminiFunctionDeclaration{
				Name:        tool.GetName(),
				Description: tool.GetDescription(),
				Parameters:  structMap(tool.GetParameters()),
			})
		}
		if len(declarations) > 0 {
			body.Tools = []geminiTool{{FunctionDeclarations: declarations}}
		}
	}

	return body, nil
}

func geminiContents(input CompleteInput) ([]geminiContent, error) {
	if len(input.Messages) == 0 {
		prompt := input.Message
		if len(input.ContextFiles) > 0 {
			prompt = fmt.Sprintf("%s\n\n<context_files>\n%s\n</context_files>", input.Message, strings.Join(input.ContextFiles, "\n---\n"))
		}
		return []geminiContent{{
			Role:  "user",
			Parts: []geminiPart{{Text: prompt}},
		}}, nil
	}

	contents := make([]geminiContent, 0, len(input.Messages))
	for _, message := range input.Messages {
		if message == nil {
			continue
		}
		content, err := geminiContentFromMessage(message)
		if err != nil {
			return nil, err
		}
		if len(content.Parts) > 0 {
			contents = append(contents, content)
		}
	}
	if len(contents) == 0 {
		return nil, errors.New("completion request requires at least one message")
	}
	return contents, nil
}

func geminiContentFromMessage(message *aiv1.ChatMessage) (geminiContent, error) {
	switch message.GetRole() {
	case aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_SYSTEM:
		if strings.TrimSpace(message.GetContent()) == "" {
			return geminiContent{}, nil
		}
		return geminiContent{Role: "user", Parts: []geminiPart{{Text: "System:\n" + message.GetContent()}}}, nil
	case aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_USER:
		if strings.TrimSpace(message.GetContent()) == "" {
			return geminiContent{}, nil
		}
		return geminiContent{Role: "user", Parts: []geminiPart{{Text: message.GetContent()}}}, nil
	case aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_ASSISTANT:
		parts := make([]geminiPart, 0, 1+len(message.GetToolCalls()))
		if message.GetContent() != "" {
			parts = append(parts, geminiPart{Text: message.GetContent()})
		}
		for _, call := range message.GetToolCalls() {
			if call == nil {
				continue
			}
			parts = append(parts, geminiPart{
				FunctionCall: &geminiFunctionCall{
					ID:   firstNonEmpty(call.GetProviderCallId(), call.GetToolCallId(), call.GetCallId()),
					Name: call.GetToolName(),
					Args: structMap(call.GetArguments()),
				},
				ThoughtSignature: call.GetSignature(),
			})
		}
		return geminiContent{Role: "model", Parts: parts}, nil
	case aiv1.ChatMessageRole_CHAT_MESSAGE_ROLE_TOOL_RESULT:
		id := firstNonEmpty(message.GetProviderCallId(), message.GetToolCallId(), message.GetCallId())
		return geminiContent{
			Role: "user",
			Parts: []geminiPart{{
				FunctionResponse: &geminiFunctionResponse{
					ID:   id,
					Name: message.GetToolName(),
					Response: map[string]any{
						"result":  message.GetContent(),
						"isError": message.GetIsError(),
					},
				},
			}},
		}, nil
	default:
		return geminiContent{}, fmt.Errorf("unsupported chat message role: %s", message.GetRole())
	}
}

func systemPrompt(mode aiv1.ConversationMode) string {
	switch mode {
	case aiv1.ConversationMode_CONVERSATION_MODE_AGENT:
		return "You are Kuku, a concise PKM assistant. Use the provided tools when they are helpful. The desktop app will execute tool calls and send the results back to you."
	case aiv1.ConversationMode_CONVERSATION_MODE_INLINE:
		return "You are Kuku, a concise writing assistant. Return only the edited or suggested text unless the user asks for explanation."
	default:
		return "You are Kuku, a concise PKM assistant. Answer directly."
	}
}

func structMap(value *structpb.Struct) map[string]any {
	if value == nil {
		return map[string]any{"type": "object"}
	}
	return value.AsMap()
}

func newCallID(name string, index int) string {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return fmt.Sprintf("%s-%s", name, hex.EncodeToString(raw[:]))
	}
	return fmt.Sprintf("%s-%d", name, index)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func truncate(raw []byte, limit int) string {
	if len(raw) <= limit {
		return string(raw)
	}
	return string(raw[:limit]) + "..."
}

type geminiGenerateRequest struct {
	Contents          []geminiContent `json:"contents"`
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Tools             []geminiTool    `json:"tools,omitempty"`
}

type geminiTool struct {
	FunctionDeclarations []geminiFunctionDeclaration `json:"functionDeclarations,omitempty"`
}

type geminiFunctionDeclaration struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text             string                  `json:"text,omitempty"`
	FunctionCall     *geminiFunctionCall     `json:"functionCall,omitempty"`
	FunctionResponse *geminiFunctionResponse `json:"functionResponse,omitempty"`
	ThoughtSignature string                  `json:"thoughtSignature,omitempty"`
}

type geminiFunctionCall struct {
	ID   string         `json:"id,omitempty"`
	Name string         `json:"name"`
	Args map[string]any `json:"args,omitempty"`
}

type geminiFunctionResponse struct {
	ID       string         `json:"id,omitempty"`
	Name     string         `json:"name"`
	Response map[string]any `json:"response"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata"`
}

func (r geminiGenerateResponse) Text() string {
	var builder strings.Builder
	for _, candidate := range r.Candidates {
		for _, part := range candidate.Content.Parts {
			builder.WriteString(part.Text)
		}
	}
	return builder.String()
}

func (r geminiGenerateResponse) ToolCalls() ([]*aiv1.ModelToolCall, error) {
	var calls []*aiv1.ModelToolCall
	for _, candidate := range r.Candidates {
		for index, part := range candidate.Content.Parts {
			if part.FunctionCall == nil {
				continue
			}
			id := part.FunctionCall.ID
			if id == "" {
				id = newCallID(part.FunctionCall.Name, index)
			}
			args, err := structpb.NewStruct(part.FunctionCall.Args)
			if err != nil {
				return nil, fmt.Errorf("decode gemini function call arguments: %w", err)
			}
			calls = append(calls, &aiv1.ModelToolCall{
				CallId:         proto.String(id),
				ToolName:       proto.String(part.FunctionCall.Name),
				Arguments:      args,
				Signature:      proto.String(part.ThoughtSignature),
				ToolCallId:     proto.String(id),
				ProviderCallId: proto.String(id),
			})
		}
	}
	return calls, nil
}

package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"

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
}

type CompleteOutput struct {
	Text  string
	Usage *aiv1.TokenUsage
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

	prompt := input.Message
	if len(input.ContextFiles) > 0 {
		prompt = fmt.Sprintf("%s\n\n<context_files>\n%s\n</context_files>", input.Message, strings.Join(input.ContextFiles, "\n---\n"))
	}

	body := geminiGenerateRequest{
		Contents: []geminiContent{{
			Parts: []geminiPart{{Text: prompt}},
		}},
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt(input.Mode)}},
		},
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
	if text == "" {
		return nil, errors.New("gemini response did not include text")
	}

	return &CompleteOutput{
		Text: text,
		Usage: &aiv1.TokenUsage{
			InputTokens:  proto.Uint64(uint64(out.UsageMetadata.PromptTokenCount)),
			OutputTokens: proto.Uint64(uint64(out.UsageMetadata.CandidatesTokenCount)),
			TotalTokens:  proto.Uint64(uint64(out.UsageMetadata.TotalTokenCount)),
		},
	}, nil
}

func systemPrompt(mode aiv1.ConversationMode) string {
	switch mode {
	case aiv1.ConversationMode_CONVERSATION_MODE_AGENT:
		return "You are Kuku, a concise PKM assistant. Remote mode is text-only for now, so do not claim that you used local tools."
	case aiv1.ConversationMode_CONVERSATION_MODE_INLINE:
		return "You are Kuku, a concise writing assistant. Return only the edited or suggested text unless the user asks for explanation."
	default:
		return "You are Kuku, a concise PKM assistant. Answer directly."
	}
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
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
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

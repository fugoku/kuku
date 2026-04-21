package ai

import (
	"context"
	"errors"
	"log/slog"
	"strings"

	"connectrpc.com/connect"

	aiv1 "github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/ai/v1"
	"github.com/kuku-mom/kuku/packages/contract/gen/go/kuku/ai/v1/aiv1connect"

	"github.com/kuku-mom/kuku/apps/server/internal/auth"
	"github.com/kuku-mom/kuku/apps/server/internal/rpcerr"
)

type Handler struct {
	aiv1connect.UnimplementedAIServiceHandler
	service *Service
	log     *slog.Logger
}

func NewHandler(service *Service, log *slog.Logger) *Handler {
	return &Handler{service: service, log: log}
}

// Complete forwards CompleteResponse events from the service's streaming
// iterator to the Connect server stream. The stream closes naturally on
// the terminal FinishedEvent; tool-call rounds are driven client-side by
// issuing a follow-up Complete with tool_result messages appended.
func (h *Handler) Complete(
	ctx context.Context,
	req *connect.Request[aiv1.CompleteRequest],
	stream *connect.ServerStream[aiv1.CompleteResponse],
) error {
	if _, _, err := auth.FromContext(ctx); err != nil {
		return connect.NewError(connect.CodeUnauthenticated, errors.New("not authenticated"))
	}

	message := strings.TrimSpace(req.Msg.GetMessage())
	if message == "" && len(req.Msg.GetMessages()) == 0 {
		return connect.NewError(connect.CodeInvalidArgument, errors.New("message is required"))
	}

	input := CompleteInput{
		Mode:         req.Msg.GetMode(),
		Message:      message,
		ContextFiles: req.Msg.GetContextFiles(),
		Model:        req.Msg.GetModel(),
		Messages:     req.Msg.GetMessages(),
		Tools:        req.Msg.GetTools(),
		SystemPrompt: req.Msg.GetSystemPrompt(),
	}

	for event, err := range h.service.CompleteStream(ctx, input) {
		if err != nil {
			if errors.Is(err, ErrNotConfigured) {
				return connect.NewError(connect.CodeFailedPrecondition, err)
			}
			return rpcerr.Internal(ctx, h.log, "remote ai complete failed", err)
		}
		if err := stream.Send(event); err != nil {
			return err
		}
	}
	return nil
}

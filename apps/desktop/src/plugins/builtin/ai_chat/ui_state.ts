import type { ChatApprovalMessage, ChatSessionState, ChatToolMessage } from "./types";

type ChatUiTone = "neutral" | "accent" | "warning" | "danger" | "success";

interface ChatStatusMeta {
  label: string;
  description: string;
  tone: ChatUiTone;
}

function truncateSingleLine(value: string | undefined, max = 96): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function getSessionStatusMeta(session: ChatSessionState | null): ChatStatusMeta {
  if (!session) {
    return {
      label: "Idle",
      description: "Ready for a new request.",
      tone: "neutral",
    };
  }

  switch (session.status) {
    case "idle":
      return {
        label: "Idle",
        description: "Ready for a new request.",
        tone: "neutral",
      };
    case "streaming":
      return {
        label: "Thinking",
        description: "The assistant is working and may still call tools.",
        tone: "accent",
      };
    case "awaiting-approval":
      return {
        label: "Waiting for approval",
        description: "Waiting for approval before applying changes.",
        tone: "warning",
      };
    case "applying":
      return {
        label: "Applying",
        description: "Applying approved changes.",
        tone: "warning",
      };
    case "error":
      return {
        label: "Error",
        description: session.error ?? "The last request failed.",
        tone: "danger",
      };
  }
}

function getToolStatusLabel(item: ChatToolMessage): string {
  if (item.error) return "Error";
  if (item.success) return "Done";
  return "Running";
}

function getToolStatusTone(item: ChatToolMessage): ChatUiTone {
  if (item.error) return "danger";
  if (item.success) return "success";
  return "accent";
}

function getToolPreview(item: ChatToolMessage): string {
  if (item.error) {
    return truncateSingleLine(item.error, 100);
  }
  if (item.output) {
    return truncateSingleLine(item.output, 100);
  }
  return truncateSingleLine(JSON.stringify(item.arguments), 100) || "Waiting for result.";
}

function getApprovalStatusLabel(item: ChatApprovalMessage): string {
  switch (item.status) {
    case "pending":
      return "Awaiting approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "applied":
      return "Applied";
    case "conflict":
      return "Conflict";
    case "error":
      return "Error";
  }
}

function getApprovalStatusTone(item: ChatApprovalMessage): ChatUiTone {
  switch (item.status) {
    case "pending":
      return "warning";
    case "approved":
      return "accent";
    case "rejected":
      return "neutral";
    case "applied":
      return "success";
    case "conflict":
    case "error":
      return "danger";
  }
}

function getApprovalSummary(item: ChatApprovalMessage): string {
  if (item.error) {
    return truncateSingleLine(item.error, 120);
  }

  if (item.previewText) {
    return truncateSingleLine(item.previewText, 120);
  }

  const summary =
    typeof item.mutation.summary === "string"
      ? item.mutation.summary
      : JSON.stringify(item.mutation);
  return truncateSingleLine(summary, 120) || getApprovalStatusLabel(item);
}

export type { ChatStatusMeta, ChatUiTone };
export {
  getApprovalStatusLabel,
  getApprovalStatusTone,
  getApprovalSummary,
  getSessionStatusMeta,
  getToolPreview,
  getToolStatusLabel,
  getToolStatusTone,
  truncateSingleLine,
};

import { readVaultFile } from "~/lib/vault_fs";
import { openDiffView } from "~/plugins/builtin/diff_view";

interface EditFileDiffTarget {
  path: string;
  newMarkdown: string;
}

function getEditFileDiffTarget(mutation: Record<string, unknown>): EditFileDiffTarget | null {
  const operations = mutation.operations;
  if (!Array.isArray(operations) || operations.length !== 1) {
    return null;
  }

  const [operation] = operations;
  if (!operation || typeof operation !== "object") {
    return null;
  }

  const candidate = operation as Record<string, unknown>;
  if (candidate.kind !== "replaceFile") {
    return null;
  }

  const path = candidate.path;
  const content = candidate.content;

  if (typeof path !== "string" || typeof content !== "string") {
    return null;
  }

  return {
    path,
    newMarkdown: content,
  };
}

function canOpenApprovalDiff(mutation: Record<string, unknown>, toolName: string): boolean {
  return toolName === "edit_file" && getEditFileDiffTarget(mutation) !== null;
}

async function openApprovalDiff(
  mutation: Record<string, unknown>,
  toolName: string,
): Promise<void> {
  if (toolName !== "edit_file") {
    return;
  }

  const target = getEditFileDiffTarget(mutation);
  if (!target) {
    return;
  }

  try {
    const oldMarkdown = await readVaultFile(target.path);
    openDiffView(target.path, oldMarkdown, target.newMarkdown);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ai-chat] failed to open approval diff", error);
  }
}

export { canOpenApprovalDiff, getEditFileDiffTarget, openApprovalDiff };

const BUILTIN_TOOL_ID_BY_NAME: Record<string, string> = {
  read_file: "builtin.read_file",
  list_files: "builtin.list_files",
  search_vault: "builtin.search_vault",
  create_file: "builtin.create_file",
  edit_file: "builtin.edit_file",
  delete_file: "builtin.delete_file",
  move_file: "builtin.move_file",
  get_outline: "builtin.get_outline",
  get_tags: "builtin.get_tags",
};

const TOOL_DISPLAY_BY_KIND: Record<string, { label: string; activeLabel: string }> = {
  search_vault: { label: "Search Notes", activeLabel: "Searching" },
  search_notes: { label: "Search Notes", activeLabel: "Searching" },
  read_file: { label: "Read File", activeLabel: "Reading" },
  create_file: { label: "Create File", activeLabel: "Creating" },
  edit_file: { label: "Edit File", activeLabel: "Editing" },
  move_file: { label: "Move File", activeLabel: "Moving" },
  delete_file: { label: "Delete File", activeLabel: "Deleting" },
  list_files: { label: "List Files", activeLabel: "Listing" },
  get_outline: { label: "Get Outline", activeLabel: "Analyzing" },
  get_tags: { label: "Get Tags", activeLabel: "Reading tags" },
  find_links: { label: "Find Links", activeLabel: "Finding links" },
  suggest_links: { label: "Suggest Links", activeLabel: "Analyzing" },
  find_related_notes: { label: "Find Related Notes", activeLabel: "Finding related notes" },
  find_orphan_notes: { label: "Find Orphan Notes", activeLabel: "Finding orphan notes" },
  get_vault_stats: { label: "Get Vault Stats", activeLabel: "Reading stats" },
  open_file: { label: "Open File", activeLabel: "Opening" },
};

function canonicalToolId(toolName: string): string {
  if (toolName.includes(".")) return toolName;
  return BUILTIN_TOOL_ID_BY_NAME[toolName] ?? toolName;
}

function getToolKind(toolIdOrName: string | undefined | null): string {
  if (!toolIdOrName) return "";
  return canonicalToolId(toolIdOrName).split(".").at(-1) ?? toolIdOrName;
}

function getToolInfo(toolIdOrName: string): { label: string; activeLabel: string } {
  const kind = getToolKind(toolIdOrName);
  return (
    TOOL_DISPLAY_BY_KIND[kind] ?? {
      label: kind || toolIdOrName,
      activeLabel: "Running",
    }
  );
}

function formatToolIdentity(toolId?: string, toolName?: string): string {
  const resolved = toolId ?? canonicalToolId(toolName ?? "");
  return resolved || toolName || "";
}

export { canonicalToolId, formatToolIdentity, getToolInfo, getToolKind };

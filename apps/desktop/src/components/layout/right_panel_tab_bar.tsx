import { type JSX, For } from "solid-js";

import { GraphIcon, KukuIcon } from "~/components/icons";
import { layoutState, setActiveRightPanelView } from "~/stores/layout";

// ── Tab definitions ──

interface RightPanelTab {
  viewId: string;
  label: string;
  icon: (size: number) => JSX.Element;
}

const TABS: RightPanelTab[] = [
  {
    viewId: "graph-view.panel",
    label: "Graph View",
    icon: (size) => <GraphIcon size={size} />,
  },
  {
    viewId: "ai-chat.panel",
    label: "AI Chat",
    icon: (size) => <KukuIcon size={size} />,
  },
];

// ── Component ──

export default function RightPanelTabBar() {
  const activeLabel = () =>
    TABS.find((t) => t.viewId === layoutState.activeRightPanelViewId)?.label ?? "";

  return (
    <div class="shrink-0 border-b border-border">
      <div class="flex h-9.5 items-center justify-between px-5">
        <span class="text-xs font-medium text-text-muted">{activeLabel()}</span>
        <div class="flex items-center gap-0.5">
          <For each={TABS}>
            {(tab) => {
              const isActive = () => layoutState.activeRightPanelViewId === tab.viewId;

              return (
                <button
                  type="button"
                  title={tab.label}
                  class={`flex size-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-all duration-100 ${
                    isActive()
                      ? "text-icon ring-1 ring-border-focused"
                      : "text-icon-muted hover:bg-ghost-hover hover:text-icon"
                  }`}
                  onClick={() => setActiveRightPanelView(tab.viewId)}
                >
                  {tab.icon(18)}
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}

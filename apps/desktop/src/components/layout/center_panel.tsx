import { type JSX, onCleanup, Show } from "solid-js";

import TabBar from "~/components/layout/tab_bar";
import { createFocusZone } from "~/keybindings";
import { filesState } from "~/stores/files";

// ── Types ──

interface CenterPanelProps {
  children?: JSX.Element;
}

// ── Component ──

export default function CenterPanel(props: CenterPanelProps) {
  return (
    <div
      ref={(el) => onCleanup(createFocusZone(el, "center"))}
      class="flex min-w-[30%] flex-1 flex-col overflow-hidden bg-bg-primary"
    >
      <TabBar />
      <Show
        when={filesState.tabs.length > 0}
        fallback={
          <div class="flex min-h-0 flex-1 flex-col items-center justify-center">
            <p class="text-sm tracking-wide text-text-muted opacity-50">Focus. Write. Flow.</p>
          </div>
        }
      >
        <div class="min-h-0 flex-1 overflow-hidden">{props.children}</div>
      </Show>
    </div>
  );
}

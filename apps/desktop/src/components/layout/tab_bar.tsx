import { For, Show } from "solid-js";

import { CloseIcon, PlusIcon } from "~/components/icons";
import ScrollArea from "~/components/scroll_area";
import { closeTab, filesState, openTab, setActiveTab } from "~/stores/files";

// ── Helpers ──

function stripExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.substring(0, dotIndex) : name;
}

// ── Styles ──

const ACTION_BTN =
  "flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border-none bg-transparent text-icon-muted transition-all duration-100 hover:bg-ghost-hover hover:text-icon";

// ── Component ──

export default function TabBar() {
  const handleMiddleClick = (tabId: string, e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const handleCloseClick = (tabId: string, e: MouseEvent) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  return (
    <div class="relative z-10 bg-bg-secondary">
      <div class="flex min-h-8.5 items-center gap-2 px-2 pt-1">
        {/* ── Tab list (horizontal scroll, hidden scrollbar) ── */}
        <ScrollArea
          class="min-w-0 flex-1"
          axis="x"
          horizontalWheel
          options={{ scrollbars: { visibility: "hidden" } }}
        >
          <div class="flex items-center">
            <For each={filesState.tabs}>
              {(tab, index) => {
                const isActive = () => tab.id === filesState.activeTabId;
                const prevActive = () => {
                  const i = index();
                  return i > 0 && filesState.tabs[i - 1].id === filesState.activeTabId;
                };
                const isLast = () => index() === filesState.tabs.length - 1;
                const hideLeftSep = () => isActive() || prevActive();

                return (
                  <>
                    {/* Separator */}
                    <span
                      class="h-4 w-px shrink-0 bg-border"
                      classList={{ invisible: hideLeftSep() }}
                    />

                    {/* Tab */}
                    <div
                      role="tab"
                      tabIndex={0}
                      data-tab-id={tab.id}
                      class={`group/tab relative flex h-7.5 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border px-2.5 py-1.25 text-[13px] font-medium whitespace-nowrap transition-[background,color,border-color] duration-100 select-none ${
                        isActive()
                          ? "border-border border-b-bg-primary bg-bg-primary text-text-primary after:absolute after:inset-x-px after:-bottom-px after:h-px after:bg-bg-primary after:content-['']"
                          : "border-transparent text-text-muted hover:text-text-secondary"
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setActiveTab(tab.id);
                      }}
                      onMouseDown={(e) => handleMiddleClick(tab.id, e)}
                    >
                      {/* Dirty indicator */}
                      <Show when={tab.isDirty}>
                        <span class="-order-2 size-1.5 shrink-0 rounded-full bg-accent" />
                      </Show>

                      {/* Tab name */}
                      <span class="min-w-0 flex-1 truncate leading-4.5">
                        {stripExtension(tab.fileName)}
                      </span>

                      {/* Close button */}
                      <button
                        type="button"
                        class={`flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-icon-muted transition-all duration-100 hover:text-text-primary hover:opacity-100 ${
                          isActive() ? "opacity-100" : "opacity-0 group-hover/tab:opacity-60"
                        }`}
                        onClick={(e) => handleCloseClick(tab.id, e)}
                      >
                        <CloseIcon />
                      </button>
                    </div>

                    {/* Trailing separator */}
                    <Show when={isLast()}>
                      <span
                        class="h-4 w-px shrink-0 bg-border"
                        classList={{ invisible: isActive() }}
                      />
                    </Show>
                  </>
                );
              }}
            </For>
          </div>
        </ScrollArea>

        {/* ── New tab button ── */}
        <div class="flex shrink-0 items-center border-l border-border pl-1">
          <button
            type="button"
            class={ACTION_BTN}
            onClick={() => openTab("Untitled")}
            title="New Tab"
          >
            <PlusIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

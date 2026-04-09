import { ErrorBoundary, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";

import { PluginErrorUI, PluginSkeleton, slotRegistry } from "~/plugins/slots";

import { SettingsRefreshProvider } from "./settings_refresh";

function PluginSettingsSection(props: { fillId: string; settingsRefreshToken: number }) {
  const fill = () =>
    slotRegistry.fills.settingsSection.find(
      (entry) => entry.id === props.fillId && entry.isActive(),
    );

  return (
    <Show
      when={fill()}
      fallback={
        <div class="rounded-xs border border-border px-4 py-8 text-center text-[0.8125rem] text-text-muted">
          Plugin settings are unavailable.
        </div>
      }
    >
      {(activeFill) => (
        <div data-settings-anchor={`plugin:${props.fillId}`}>
          <ErrorBoundary
            fallback={(error: Error, reset: () => void) => (
              <PluginErrorUI pluginId={activeFill().pluginId} error={error} onReset={reset} />
            )}
          >
            <Suspense fallback={<PluginSkeleton />}>
              <SettingsRefreshProvider value={props.settingsRefreshToken}>
                <Dynamic component={activeFill().component} />
              </SettingsRefreshProvider>
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </Show>
  );
}

export { PluginSettingsSection };

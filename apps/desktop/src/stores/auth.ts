import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createStore } from "solid-js/store";

interface AuthUser {
  email: string;
}

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  error: string | null;
}

const [authState, setAuthState] = createStore<AuthState>({
  loading: false,
  authenticated: false,
  user: null,
  error: null,
});

let cleanupListeners: UnlistenFn[] = [];

async function checkAuth(): Promise<void> {
  setAuthState("loading", true);
  setAuthState("error", null);
  try {
    const authenticated = await invoke<boolean>("auth_check_status");
    const user = authenticated ? await invoke<AuthUser | null>("auth_get_user") : null;
    setAuthState("authenticated", authenticated);
    setAuthState("user", user);
  } catch (error) {
    setAuthState("authenticated", false);
    setAuthState("user", null);
    setAuthState("error", error instanceof Error ? error.message : String(error));
  } finally {
    setAuthState("loading", false);
  }
}

async function openLogin(): Promise<void> {
  setAuthState("loading", true);
  setAuthState("error", null);
  try {
    await invoke<void>("auth_open_login");
  } catch (error) {
    setAuthState("error", error instanceof Error ? error.message : String(error));
  } finally {
    setAuthState("loading", false);
  }
}

async function logout(): Promise<void> {
  await invoke<void>("auth_logout");
  setAuthState("authenticated", false);
  setAuthState("user", null);
}

async function initAuthListeners(): Promise<void> {
  cleanupListeners.forEach((cleanup) => cleanup());
  cleanupListeners = [
    await listen("auth://success", () => {
      void checkAuth();
    }),
    await listen<{ message?: string }>("auth://error", (event) => {
      setAuthState("error", event.payload?.message ?? "Authentication failed.");
      setAuthState("loading", false);
    }),
  ];
}

function destroyAuthListeners(): void {
  cleanupListeners.forEach((cleanup) => cleanup());
  cleanupListeners = [];
}

export { authState, checkAuth, destroyAuthListeners, initAuthListeners, logout, openLogin };

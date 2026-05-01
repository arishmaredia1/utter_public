import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface Secrets {
  r2_account_id: string;
  r2_access_key_id: string;
  r2_secret_access_key: string;
  r2_bucket: string;
}

interface SessionState {
  token: string | null;
  secrets: Secrets | null;
  err: string | null;
  busy: boolean;
  login(username: string, password: string): Promise<boolean>;
  logout(): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  secrets: null,
  err: null,
  busy: false,
  async login(username, password) {
    set({ busy: true, err: null });
    try {
      const res = await invoke<{ token: string }>("login", { username, password });
      const secrets = await invoke<Secrets>("get_secrets", { session: res.token });
      set({ token: res.token, secrets, busy: false });
      return true;
    } catch (e: unknown) {
      set({ err: typeof e === "string" ? e : (e instanceof Error ? e.message : "Login failed"), busy: false });
      return false;
    }
  },
  async logout() {
    await invoke("logout").catch(() => {});
    set({ token: null, secrets: null });
  },
}));

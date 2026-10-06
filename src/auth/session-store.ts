import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useChats } from "../chat/chats-store";
import { checkInstance, type CheckError } from "./check-instance";
import type { CredentialsForm } from "./credentials";

export type Screen = "checking" | "signedOut" | "signedIn";

interface SessionState {
  /** The last credentials that passed the check; the only persisted field. */
  credentials: CredentialsForm | null;
  screen: Screen;
  error: CheckError | null;
  busy: boolean;
  /** Re-checks saved credentials (page load). Call once, outside React effects. */
  resume: () => Promise<void>;
  signIn: (credentials: CredentialsForm) => Promise<void>;
  signOut: () => void;
}

function isCredentials(value: unknown): value is CredentialsForm {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.idInstance === "string" &&
    typeof c.apiTokenInstance === "string" &&
    typeof c.apiUrl === "string" &&
    typeof c.customApiUrl === "boolean"
  );
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      credentials: null,
      screen: "signedOut",
      error: null,
      busy: false,

      resume: async () => {
        const { credentials } = get();
        if (credentials === null) return;
        set({ screen: "checking", error: null });
        const error = await checkInstance(credentials);
        if (error === null) useChats.getState().open(credentials.idInstance);
        // On failure the saved credentials stay, so the form comes back prefilled.
        set(
          error === null
            ? { screen: "signedIn" }
            : { screen: "signedOut", error },
        );
      },

      signIn: async (credentials) => {
        if (get().busy) return;
        set({ busy: true, error: null });
        const error = await checkInstance(credentials);
        if (error === null) useChats.getState().open(credentials.idInstance);
        set(
          error === null
            ? { busy: false, credentials, screen: "signedIn" }
            : { busy: false, error },
        );
      },

      signOut: () => {
        useChats.getState().wipe();
        set({ credentials: null, screen: "signedOut", error: null });
      },
    }),
    {
      name: "green-api-chat:session",
      version: 1,
      partialize: ({ credentials }) => ({ credentials }),
      // Corrupt JSON, a wrong shape or another version all end as `credentials: null` (empty form).
      merge: (persisted, current) => {
        const saved =
          typeof persisted === "object" && persisted !== null
            ? (persisted as Record<string, unknown>).credentials
            : undefined;
        return isCredentials(saved)
          ? { ...current, credentials: saved }
          : current;
      },
    },
  ),
);

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";

type ReloadContextValue = {
  /** Increment the key to force a full remount of the app tree (shows splash again). */
  reloadApp: () => void;
  /** Current mount key — pass to the inner tree wrapper. */
  mountKey: number;
};

const ReloadContext = createContext<ReloadContextValue | null>(null);

export function ReloadProvider({ children }: { children: ReactNode }) {
  const [mountKey, setMountKey] = useState(0);

  const reloadApp = useCallback(() => {
    setMountKey((k) => k + 1);
  }, []);

  return (
    <ReloadContext.Provider value={{ reloadApp, mountKey }}>
      {children}
    </ReloadContext.Provider>
  );
}

export function useReloadApp() {
  const ctx = useContext(ReloadContext);
  if (!ctx) throw new Error("useReloadApp must be inside ReloadProvider");
  return ctx.reloadApp;
}

export function useReloadContext() {
  const ctx = useContext(ReloadContext);
  if (!ctx) throw new Error("useReloadContext must be inside ReloadProvider");
  return ctx;
}

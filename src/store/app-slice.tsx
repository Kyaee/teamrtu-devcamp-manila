import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

type AppSlice = {
  preferredLanguage: "fil-PH" | "ceb-PH";
  setPreferredLanguage: (value: "fil-PH" | "ceb-PH") => void;
  floodBuddyPhone: string;
  setFloodBuddyPhone: (value: string) => void;
};

const AppSliceContext = createContext<AppSlice | null>(null);

type ProviderProps = {
  children: ReactNode;
};

export function AppSliceProvider({ children }: ProviderProps) {
  const [preferredLanguage, setPreferredLanguage] = useState<
    "fil-PH" | "ceb-PH"
  >("fil-PH");
  const [floodBuddyPhone, setFloodBuddyPhone] = useState<string>("09171234567");

  const value = useMemo(
    () => ({
      preferredLanguage,
      setPreferredLanguage,
      floodBuddyPhone,
      setFloodBuddyPhone,
    }),
    [preferredLanguage, floodBuddyPhone],
  );

  return (
    <AppSliceContext.Provider value={value}>
      {children}
    </AppSliceContext.Provider>
  );
}

export function useAppSlice() {
  const value = useContext(AppSliceContext);
  if (!value) {
    throw new Error("useAppSlice must be used inside AppSliceProvider");
  }
  return value;
}

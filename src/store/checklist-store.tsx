/**
 * Shared Checklist Store
 *
 * Provides a React context-based store for checklist state that is shared
 * across all pages in the app. This enables the AI chatbot in `request-help`
 * to generate/update checklists that are immediately visible on the home
 * screen, preparedness tab, and any other consumer.
 *
 * Sync strategy:
 * - State lives in context (single source of truth in memory).
 * - Persisted to AsyncStorage on every mutation for offline resilience.
 * - An EventEmitter broadcasts `checklist.updated` so imperative
 *   subscribers (outside React tree) can react if needed.
 */

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ChecklistCategory, ChecklistItem } from "@/src/types/ai";
import { readJson, writeJson } from "@/src/features/offline/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChecklistEntry = {
  id: string;
  label: string;
  category: ChecklistCategory;
  done: boolean;
  priority: "normal" | "high";
  updatedAt: number;
};

export type Checklist = {
  id: string;
  helpRequestId: string | null;
  title: string;
  items: ChecklistEntry[];
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// Event emitter (lightweight, no deps)
// ---------------------------------------------------------------------------

type ChecklistEventType = "checklist.updated" | "checklist.cleared";
type ChecklistEventListener = (checklist: Checklist) => void;

class ChecklistEventBus {
  private listeners = new Map<
    ChecklistEventType,
    Set<ChecklistEventListener>
  >();

  on(event: ChecklistEventType, fn: ChecklistEventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
    return () => {
      this.listeners.get(event)?.delete(fn);
    };
  }

  emit(event: ChecklistEventType, checklist: Checklist) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(checklist);
      } catch (e) {
        console.error("[ChecklistEventBus] listener error:", e);
      }
    });
  }
}

export const checklistEvents = new ChecklistEventBus();

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "agos:shared-checklist";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_ITEMS: ChecklistEntry[] = [
  {
    id: "default-1",
    label: "Ihanda ang flashlight at extra battery.",
    category: "electronics",
    done: false,
    priority: "normal",
    updatedAt: Date.now(),
  },
  {
    id: "default-2",
    label: "Ilagay sa waterproof bag ang importanteng dokumento.",
    category: "documents",
    done: false,
    priority: "normal",
    updatedAt: Date.now(),
  },
  {
    id: "default-3",
    label: "Maghanda ng pagkain at tubig para sa 3 araw.",
    category: "food_water",
    done: false,
    priority: "normal",
    updatedAt: Date.now(),
  },
];

function makeDefaultChecklist(): Checklist {
  return {
    id: `checklist-${Date.now()}`,
    helpRequestId: null,
    title: "Emergency Preparedness Checklist",
    items: DEFAULT_ITEMS,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

type ChecklistStoreValue = {
  /** The current shared checklist */
  checklist: Checklist;

  /** Replace the entire checklist (e.g. AI-generated) */
  setChecklist: (checklist: Checklist) => void;

  /**
   * Merge AI-generated checklist items into the current checklist.
   * Deduplicates by label. New items are appended.
   * This is the primary method the chatbot calls after generating a checklist.
   */
  mergeAiChecklist: (items: ChecklistItem[], helpRequestId?: string) => void;

  /** Toggle a single item's done status */
  toggleItem: (itemId: string) => void;

  /** Add a single item */
  addItem: (
    label: string,
    category: ChecklistCategory,
    priority?: "normal" | "high",
  ) => void;

  /** Remove a single item */
  removeItem: (itemId: string) => void;

  /** Update item text */
  updateItemLabel: (itemId: string, label: string) => void;

  /** Clear all items and reset to defaults */
  resetChecklist: () => void;

  /** Whether the store has finished loading from AsyncStorage */
  loaded: boolean;
};

const ChecklistStoreContext = createContext<ChecklistStoreValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ChecklistStoreProvider({ children }: { children: ReactNode }) {
  const [checklist, setChecklistState] =
    useState<Checklist>(makeDefaultChecklist);
  const [loaded, setLoaded] = useState(false);
  const persistRef = useRef(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = await readJson<Checklist | null>(STORAGE_KEY, null);
      if (!cancelled && stored && stored.items) {
        setChecklistState(stored);
      }
      if (!cancelled) {
        setLoaded(true);
        persistRef.current = true;
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist + emit on every state change (after initial load)
  useEffect(() => {
    if (!persistRef.current) return;

    void writeJson(STORAGE_KEY, checklist);
    checklistEvents.emit("checklist.updated", checklist);
  }, [checklist]);

  // -- Mutations ----------------------------------------------------------

  const setChecklist = useCallback((next: Checklist) => {
    setChecklistState(next);
  }, []);

  const mergeAiChecklist = useCallback(
    (items: ChecklistItem[], helpRequestId?: string) => {
      setChecklistState((prev) => {
        const existingLabels = new Set(
          prev.items.map((t) => t.label.toLowerCase()),
        );

        const newEntries: ChecklistEntry[] = items
          .filter((item) => !existingLabels.has(item.label.toLowerCase()))
          .map((item, i) => ({
            id: `ai-${Date.now()}-${i}`,
            label: item.label,
            category: item.category,
            done: false,
            priority: "normal" as const,
            updatedAt: Date.now(),
          }));

        if (newEntries.length === 0 && !helpRequestId) return prev;

        return {
          ...prev,
          helpRequestId: helpRequestId ?? prev.helpRequestId,
          items: [...prev.items, ...newEntries],
          updatedAt: Date.now(),
        };
      });
    },
    [],
  );

  const toggleItem = useCallback((itemId: string) => {
    setChecklistState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, done: !item.done, updatedAt: Date.now() }
          : item,
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const addItem = useCallback(
    (
      label: string,
      category: ChecklistCategory,
      priority: "normal" | "high" = "normal",
    ) => {
      setChecklistState((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          {
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label,
            category,
            done: false,
            priority,
            updatedAt: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      }));
    },
    [],
  );

  const removeItem = useCallback((itemId: string) => {
    setChecklistState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
      updatedAt: Date.now(),
    }));
  }, []);

  const updateItemLabel = useCallback((itemId: string, label: string) => {
    setChecklistState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, label, updatedAt: Date.now() } : item,
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  const resetChecklist = useCallback(() => {
    setChecklistState(makeDefaultChecklist());
  }, []);

  // -- Context value ------------------------------------------------------

  const value = useMemo<ChecklistStoreValue>(
    () => ({
      checklist,
      setChecklist,
      mergeAiChecklist,
      toggleItem,
      addItem,
      removeItem,
      updateItemLabel,
      resetChecklist,
      loaded,
    }),
    [
      checklist,
      setChecklist,
      mergeAiChecklist,
      toggleItem,
      addItem,
      removeItem,
      updateItemLabel,
      resetChecklist,
      loaded,
    ],
  );

  return (
    <ChecklistStoreContext.Provider value={value}>
      {children}
    </ChecklistStoreContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChecklistStore(): ChecklistStoreValue {
  const value = useContext(ChecklistStoreContext);
  if (!value) {
    throw new Error(
      "useChecklistStore must be used inside ChecklistStoreProvider",
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Standalone subscription hook (for components outside the provider tree,
// or imperative listeners that want to refresh on checklist changes)
// ---------------------------------------------------------------------------

/**
 * Subscribe to checklist update events. Useful for refreshing data
 * in components that aren't direct consumers of the store context,
 * or for triggering side-effects when the checklist changes.
 *
 * @param callback - Called whenever the checklist is updated.
 */
export function useChecklistSubscription(
  callback: (checklist: Checklist) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const unsub = checklistEvents.on("checklist.updated", (cl) => {
      callbackRef.current(cl);
    });
    return unsub;
  }, []);
}

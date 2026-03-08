import { useCallback, useMemo, useState } from "react";

import type { ChecklistItem } from "@/src/types/ai";
import type { PreparednessTask } from "@/src/types/domain";

const initialTasks: PreparednessTask[] = [
  {
    id: "prep-1",
    label: "Ihanda ang flashlight at extra battery.",
    level: "easy",
    done: false,
  },
  {
    id: "prep-2",
    label: "Ilagay sa waterproof bag ang importanteng dokumento.",
    level: "moderate",
    done: false,
  },
  {
    id: "prep-3",
    label: "I-brief ang Flood Buddy kung saan kayo magkikita.",
    level: "complex",
    done: false,
  },
];

export function usePreparedness() {
  const [tasks, setTasks] = useState<PreparednessTask[]>(initialTasks);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  };

  const mergeAiChecklist = useCallback((items: ChecklistItem[]) => {
    setTasks((prev) => {
      const existingLabels = new Set(prev.map((t) => t.label.toLowerCase()));
      const newTasks: PreparednessTask[] = items
        .filter((item) => !existingLabels.has(item.label.toLowerCase()))
        .map((item, i) => ({
          id: `ai-${Date.now()}-${i}`,
          label: item.label,
          category: item.category,
          level: "moderate" as const,
          done: false,
        }));
      return [...prev, ...newTasks];
    });
  }, []);

  const completion = useMemo(() => {
    const done = tasks.filter((task) => task.done).length;
    return `${done}/${tasks.length}`;
  }, [tasks]);

  return { tasks, toggleTask, completion, mergeAiChecklist };
}

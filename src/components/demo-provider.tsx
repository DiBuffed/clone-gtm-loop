"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { initialState, persistedSchema, type DemoState } from "@/lib/domain";
const KEY = "ugc-z-demo-v1";
const Context = createContext<{
  state: DemoState;
  update: (fn: (s: DemoState) => DemoState) => void;
  ready: boolean;
  storageError: boolean;
} | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = persistedSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setState(parsed.data);
        else setStorageError(true);
      }
    } catch {
      setStorageError(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        setStorageError(true);
      }
    }
  }, [state, ready]);
  return (
    <Context.Provider value={{ state, update: setState, ready, storageError }}>
      {children}
    </Context.Provider>
  );
}
export function useDemo() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("DemoProvider missing");
  return ctx;
}

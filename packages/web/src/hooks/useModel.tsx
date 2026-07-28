"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Model } from "../types/chat";

interface ModelContextValue {
  model: Model;
  setModel: (model: Model) => void;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<Model>("claude-haiku-4-5-20251001");

  return (
    <ModelContext.Provider value={{ model, setModel }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModel(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) {
    throw new Error("useModel must be used within a <ModelProvider>");
  }
  return ctx;
}

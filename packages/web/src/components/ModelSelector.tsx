"use client";

import { useModel } from "../hooks/useModel";
import { Model } from "../types/chat";

export function ModelSelector() {
  const { model, setModel } = useModel();

  return (
    <select
      value={model}
      onChange={(e) => setModel(e.target.value as Model)}
      className="text-sm border rounded px-2 py-1 bg-white"
    >
      <option value="claude-haiku-4-5-20251001">Haiku (Fast)</option>
      <option value="claude-sonnet-4-6">Sonnet (Better)</option>
    </select>
  );
}

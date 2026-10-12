"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

type Props = { children?: ReactNode };

// The agent's final answer is Markdown (hub/format.ts): "## " sections, lists, bold labels.
// Each "## " section is rendered on its own, so the contradiction block can get its own
// highlighted box — it is the part the student must not miss (Contradictions are shown,
// never silently resolved).

const components: Components = {
  h1: ({ children }: Props) => <h3 className="text-base font-semibold mb-2">{children}</h3>,
  h2: ({ children }: Props) => <h4 className="font-semibold mt-3 mb-1">{children}</h4>,
  p: ({ children }: Props) => <p className="mb-2 whitespace-pre-wrap">{children}</p>,
  ul: ({ children }: Props) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: Props) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
  a: ({ children, href }: Props & { href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
      {children}
    </a>
  ),
};

// Splits before every "## " heading; the text before the first heading is its own section.
function splitSections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).filter((section) => section.trim() !== "");
}

const isContradiction = (section: string) => section.startsWith("## ⚠️ CONTRADICTION");

export function AnswerMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      {splitSections(content).map((section, i) =>
        isContradiction(section) ? (
          <div key={i} className="border-2 border-amber-400 bg-amber-50 rounded-xl px-3 py-2 my-2">
            <ReactMarkdown components={components}>{section}</ReactMarkdown>
          </div>
        ) : (
          <ReactMarkdown key={i} components={components}>
            {section}
          </ReactMarkdown>
        ),
      )}
    </div>
  );
}

// The agent's progress messages for one answer: open while it works, folded afterwards.
export function AgentSteps({ steps, working }: { steps?: string[]; working: boolean }) {
  if (!steps?.length) return null;
  return (
    <details open={working} className="mb-2 text-xs text-gray-500">
      <summary className="cursor-pointer select-none">
        {working ? "Working…" : `How the agent worked (${steps.length} steps)`}
      </summary>
      <ol className="mt-1 space-y-0.5 pl-1">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

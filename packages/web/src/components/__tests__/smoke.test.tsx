// src/components/__tests__/smoke.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("test infra smoke test", () => {
  it("renders something", () => {
    render(<button>Hello</button>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
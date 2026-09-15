import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// next/navigation mock — App Router hookok (useRouter, usePathname stb.)
// szükségesek, mert JSDOM-ban nincs valódi Next router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
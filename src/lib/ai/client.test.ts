import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { anthropic } = await import("./client");

afterEach(() => vi.unstubAllEnvs());

describe("anthropic", () => {
  it("uses the server's API key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(anthropic().apiKey).toBe("sk-test");
  });
  it("fails loudly without a key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => anthropic()).toThrow(/ANTHROPIC_API_KEY/);
  });
});

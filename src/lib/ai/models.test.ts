import { describe, expect, it } from "vitest";
import { costUsd, MODELS } from "./models";

describe("costUsd", () => {
  it("prices input and output tokens", () => {
    expect(costUsd(MODELS.extract, { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
  });
  it("prices cache writes at 1.25x and cache reads at 0.1x input", () => {
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 };
    expect(costUsd(MODELS.tag, usage)).toBeCloseTo(0.135);
  });
  it("treats missing cache counts as zero", () => {
    expect(costUsd(MODELS.tag, { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null })).toBe(0);
  });
  it("refuses to guess the price of an unknown model", () => {
    expect(() => costUsd("other", { input_tokens: 1, output_tokens: 1 })).toThrow(/No price/);
  });
});

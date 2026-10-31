// Models the pipeline uses, and their list prices in USD per million tokens.
// Cache writes cost 1.25x input and cache reads 0.1x input (5-minute cache).
export const MODELS = {
  extract: "claude-sonnet-5-5", // reads paper PDFs, diagrams and formulas
  tag: "claude-haiku-5-5", // picks chapter/topic/concept ids from a closed list
} as const;

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costUsd(model: string, usage: Usage): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price for model ${model}`);
  const inputEquivalent =
    usage.input_tokens + 1.25 * (usage.cache_creation_input_tokens ?? 0) + 0.1 * (usage.cache_read_input_tokens ?? 0);
  return (inputEquivalent * price.input + usage.output_tokens * price.output) / 1_000_000;
}

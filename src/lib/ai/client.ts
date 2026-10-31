import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic API client.
 * @throws When ANTHROPIC_API_KEY isn't set.
 */
export function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

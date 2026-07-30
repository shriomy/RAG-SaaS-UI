/**
 * Model picker suggestions.
 *
 * The backend accepts ANY OpenRouter slug — it never validates against a list —
 * so this is a convenience datalist, not a whitelist. The authoritative catalogue
 * (and current pricing) is at https://openrouter.ai/models; slugs there change
 * over time, so treat these as starting points and type any slug you like.
 */

export type ModelSuggestion = {
  slug: string;
  label: string;
  note: string;
};

export const MODEL_SUGGESTIONS: ModelSuggestion[] = [
  {
    slug: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    note: "Cheap and fast — a good default",
  },
  { slug: "openai/gpt-4o", label: "GPT-4o", note: "Stronger reasoning" },
  {
    slug: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    note: "Strong at long context and writing",
  },
  {
    slug: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    note: "Very fast, large context",
  },
  {
    slug: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    note: "Open weights",
  },
  {
    slug: "deepseek/deepseek-chat",
    label: "DeepSeek Chat",
    note: "Low cost per token",
  },
];

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";

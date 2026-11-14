// TEMPORARY diagnostics: measures where Gemini gets slow. Dev only. Delete when done.
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { geminiOutputSchema } from "@/lib/schemas";
import { latestResearch } from "@/lib/research-store";

const tinySchema = z.object({ answer: z.string(), confidence: z.enum(["low", "medium", "high"]) });

function evidence(chars: number) {
  const blocks = latestResearch(15).map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.highlights.join(" … ").slice(0, 1000)}`);
  return blocks.join("\n\n").slice(0, chars);
}

const SYSTEM = "You are Chilly, a personal assistant. Only state facts supported by the evidence and cite them by evidence number. Write in the user's language.";
const TASK = "I'm an international student in Finland. Which benefits can I apply for?";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });

  const url = new URL(request.url);
  const test = url.searchParams.get("test") ?? "";
  const model = url.searchParams.get("model") ?? "gemini-3.8-flash";
  const thinking = url.searchParams.get("thinking") ?? "low";
  const chars = Number(url.searchParams.get("chars") ?? 5000);

  // Lists models this key can use for generation. Free: no tokens are generated.
  if (test === "models") {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": apiKey } });
    const body = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    return Response.json({
      status: res.status,
      models: (body.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name.replace("models/", "")),
    });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const providerOptions = { google: { thinkingConfig: thinking === "none" ? {} : { thinkingLevel: thinking } } };
  const common = { model: google(model), maxRetries: 0, abortSignal: AbortSignal.timeout(90_000), providerOptions } as const;
  const ev = evidence(chars);
  const startedAt = Date.now();

  try {
    let usage, output;
    if (test === "text") {
      ({ usage, text: output } = await generateText({ ...common, prompt: "Reply with exactly: ok" }));
    } else if (test === "tiny-schema") {
      ({ usage, object: output } = await generateObject({ ...common, schema: tinySchema, prompt: "Is Helsinki the capital of Finland?" }));
    } else if (test === "full-schema") {
      ({ usage, object: output } = await generateObject({ ...common, schema: geminiOutputSchema, system: SYSTEM, prompt: `User task:\n${TASK}\n\nEvidence:\n(no evidence)` }));
    } else if (test === "evidence-text") {
      ({ usage, text: output } = await generateText({ ...common, system: SYSTEM, prompt: `User task:\n${TASK}\n\nEvidence:\n${ev}\n\nAnswer in under 150 words with citations.` }));
    } else if (test === "evidence-full") {
      ({ usage, object: output } = await generateObject({ ...common, schema: geminiOutputSchema, system: SYSTEM, prompt: `User task:\n${TASK}\n\nEvidence:\n${ev}` }));
    } else {
      return Response.json({ error: "test must be one of: models, text, tiny-schema, full-schema, evidence-text, evidence-full" }, { status: 400 });
    }
    return Response.json({
      test, model, thinking, evidenceChars: test.startsWith("evidence") ? ev.length : 0,
      ms: Date.now() - startedAt, usage,
      outputChars: JSON.stringify(output).length,
    });
  } catch (error) {
    const e = error as { name?: string; message?: string; statusCode?: number };
    return Response.json({ test, model, thinking, ms: Date.now() - startedAt, error: `${e.name}: ${e.statusCode ?? ""} ${(e.message ?? "").slice(0, 1500)}` });
  }
}

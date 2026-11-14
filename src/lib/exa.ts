import "server-only";
import Exa from "exa-js";

export function getExaClient() {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is missing. Add it to .env.local to create a research-backed draft.");
  return new Exa(apiKey);
}

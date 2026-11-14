import { z } from "zod";

export const blueprintSchema = z.object({
  trackName: z.string().min(1).describe("The most relevant Junction track or challenge"),
  coreStrategy: z.string().min(1).describe("A focused strategy for a strong hackathon submission"),
  techStack: z.array(z.string()).min(1).describe("Suggested technologies with a short rationale"),
  actionSteps: z.array(z.string()).min(3).max(6).describe("Concrete steps the team can complete during the event"),
});

export type Blueprint = z.infer<typeof blueprintSchema>;

export const draftInputSchema = z.object({ prompt: z.string().trim().min(8).max(1200) });

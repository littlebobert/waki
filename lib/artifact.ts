import { z } from "zod";

export const actionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  due: z.string(),
  done: z.boolean(),
});

const acceptanceCriterionSchema = z.object({
  id: z.string(),
  criterion: z.string(),
  verification: z.enum(["build", "playwright", "manual"]),
});

export const artifactSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  summary: z.string(),
  progress: z.number().min(0).max(100),
  metrics: z.array(z.object({ label: z.string(), value: z.string(), detail: z.string() })).length(3),
  actions: z.array(actionItemSchema).min(1).max(8),
  decisions: z.array(z.object({ title: z.string(), detail: z.string() })).min(1).max(5),
  risks: z.array(z.string()).max(5),
  proposals: z.array(z.object({ title: z.string(), status: z.enum(["proposed", "accepted", "rejected", "unresolved"]) })).max(8),
  constraints: z.array(z.string()).max(8),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1).max(10),
  relevantFrameIds: z.array(z.string()).max(12),
});

export const evidenceMapSchema = z.object({
  topics: z.array(z.object({
    title: z.string(),
    transcriptEvidence: z.array(z.string()),
    relevantFrameIds: z.array(z.string()),
  })).min(1).max(12),
  proposals: z.array(z.object({
    title: z.string(),
    status: z.enum(["proposed", "accepted", "rejected", "unresolved"]),
    evidence: z.string(),
  })).max(12),
  decisions: z.array(z.object({ title: z.string(), evidence: z.string() })).max(10),
  constraints: z.array(z.object({ constraint: z.string(), evidence: z.string() })).max(10),
  frameSelectionInsufficient: z.boolean(),
});

export type EvidenceMap = z.infer<typeof evidenceMapSchema>;

export type Artifact = z.infer<typeof artifactSchema>;

export const sampleTranscript = `Maya: We have three weeks until the beta launch. The landing page is done, but onboarding is still the biggest risk.

Kenji: I'll own the onboarding flow and get a testable version ready by Friday. We should keep the beta to 50 teams so support doesn't get overwhelmed.

Maya: Agreed. Let's make 50 teams the cap. Our north-star metric should be teams that create their first project within ten minutes.

Luis: I can recruit 12 design partners by next Wednesday. We have eight confirmed already. The concern is analytics — we're not tracking time-to-first-project yet.

Maya: Great. Luis owns recruitment, Kenji owns onboarding, and I'll work with data to add that event by Monday. Let's review progress next Thursday.`;

export const sampleArtifact: Artifact = {
  title: "Beta launch command center",
  subtitle: "A live workspace shaped from today’s product sync",
  summary: "The team aligned on a focused 50-team beta, with onboarding speed as the primary measure of activation.",
  progress: 42,
  metrics: [
    { label: "Beta capacity", value: "50", detail: "teams maximum" },
    { label: "Design partners", value: "8 / 12", detail: "confirmed" },
    { label: "Activation target", value: "< 10m", detail: "to first project" },
  ],
  actions: [
    { id: "a1", title: "Ship testable onboarding flow", owner: "Kenji", due: "Friday", done: false },
    { id: "a2", title: "Recruit 12 design partners", owner: "Luis", due: "Next Wednesday", done: false },
    { id: "a3", title: "Instrument time-to-first-project", owner: "Maya", due: "Monday", done: false },
    { id: "a4", title: "Review beta readiness", owner: "Team", due: "Next Thursday", done: false },
  ],
  decisions: [
    { title: "Cap beta at 50 teams", detail: "Keep the launch focused and avoid overwhelming support." },
    { title: "Use activation speed as north star", detail: "Measure whether teams create a first project within ten minutes." },
  ],
  risks: ["Onboarding remains the critical path", "Activation analytics are not instrumented yet"],
  proposals: [
    { title: "Limit beta enrollment to 50 teams", status: "accepted" },
    { title: "Use time-to-first-project as the north-star metric", status: "accepted" },
  ],
  constraints: ["Support capacity limits the beta to 50 teams", "Activation must be measurable within ten minutes"],
  acceptanceCriteria: [
    { id: "ac1", criterion: "Production build completes without errors", verification: "build" },
    { id: "ac2", criterion: "A user can complete onboarding and create a first project", verification: "playwright" },
    { id: "ac3", criterion: "Time-to-first-project analytics event is recorded", verification: "playwright" },
  ],
  relevantFrameIds: [],
};

export function generateDemoArtifact(transcript: string): Artifact {
  const people = Array.from(transcript.matchAll(/(?:^|\n)([A-Z][a-z]+):/g), (match) => match[1]);
  const owners = [...new Set(people)];
  const sentence = transcript.split(/[.!?]\n?/).find((part) => part.trim().length > 45)?.trim();

  return {
    ...sampleArtifact,
    summary: sentence ? `${sentence}.` : sampleArtifact.summary,
    actions: sampleArtifact.actions.map((action, index) => ({
      ...action,
      owner: owners[index % Math.max(owners.length, 1)] ?? action.owner,
    })),
  };
}

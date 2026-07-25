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

export const sampleTranscript = `Marcus: Can we get this regional sales sheet as an actual dashboard instead of squinting at cells every week?

Priya: Yes. Revenue should be filterable by region, and I want conversion next to it so we can see why APAC is soft.

Marcus: Make the default view monthly, but give us a weekly toggle for the pipeline review.

Waki: On it — building from Priya's shared spreadsheet now.

Priya: Great. Flag APAC clearly; June revenue is down 4.3% from May even though North America is up.`;

export const sampleArtifact: Artifact = {
  title: "Q3 Revenue Dashboard",
  subtitle: "Live from regional_sales_q3.xlsx · updated in this meeting",
  summary: "The raw regional sales sheet is now a filterable view of monthly revenue and conversion, with APAC highlighted for follow-up.",
  progress: 96,
  metrics: [
    { label: "Revenue · Jun", value: "$1.66M", detail: "▲ 5.1% vs May" },
    { label: "Best conversion", value: "NA · 4.2%", detail: "▲ 0.3 pts" },
    { label: "Flagged in meeting", value: "APAC", detail: "▼ 4.3% vs May" },
  ],
  actions: [
    { id: "a1", title: "Review APAC pipeline softness", owner: "Priya", due: "Friday", done: false },
    { id: "a2", title: "Add conversion trend line", owner: "Waki", due: "In meeting", done: false },
    { id: "a3", title: "Share dashboard with RevOps", owner: "Marcus", due: "Today", done: false },
  ],
  decisions: [
    { title: "Default to monthly revenue", detail: "Keep a weekly toggle for pipeline reviews." },
    { title: "Show conversion beside revenue", detail: "Make regional performance explainable, not just visible." },
  ],
  risks: ["APAC June revenue declined despite broader growth"],
  proposals: [
    { title: "Replace the weekly spreadsheet review with a live dashboard", status: "accepted" },
    { title: "Add conversion trend by region", status: "accepted" },
  ],
  constraints: ["Use the figures visible in regional_sales_q3.xlsx", "Support monthly and weekly views"],
  acceptanceCriteria: [
    { id: "ac1", criterion: "Region filters update the visible dashboard", verification: "playwright" },
    { id: "ac2", criterion: "Monthly and weekly views can be selected", verification: "playwright" },
    { id: "ac3", criterion: "Production build completes without errors", verification: "build" },
  ],
  relevantFrameIds: ["regional-sales-sheet"],
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

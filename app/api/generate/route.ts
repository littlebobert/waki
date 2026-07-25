import {
  artifactSchema,
  evidenceMapSchema,
  generateDemoArtifact,
  type EvidenceMap,
} from "@/lib/artifact";

export const runtime = "nodejs";

const evidencePrompt = `You are the first pass of a multimodal product analysis pipeline.
Jointly analyze the meeting transcript and supplied screen frames. Return only valid JSON.
Segment the discussion into topics and extract proposals, final decisions, constraints, and their direct evidence.
Select only screen frame IDs that materially support each topic. Do not invent facts.
If the selected keyframes do not contain enough visual evidence, set frameSelectionInsufficient to true.
JSON shape:
{
  "topics": [{"title": string, "transcriptEvidence": string[], "relevantFrameIds": string[]}],
  "proposals": [{"title": string, "status": "proposed" | "accepted" | "rejected" | "unresolved", "evidence": string}],
  "decisions": [{"title": string, "evidence": string}],
  "constraints": [{"constraint": string, "evidence": string}],
  "frameSelectionInsufficient": boolean
}`;

const appSpecPrompt = `You are the second pass of a product analysis pipeline.
Convert the supplied evidence map into a concise, implementation-ready AppSpec. Return only valid JSON.
Every claim must be grounded in the evidence map. Acceptance criteria must be observable and identify deterministic verification where possible.
An LLM judge may later provide qualitative feedback, but never use it as a replacement for production builds or Playwright tests.
JSON shape:
{
  "title": string,
  "subtitle": string,
  "summary": string,
  "progress": number from 0 to 100,
  "metrics": exactly 3 objects with "label", "value", "detail",
  "actions": 1-8 objects with unique string "id", "title", "owner", "due", "done" false,
  "decisions": 1-5 objects with "title", "detail",
  "risks": up to 5 strings,
  "proposals": up to 8 objects with "title" and "status" ("proposed" | "accepted" | "rejected" | "unresolved"),
  "constraints": up to 8 strings,
  "acceptanceCriteria": 1-10 objects with unique string "id", "criterion", and "verification" ("build" | "playwright" | "manual"),
  "relevantFrameIds": up to 12 strings
}
Use "Unassigned" or "Not set" when needed. Keep copy concise.`;

type Keyframe = { id: string; imageUrl: string; timestamp?: string };

type QwenContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } };

function getQwenConfig() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  return { apiKey, baseUrl, model: process.env.QWEN_MODEL || "qwen3.7-plus" };
}

async function callQwen(system: string, content: string | QwenContent[]) {
  const { apiKey, baseUrl, model } = getQwenConfig();
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not configured");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.1,
      enable_thinking: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });

  if (!response.ok) throw new Error(`QwenCloud returned ${response.status}`);
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content;
  if (typeof result !== "string") throw new Error("QwenCloud returned no content");
  return JSON.parse(result);
}

function validMediaUrl(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("https://") || value.startsWith("data:"));
}

async function extractEvidence(transcript: string, keyframes: Keyframe[], fullVideoUrl?: string) {
  const frameManifest = keyframes.map(({ id, timestamp }) => ({ id, timestamp: timestamp || "Not set" }));
  const content: QwenContent[] = [
    {
      type: "text",
      text: `Transcript:\n${transcript}\n\nKeyframe manifest:\n${JSON.stringify(frameManifest)}`,
    },
    ...keyframes.map<QwenContent>((frame) => ({
      type: "image_url",
      image_url: { url: frame.imageUrl },
    })),
  ];

  let evidence = evidenceMapSchema.parse(await callQwen(evidencePrompt, content));

  if (evidence.frameSelectionInsufficient && fullVideoUrl) {
    evidence = evidenceMapSchema.parse(await callQwen(evidencePrompt, [
      {
        type: "text",
        text: `Keyframes were insufficient. Analyze this full video with the transcript.\n\nTranscript:\n${transcript}`,
      },
      { type: "video_url", video_url: { url: fullVideoUrl } },
    ]));
  }

  return evidence;
}

async function generateAppSpec(evidence: EvidenceMap) {
  return artifactSchema.parse(await callQwen(appSpecPrompt, JSON.stringify(evidence)));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";

  if (transcript.length < 40) {
    return Response.json({ error: "Add a little more meeting context first." }, { status: 400 });
  }

  const keyframes: Keyframe[] = Array.isArray(body?.keyframes)
    ? body.keyframes
        .filter((frame: unknown): frame is Keyframe => {
          if (!frame || typeof frame !== "object") return false;
          const candidate = frame as Record<string, unknown>;
          return typeof candidate.id === "string" && validMediaUrl(candidate.imageUrl);
        })
        .slice(0, 12)
    : [];
  const fullVideoUrl = validMediaUrl(body?.fullVideoUrl) ? body.fullVideoUrl : undefined;

  if (!process.env.DASHSCOPE_API_KEY) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return Response.json({ artifact: generateDemoArtifact(transcript), mode: "demo" });
  }

  try {
    const evidence = await extractEvidence(transcript, keyframes, fullVideoUrl);
    const artifact = await generateAppSpec(evidence);
    return Response.json({ artifact, evidence, mode: "live" });
  } catch (error) {
    console.error("QwenCloud AppSpec generation failed", error);
    return Response.json({ artifact: generateDemoArtifact(transcript), mode: "fallback" });
  }
}

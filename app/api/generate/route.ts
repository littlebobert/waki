import { artifactSchema, generateDemoArtifact } from "@/lib/artifact";

export const runtime = "nodejs";

const systemPrompt = `You turn meeting transcripts into compact, useful project command centers.
Return only JSON matching this shape:
{
  "title": string,
  "subtitle": string,
  "summary": string,
  "progress": number from 0 to 100,
  "metrics": exactly 3 objects with "label", "value", "detail",
  "actions": 1-8 objects with unique string "id", "title", "owner", "due", "done" false,
  "decisions": 1-5 objects with "title", "detail",
  "risks": up to 5 strings
}
Use only facts supported by the transcript. Use "Unassigned" or "Not set" when needed. Keep copy concise.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";

  if (transcript.length < 40) {
    return Response.json({ error: "Add a little more meeting context first." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return Response.json({ artifact: generateDemoArtifact(transcript), mode: "demo" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const artifact = artifactSchema.parse(JSON.parse(content));
    return Response.json({ artifact, mode: "live" });
  } catch (error) {
    console.error("Artifact generation failed", error);
    return Response.json({ artifact: generateDemoArtifact(transcript), mode: "fallback" });
  }
}

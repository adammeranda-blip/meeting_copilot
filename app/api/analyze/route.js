import OpenAI from "openai";

export const runtime = "nodejs"; // ensure Node runtime on Vercel

export async function GET() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "API route is up. Send a POST with multipart/form-data field 'audio'.",
      hasKey: !!process.env.OPENAI_API_KEY
    }),
    { headers: { "content-type": "application/json" } }
  );
}

function badRequest(msg, extra = {}) {
  return new Response(JSON.stringify({ error: msg, ...extra }), {
    status: 400,
    headers: { "content-type": "application/json" }
  });
}

export async function POST(req) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return badRequest("Missing OPENAI_API_KEY env var");

    const form = await req.formData();
    const audio = form.get("audio");
    if (!audio) return badRequest("Missing form field: audio");

    const client = new OpenAI({ apiKey });

    // 1) Transcribe
    // Models supported include gpt-4o-mini-transcribe / gpt-4o-transcribe / whisper-1. :contentReference[oaicite:4]{index=4}
    const transcriptResp = await client.audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe"
    });

    const transcript = transcriptResp.text || "";

    // 2) Coach using Structured Outputs (JSON schema)
    const schema = {
      name: "coach_output",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_summary: { type: "string" },
          answer_outline: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 7 },
          talking_points: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 }
        },
        required: ["question_summary", "answer_outline", "talking_points"]
      },
      strict: true
    };

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You are a meeting copilot . " +
            "Given a transcript of room audio (attendees + candidate mixed), " +
            "infer the most recent likely question and provide structure + talking points. " +
            "Do NOT provide a word-for-word script; keep it to adaptable bullet points."
        },
        {
          role: "user",
          content: `Transcript:\n${transcript}`
        }
      ],
      text: {
        format: { type: "json_schema", json_schema: schema }
      }
    });

    const jsonText = resp.output_text; // JSON string per schema
    const coach = JSON.parse(jsonText);

    return new Response(
      JSON.stringify({
        transcript,
        ...coach
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", details: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}

// app/api/analyze/route.js
import OpenAI from "openai";

export const runtime = "nodejs"; // ensure Node runtime on Vercel

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}

// Optional: lets you hit /api/analyze in a browser without 405
export async function GET() {
  return json(200, {
    ok: true,
    message: "Send a POST multipart/form-data with field 'audio' (a recorded file).",
    hasKey: !!process.env.OPENAI_API_KEY
  });
}

export async function POST(req) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(500, {
        error: "Server error",
        status: 500,
        message: "Missing OPENAI_API_KEY in environment variables"
      });
    }

    const form = await req.formData();
    const audio = form.get("audio");

    if (!audio) {
      return json(400, { error: "Missing form field: audio" });
    }

    // Basic validation: must be a File/Blob-like object
    if (typeof audio !== "object" || typeof audio.arrayBuffer !== "function") {
      return json(400, {
        error: "Invalid audio field",
        message: "Expected a file upload in multipart/form-data under key 'audio'."
      });
    }

    const client = new OpenAI({ apiKey });

    // 1) Transcribe audio
    // You can swap the model if needed:
    // - "gpt-4o-mini-transcribe" (fast/cheap)
    // - "gpt-4o-transcribe" (higher quality)
    // - "whisper-1" (legacy)
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe"
    });

    const transcript = transcription?.text?.trim?.() || "";
    if (!transcript) {
      return json(200, {
        transcript: "",
        question_summary: "",
        answer_outline: [],
        talking_points: [],
        note: "Transcription returned empty text. Try a shorter clip and keep phone closer to speakers/your voice."
      });
    }

    // 2) Coach output via Structured Outputs (JSON schema)
    const schema = {
      name: "coach_output",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_summary: { type: "string" },
          answer_outline: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 7
          },
          talking_points: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 6
          }
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
            "You are an interview practice coach. The transcript is room audio (interviewer + candidate mixed). " +
            "Infer the most recent likely interview question and give structure + talking points. " +
            "Do NOT provide a word-for-word script; keep it adaptable bullet points."
        },
        { role: "user", content: `Transcript:\n${transcript}` }
      ],
      text: {
        format: { type: "json_schema", json_schema: schema }
      }
    });

    // The SDK exposes the formatted output text as a string
    const raw = resp?.output_text;
    if (!raw) {
      return json(500, {
        error: "Server error",
        status: 500,
        message: "No output_text returned from responses.create"
      });
    }

    let coach;
    try {
      coach = JSON.parse(raw);
    } catch {
      return json(500, {
        error: "Server error",
        status: 500,
        message: "Failed to parse JSON from model output",
        raw
      });
    }

    return json(200, {
      transcript,
      ...coach
    });
  } catch (e) {
    console.error("Analyze error:", e);

    // Try to surface the most useful error info to the client
    const status = e?.status || e?.response?.status || 500;
    const message =
      e?.message ||
      e?.error?.message ||
      e?.response?.data?.error?.message ||
      e?.response?.data ||
      String(e);

    return json(500, {
      error: "Server error",
      status,
      message
    });
  }
}

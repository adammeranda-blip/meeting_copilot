"use client";

import { useRef, useState } from "react";

export default function Home() {
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [status, setStatus] = useState("Ready");
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null);

  async function startRecording() {
    setResult(null);
    setStatus("Requesting microphone permission…");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];

    const preferredTypes = [
  "audio/mp4",              // best for iOS (sometimes supported)
  "audio/webm;codecs=opus", // best for Android/Chrome
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg"
];

let mimeType = "";
for (const t of preferredTypes) {
  if (MediaRecorder.isTypeSupported(t)) {
    mimeType = t;
    break;
  }
}

const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
    };

    mr.start();
    setIsRecording(true);
    setStatus("Recording… (phone mic)");
    setSeconds(0);

    // simple timer
    const start = Date.now();
    const timer = setInterval(() => {
      if (!mediaRecorderRef.current) return;
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 250);

    // keep timer reference via recorder
    mr._timer = timer;
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;

    clearInterval(mr._timer);
    setIsRecording(false);
    setStatus("Preparing upload…");

    mr.stop();
    mediaRecorderRef.current = null;

    // Build audio file
const type = mimeType || (chunksRef.current[0]?.type ?? "audio/webm");
const blob = new Blob(chunksRef.current, { type });

let ext = "webm";
if (type.includes("mp4")) ext = "mp4";
else if (type.includes("ogg")) ext = "ogg";

const file = new File([blob], `audio.${ext}`, { type });


    const fd = new FormData();
    fd.append("audio", file);

    setStatus("Uploading + analyzing…");
    const resp = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await resp.json();

    if (!resp.ok) {
      setStatus("Error (see details below)");
      setResult({ error: data?.error || "Unknown error", details: data });
      return;
    }

    setResult(data);
    setStatus("Done");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h2 style={{ marginBottom: 6 }}>Phone Interview Copilot (Room Audio)</h2>
      <div style={{ color: "#555", marginBottom: 12 }}>
        Place your phone near your computer speakers. Record 20–60s chunks for best results.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        {!isRecording ? (
          <button onClick={startRecording} style={btnStyle}>Start</button>
        ) : (
          <button onClick={stopRecording} style={btnStyle}>Stop</button>
        )}
        <div><b>Status:</b> {status}{isRecording ? ` (${seconds}s)` : ""}</div>
      </div>

      {result?.error && (
        <pre style={preStyle}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}

      {result && !result.error && (
        <>
          <section style={cardStyle}>
            <h3>Transcript</h3>
            <pre style={preStyle}>{result.transcript}</pre>
          </section>

          <section style={cardStyle}>
            <h3>What they’re asking</h3>
            <div>{result.question_summary}</div>
          </section>

          <section style={cardStyle}>
            <h3>Answer outline</h3>
            <ul>
              {result.answer_outline?.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>

          <section style={cardStyle}>
            <h3>Talking points</h3>
            <ul>
              {result.talking_points?.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

const btnStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "white",
  fontWeight: 600
};

const cardStyle = {
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  padding: 12,
  marginTop: 12
};

const preStyle = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "#fafafa",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #eee",
  marginTop: 8
};

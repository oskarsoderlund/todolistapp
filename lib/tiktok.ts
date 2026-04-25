import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

const FRAME_COUNT = 6;
const FRAME_WIDTH = 512;

export async function analyzeTikTokVideo(url: string): Promise<string> {
  const canonicalUrl = await resolveTikTokUrl(url);
  const workDir = await mkdtemp(join(tmpdir(), "tiktok-"));

  try {
    const videoPath = join(workDir, "video.mp4");
    await run("yt-dlp", [
      "--no-warnings",
      "--no-playlist",
      "-f",
      "mp4/bestvideo*+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "-o",
      videoPath,
      canonicalUrl,
    ]);

    const framesPattern = join(workDir, "frame-%03d.jpg");
    await run("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vf",
      `thumbnail,scale=${FRAME_WIDTH}:-1`,
      "-frames:v",
      String(FRAME_COUNT),
      "-vsync",
      "vfr",
      framesPattern,
    ]);

    const audioPath = join(workDir, "audio.mp3");
    await run("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "5",
      audioPath,
    ]);

    const transcript = await transcribeAudio(audioPath);
    const frames = await readFrames(workDir);

    if (frames.length === 0) {
      throw new Error("Inga bildrutor kunde extraheras från videon.");
    }

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-5"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analysera denna TikTok-video. Ge en koncis sammanfattning på svenska (2-4 meningar) som beskriver vad videon handlar om, vad som händer visuellt och vad som sägs. Avsluta med en kort mening om videons budskap eller poäng.\n\n" +
                `Källa: ${canonicalUrl}\n\n` +
                `Transkription av ljudspåret:\n${transcript || "(inget tal eller ljud kunde transkriberas)"}\n\n` +
                `Bildrutorna nedan är ${frames.length} stycken stillbilder utvalda jämnt över videon.`,
            },
            ...frames.map((image) => ({
              type: "image" as const,
              image,
              mimeType: "image/jpeg" as const,
            })),
          ],
        },
      ],
    });

    return text;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function resolveTikTokUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}

async function readFrames(dir: string): Promise<Buffer[]> {
  const entries = await readdir(dir);
  const frameFiles = entries
    .filter((f) => f.startsWith("frame-") && f.endsWith(".jpg"))
    .sort();
  return Promise.all(frameFiles.map((f) => readFile(join(dir, f))));
}

async function transcribeAudio(audioPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY saknas — krävs för Whisper-transkription av TikTok-ljud.",
    );
  }
  const audio = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper-API svarade ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  return json.text ?? "";
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${cmd} avslutades med kod ${code}: ${stderr.slice(-400).trim()}`,
          ),
        );
      }
    });
  });
}

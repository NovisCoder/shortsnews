/**
 * 쇼츠뉴스 영상 생성 파이프라인 (Node.js / TypeScript)
 * Gemini TTS (HTTP) + ffmpeg으로 9:16 쇼츠 MP4 생성
 *
 * 섹션별로:
 *  1. Gemini TTS → PCM → WAV
 *  2. ffmpeg drawtext 자막 + 그라디언트 배경 슬라이드 생성
 *  3. 전체 concat → 최종 MP4
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import https from "https";

const execFileAsync = promisify(execFile);

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc";

// Section background gradient colors (dark, moody)
const SECTION_COLORS: Record<string, [string, string]> = {
  opening: ["0x0a0a1a", "0x1a1a3e"],
  topic_intro: ["0x0d1117", "0x1a2744"],
  summary: ["0x0f1923", "0x1a3044"],
  what_happened: ["0x0d1f0d", "0x1a3020"],
  daily_impact: ["0x1a0d0d", "0x2a1a1a"],
  flex_line: ["0x1a1a0d", "0x2a2a1a"],
};

const SECTION_ACCENT: Record<string, string> = {
  opening: "0x4fc3f7",
  topic_intro: "0x29b6f6",
  summary: "0x26c6da",
  what_happened: "0x66bb6a",
  daily_impact: "0xef9a9a",
  flex_line: "0xffd54f",
};

// ─── PCM → WAV header ────────────────────────────────────────────────────────
function pcmToWav(pcmBuf: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const dataLen = pcmBuf.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcmBuf]);
}

// ─── Gemini TTS ───────────────────────────────────────────────────────────────
async function generateTTS(
  text: string,
  voiceName: string,
  apiKey: string
): Promise<{ wavBuffer: Buffer; duration: number }> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  });

  const pcmB64 = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const json = JSON.parse(Buffer.concat(chunks).toString());
          if (json.error) return reject(new Error(json.error.message));
          const parts = json?.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData) return resolve(part.inlineData.data);
          }
          reject(new Error("No audio in Gemini TTS response"));
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  const pcmBuf = Buffer.from(pcmB64, "base64");
  const wavBuffer = pcmToWav(pcmBuf);
  // Duration: PCM samples = bytes/2 (16-bit), duration = samples / sampleRate
  const duration = pcmBuf.length / 2 / 24000;
  return { wavBuffer, duration };
}

// ─── Escape ffmpeg drawtext string ───────────────────────────────────────────
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019") // replace apostrophe with curly one to avoid shell issues
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// Word-wrap Korean text (max ~14 chars per line for 1080px)
function wrapText(text: string, maxChars = 14): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length <= maxChars) {
      cur = cur ? cur + " " + w : w;
    } else {
      if (cur) lines.push(cur);
      // If single word is too long, split by chars
      if (w.length > maxChars) {
        for (let i = 0; i < w.length; i += maxChars) lines.push(w.slice(i, i + maxChars));
        cur = "";
      } else {
        cur = w;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

// ─── Build one video segment (image + audio) ─────────────────────────────────
async function buildSegment(params: {
  key: string;
  label: string;
  text: string;
  duration: number;
  audioPath: string;
  outputPath: string;
  segIndex: number;
  totalSegs: number;
}): Promise<void> {
  const { key, label, text, duration, audioPath, outputPath, segIndex, totalSegs } = params;

  const [c1, c2] = SECTION_COLORS[key] ?? ["0x0d0d0d", "0x1a1a2e"];
  const accent = SECTION_ACCENT[key] ?? "0x4fc3f7";

  const wrappedText = escapeDrawtext(wrapText(text, 14));
  const labelEsc = escapeDrawtext(label);

  // Progress indicator dots
  const progressDots = Array.from({ length: totalSegs }, (_, i) =>
    i === segIndex ? "●" : "○"
  ).join(" ");

  // ffmpeg filter: gradient background + accent bar + label + main text + progress
  const filter = [
    // Gradient background
    `color=${c1}:s=${WIDTH}x${HEIGHT}:d=${duration}[bg1]`,
    `color=${c2}:s=${WIDTH}x${HEIGHT}:d=${duration}[bg2]`,
    `[bg1][bg2]blend=all_expr='A*(1-Y/H)+B*(Y/H)'[bg]`,
    // Accent top bar
    `color=${accent}:s=${WIDTH}x8:d=${duration}[bar]`,
    `[bg][bar]overlay=0:0[v1]`,
    // Channel watermark (top left)
    `[v1]drawtext=text='쇼츠뉴스':fontfile=${FONT_PATH}:fontsize=36:fontcolor=white@0.5:x=40:y=30[v2]`,
    // Section label (small, upper area)
    `[v2]drawtext=text='${labelEsc}':fontfile=${FONT_PATH}:fontsize=38:fontcolor=${accent}:x=(w-text_w)/2:y=h*0.28[v3]`,
    // Main text (center, large)
    `[v3]drawtext=text='${wrappedText}':fontfile=${FONT_PATH}:fontsize=62:fontcolor=white:borderw=3:bordercolor=black@0.8:line_spacing=16:x=(w-text_w)/2:y=(h-text_h)/2[v4]`,
    // Progress dots (bottom)
    `[v4]drawtext=text='${escapeDrawtext(progressDots)}':fontfile=${FONT_PATH}:fontsize=28:fontcolor=white@0.5:x=(w-text_w)/2:y=h*0.88[vout]`,
  ].join(";");

  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `color=black:s=${WIDTH}x${HEIGHT}:d=${duration}`, // dummy input for timing
    "-i", audioPath,
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", "1:a",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26",
    "-c:a", "aac", "-b:a", "96k",
    "-r", String(FPS),
    "-shortest",
    outputPath,
  ]);
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
export interface VideoJob {
  status: "running" | "done" | "error";
  progress: string[];
  outputPath?: string;
  error?: string;
}

const SECTION_ORDER = [
  { key: "opening", label: "오프닝" },
  { key: "topic_intro", label: "주제 소개" },
  { key: "summary", label: "핵심 요약" },
  { key: "what_happened", label: "무슨 일이" },
  { key: "daily_impact", label: "일상 영향" },
  { key: "flex_line", label: "아는 척 멘트" },
];

export async function generateVideo(params: {
  scriptData: Record<string, any>;
  apiKey: string;
  voice: string;
  outputPath: string;
  job: VideoJob;
}): Promise<void> {
  const { scriptData, apiKey, voice, outputPath, job } = params;

  const tmpDir = `/tmp/shortsnews_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  // Support both flat { opening: '...' } and nested { script: { opening: '...' } } formats
  const flat = scriptData.script ?? scriptData;

  const sections = SECTION_ORDER.filter((s) => {
    const v = flat[s.key];
    if (!v) return false;
    const str = Array.isArray(v) ? v.join(" ") : String(v);
    return str.trim().length > 0;
  }).map((s) => {
    const v = flat[s.key];
    const text = Array.isArray(v) ? v.join(" ") : String(v);
    return { ...s, text: text.trim() };
  });

  if (sections.length === 0) throw new Error("대본에 텍스트가 없습니다");

  const segmentPaths: string[] = [];

  // ── Step 1: TTS + segment per section ──
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    job.progress.push(`[${i + 1}/${sections.length}] TTS 생성: ${sec.label}...`);

    const audioPath = path.join(tmpDir, `audio_${i}.wav`);
    const segPath = path.join(tmpDir, `seg_${i}.mp4`);

    // Generate TTS
    const { wavBuffer, duration } = await generateTTS(sec.text, voice, apiKey);
    fs.writeFileSync(audioPath, wavBuffer);

    job.progress.push(`  → ${duration.toFixed(1)}초 / 영상 렌더링 중...`);

    // Build segment
    await buildSegment({
      key: sec.key,
      label: sec.label,
      text: sec.text,
      duration,
      audioPath,
      outputPath: segPath,
      segIndex: i,
      totalSegs: sections.length,
    });

    segmentPaths.push(segPath);
    job.progress.push(`  ✓ 완료`);
  }

  // ── Step 2: Concat all segments ──
  job.progress.push("영상 합치는 중...");
  const concatList = path.join(tmpDir, "concat.txt");
  fs.writeFileSync(concatList, segmentPaths.map((p) => `file '${p}'`).join("\n"));

  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "concat", "-safe", "0", "-i", concatList,
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ]);

  // Get final duration
  const probe = await execFileAsync("ffprobe", [
    "-v", "quiet", "-print_format", "json", "-show_format", outputPath,
  ]);
  const probeData = JSON.parse(probe.stdout);
  const totalDur = parseFloat(probeData.format.duration);
  const fileSize = fs.statSync(outputPath).size;

  job.progress.push(
    `✓ 완성! ${totalDur.toFixed(1)}초 / ${(fileSize / 1024 / 1024).toFixed(1)}MB`
  );
  job.status = "done";
  job.outputPath = outputPath;
}

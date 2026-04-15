import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import Parser from "rss-parser";
import path from "path";
import fs from "fs";
import { generateVideo, type VideoJob } from "./video_pipeline";

// ── GitHub helper ────────────────────────────────────────────────────────────
const GH_REPO = "NovisCoder/shortsnews";

async function pushScriptToGitHub(
  token: string,
  projectId: string,
  scriptJson: string,
  topic: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const slug = topic
    .replace(/[^가-힣a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const fileName = `scripts/${dateStr}_${slug}_${projectId.slice(0, 8)}.json`;

  let prettyJson: string;
  try {
    prettyJson = JSON.stringify(JSON.parse(scriptJson), null, 2);
  } catch {
    prettyJson = scriptJson;
  }

  const content = Buffer.from(prettyJson).toString("base64");

  let sha: string | undefined;
  try {
    const existRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/contents/${fileName}`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "ShortsNews" } },
    );
    if (existRes.ok) {
      const existData = (await existRes.json()) as { sha: string };
      sha = existData.sha;
    }
  } catch { /* file doesn't exist yet */ }

  const body: Record<string, string> = {
    message: `script: ${topic} (${dateStr})`,
    content,
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${fileName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ShortsNews",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    return { ok: false, error: err?.message || `GitHub API ${res.status}` };
  }

  const data = (await res.json()) as { content?: { html_url?: string } };
  return { ok: true, url: data?.content?.html_url };
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(articleText: string, tone: string, angle: string | null): string {
  const toneLabel =
    tone === "easy_explainer"
      ? "쉬운 설명체"
      : tone === "neutral_news"
      ? "중립적 뉴스체"
      : "일상 대화체";

  const angleNote = angle ? `\n시청자 관점: ${angle}` : "";

  return `당신은 한국어 유튜브 쇼츠 뉴스 대본 작가입니다. 아래 뉴스 기사를 바탕으로 60초 이내 낭독 가능한 쇼츠뉴스 대본 패키지를 생성하세요.

톤: ${toneLabel}${angleNote}

## 규칙
- 전체 낭독 시간: 60초 이하 (한국어 평균 발화속도 약 300자/분 기준)
- 오리지널 해설 위주 — 원문 직접 인용 최소화
- 쉬운 단어 우선
- raw 뉴스 클립 재사용 금지, 해설형 구조

## 출력 형식 (반드시 아래 JSON 스키마를 따르세요)
\`\`\`json
{
  "topic": "주제 한 줄",
  "summary_line": "한 문장 요약",
  "key_points": ["핵심1", "핵심2", "핵심3"],
  "script": {
    "opening": "오늘 기억해둘만한 뉴스, 쇼츠뉴스가 알려드립니다.",
    "topic_intro": "오늘의 주제 소개 문장",
    "summary_intro": "전체 요약 한 문장",
    "what_happened": ["사실1", "사실2", "사실3"],
    "daily_impact": ["일상 영향1", "일상 영향2"],
    "flex_intro": "오늘의 뉴스를 아는 척 하고 싶으시다면 이렇게 말해보세요.",
    "flex_line": "아는 척 멘트 — 핵심 개념이나 수치를 자연스럽게 활용한 한 문장",
    "search_intro": "더 자세히 알아보고 싶으시다면, 3가지 키워드를 검색해보세요!",
    "search_keywords_ko": ["키워드1", "키워드2", "키워드3"]
  },
  "subtitles_ko": [
    {"id": 1, "text": "자막 세그먼트", "start_sec": 0, "end_sec": 3}
  ],
  "subtitles_en": [
    {"id": 1, "text": "subtitle segment"}
  ],
  "broll_keywords_en": ["keyword1", "keyword2", "keyword3"],
  "onscreen_cards": [
    {"type": "headline", "text": "헤드라인 텍스트"},
    {"type": "source", "text": "출처 표기"}
  ],
  "factual_confidence_score": 0.9,
  "risk_flags": [],
  "char_count_estimate": 280
}
\`\`\`

## 뉴스 기사
${articleText}

JSON만 출력하세요. 다른 설명 텍스트는 포함하지 마세요.`;
}

// ── URL article fetcher ───────────────────────────────────────────────────────
async function fetchArticleText(url: string): Promise<{ title: string; text: string; publisher: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ShortsNewsBot/1.0)" },
  });
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s*[-|].*$/, "") : "";

  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  const publisher = new URL(url).hostname.replace(/^www\./, "");
  return { title, text: stripped, publisher };
}

// ── RSS parser (Today News) ───────────────────────────────────────────────────
const rssParser = new Parser();

async function fetchTodayNews() {
  const feeds = [
    { url: "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", source: "Google News KR" },
    { url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", source: "Google News US" },
  ];

  const items: {
    title: string;
    url: string;
    source: string;
    publishedAt?: string;
  }[] = [];

  for (const feed of feeds) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      for (const item of parsed.items?.slice(0, 10) ?? []) {
        if (!item.link || !item.title) continue;
        items.push({
          title: item.title,
          url: item.link,
          source: feed.source,
          publishedAt: item.pubDate,
        });
      }
    } catch (e) {
      console.error("RSS parse error for", feed.url, e);
    }
  }

  if (!items.length) {
    throw new Error("뉴스 피드에서 기사를 찾지 못했습니다.");
  }

  const top = items[0];
  const keywords = top.title
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 5);

  return {
    headline: top.title,
    summary: "오늘 주요 뉴스 피드에서 가장 먼저 포착된 핵심 기사입니다. 다음 단계에서 이 이슈를 바탕으로 쇼츠 대본을 만들 수 있습니다.",
    keywords,
    articles: items.slice(0, 8),
  };
}

// ── Route registration ────────────────────────────────────────────────────────
export function registerRoutes(httpServer: ReturnType<typeof createServer>, app: Express) {

  // 오늘의 핵심 뉴스
  app.get("/api/today-news", async (_req, res) => {
    try {
      const data = await fetchTodayNews();
      res.json(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: message || "오늘의 뉴스 불러오기 실패" });
    }
  });

  // GET all projects
  app.get("/api/projects", async (_req, res) => {
    const all = await storage.getAllProjects();
    res.json(all);
  });

  // GET single project
  app.get("/api/projects/:projectId", async (req, res) => {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  });

  // POST generate — create project + call Gemini
  app.post("/api/generate", async (req, res) => {
    const { inputType, rawInputText, sourceUrl, tone, topicAngle, apiKey } = req.body;

    if (!rawInputText && !sourceUrl) {
      return res.status(400).json({ error: "기사 텍스트 또는 URL을 입력하세요." });
    }
    if (!apiKey) {
      return res.status(400).json({ error: "Gemini API 키를 입력하세요." });
    }

    let articleText = rawInputText || "";
    let articleTitle = "";
    let publisher = "";
    let cleanArticleText = rawInputText || "";

    if (inputType === "url" && sourceUrl) {
      try {
        const fetched = await fetchArticleText(sourceUrl);
        articleText = fetched.text;
        cleanArticleText = fetched.text;
        articleTitle = fetched.title;
        publisher = fetched.publisher;
      } catch {
        return res.status(400).json({ error: "URL에서 기사를 불러올 수 없습니다." });
      }
    }

    let scriptJson: string;
    const llmModel = "gemini-2.5-flash-lite";
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${llmModel}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: buildPrompt(articleText, tone || "easy_explainer", topicAngle || null) }]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const err = await geminiRes.json() as { error?: { message?: string } };
        return res.status(400).json({ error: err?.error?.message || "Gemini API 오류" });
      }

      const geminiData = await geminiRes.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>
      };
      let content = geminiData.candidates[0].content.parts[0].text.trim();
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      scriptJson = content;
      JSON.parse(scriptJson); // validate
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: "대본 생성 실패: " + message });
    }

    const projectId = randomUUID();
    const now = new Date().toISOString();

    const project = await storage.createProject({
      projectId,
      createdAt: now,
      inputType: inputType || "pasted_text",
      sourceUrl: sourceUrl || null,
      articleTitle: articleTitle || null,
      publisher: publisher || null,
      rawInputText: rawInputText || articleText,
      cleanArticleText,
      extractionQuality: "high",
      tone: tone || "easy_explainer",
      topicAngle: topicAngle || null,
      scriptJson,
      reviewStatus: "draft",
      editorNotes: "",
      llmModel,
      exportStatus: "draft",
      riskFlags: "[]",
      factualConfidenceScore: "1",
    });

    res.json(project);
  });

  // PATCH update project (review edits)
  app.patch("/api/projects/:projectId", async (req, res) => {
    const { githubToken, ...updateData } = req.body;
    const updated = await storage.updateProject(req.params.projectId, updateData);
    if (!updated) return res.status(404).json({ error: "Not found" });

    let githubResult: { ok: boolean; url?: string; error?: string } | null = null;
    if (updateData.reviewStatus === "approved" && githubToken) {
      try {
        let topic = "untitled";
        try {
          const parsed = JSON.parse(updated.scriptJson || "{}");
          topic = parsed.topic || "untitled";
        } catch { /* ignore */ }
        githubResult = await pushScriptToGitHub(
          githubToken,
          updated.projectId,
          updated.scriptJson || "{}",
          topic,
        );
      } catch (e: unknown) {
        githubResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    res.json({ ...updated, github: githubResult });
  });

  // GET settings
  app.get("/api/settings", async (_req, res) => {
    const settings = await storage.getAllSettings();
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(settings)) {
      masked[k] = v ? `saved:${v.slice(-4)}` : "";
    }
    res.json(masked);
  });

  // POST settings
  app.post("/api/settings", async (req, res) => {
    const { key, value } = req.body;
    if (!key || typeof value !== "string") {
      return res.status(400).json({ error: "key and value required" });
    }
    await storage.setSetting(key, value);
    res.json({ ok: true });
  });

  // GET single setting
  app.get("/api/settings/:key", async (req, res) => {
    const value = await storage.getSetting(req.params.key);
    if (value === undefined) return res.status(404).json({ error: "Not found" });
    res.json({ value });
  });

  // DELETE project
  app.delete("/api/projects/:projectId", async (req, res) => {
    await storage.deleteProject(req.params.projectId);
    res.json({ success: true });
  });

  // GET export project as JSON
  app.get("/api/projects/:projectId/export", async (req, res) => {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Not found" });

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(project.scriptJson || "{}"); } catch { /* empty */ }

    const exportPackage = {
      project_id: project.projectId,
      created_at: project.createdAt,
      brand: {
        channel_name: "쇼츠뉴스",
        opening_line: "오늘 기억해둘만한 뉴스, 쇼츠뉴스가 알려드립니다.",
      },
      input: {
        input_type: project.inputType,
        source_url: project.sourceUrl,
        article_title: project.articleTitle,
        publisher: project.publisher,
      },
      settings: {
        tone: project.tone,
        topic_angle: project.topicAngle,
        target_duration_sec: 60,
        primary_language: "ko-KR",
        secondary_language: "en-US",
      },
      ...parsed,
      review: {
        review_status: project.reviewStatus,
        editor_notes: project.editorNotes,
        llm_model: project.llmModel,
      },
      export: { status: project.exportStatus },
    };

    res.setHeader("Content-Disposition", `attachment; filename="shortsnews-${project.projectId}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(exportPackage, null, 2));
  });

  // ── Video generation ──────────────────────────────────────────────────────
  const videoJobs = new Map<string, VideoJob>();

  // POST generate video
  app.post("/api/projects/:projectId/video", async (req, res) => {
    const project = await storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Not found" });

    const jobId = `vid_${Date.now()}`;
    const tmpDir = `/tmp/shortsnews_videos`;
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const outputPath = path.join(tmpDir, `${jobId}.mp4`);
    const scriptData = project.scriptJson ? JSON.parse(project.scriptJson) : {};

    const apiKey = await storage.getSetting("geminiApiKey") || req.body?.apiKey || "";
    if (!apiKey) {
      return res.status(400).json({ error: "Gemini API 키가 없습니다. 설정에서 저장해주세요." });
    }

    const voice = req.body?.voice || "Kore";
    const job = { status: "running", progress: [] as string[] };
    videoJobs.set(jobId, job);

    generateVideo({ scriptData, apiKey, voice, outputPath, job }).catch((err: Error) => {
      if (job.status === "running") {
        job.status = "error";
        (job as any).error = err.message;
      }
    });

    res.json({ jobId });
  });

  // GET video job status
  app.get("/api/video-jobs/:jobId", (req, res) => {
    const job = videoJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ status: job.status, progress: job.progress, error: job.error });
  });

  // GET download video
  app.get("/api/video-jobs/:jobId/download", (req, res) => {
    const job = videoJobs.get(req.params.jobId);
    if (!job || job.status !== "done" || !job.outputPath) {
      return res.status(404).json({ error: "Video not ready" });
    }
    if (!fs.existsSync(job.outputPath)) {
      return res.status(404).json({ error: "Video file not found" });
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="shortsnews_${req.params.jobId}.mp4"`);
    fs.createReadStream(job.outputPath).pipe(res);
  });

  // GET stream video (range requests)
  app.get("/api/video-jobs/:jobId/stream", (req, res) => {
    const job = videoJobs.get(req.params.jobId);
    if (!job || job.status !== "done" || !job.outputPath) {
      return res.status(404).json({ error: "Video not ready" });
    }
    if (!fs.existsSync(job.outputPath)) {
      return res.status(404).json({ error: "Video file not found" });
    }
    const stat = fs.statSync(job.outputPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(job.outputPath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      });
      fs.createReadStream(job.outputPath).pipe(res);
    }
  });

  return httpServer;
}

import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { randomUUID } from "crypto";

// ── GitHub helper ────────────────────────────────────────────────────────────
const GH_REPO = "NovisCoder/shortsnews";

async function pushScriptToGitHub(
  token: string,
  projectId: string,
  scriptJson: string,
  topic: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  // Build a nice filename: scripts/YYYY-MM-DD_topic-slug_projectId.json
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const slug = topic
    .replace(/[^가-힣a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const fileName = `scripts/${dateStr}_${slug}_${projectId.slice(0, 8)}.json`;

  // Pretty-print the JSON
  let prettyJson: string;
  try {
    prettyJson = JSON.stringify(JSON.parse(scriptJson), null, 2);
  } catch {
    prettyJson = scriptJson;
  }

  const content = Buffer.from(prettyJson).toString("base64");

  // Check if file already exists (for update)
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

// ── URL article fetcher (simple) ──────────────────────────────────────────────
async function fetchArticleText(url: string): Promise<{ title: string; text: string; publisher: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ShortsNewsBot/1.0)" },
  });
  const html = await res.text();

  // Basic title extraction
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/\s*[-|].*$/, "") : "";

  // Strip scripts/styles, extract text
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

export function registerRoutes(httpServer: ReturnType<typeof createServer>, app: Express) {
  // GET all projects
  app.get("/api/projects", (_req, res) => {
    const all = storage.getAllProjects();
    res.json(all);
  });

  // GET single project
  app.get("/api/projects/:projectId", (req, res) => {
    const project = storage.getProject(req.params.projectId);
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json(project);
  });

  // POST generate — create project + call OpenAI
  app.post("/api/generate", async (req, res) => {
    const { inputType, rawInputText, sourceUrl, tone, topicAngle, apiKey } = req.body;

    if (!rawInputText && !sourceUrl) {
      return res.status(400).json({ error: "기사 텍스트 또는 URL을 입력하세요." });
    }
    if (!apiKey) {
      return res.status(400).json({ error: "OpenAI API 키를 입력하세요." });
    }

    let articleText = rawInputText || "";
    let articleTitle = "";
    let publisher = "";
    let cleanArticleText = rawInputText || "";

    // Fetch URL if provided
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

    // Call Gemini API
    let scriptJson: string;
    let llmModel = "gemini-2.5-flash-lite";
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
              maxOutputTokens: 2048,
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
      // Strip markdown code fences if present
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      scriptJson = content;
      // Validate JSON
      JSON.parse(scriptJson);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ error: "대본 생성 실패: " + message });
    }

    const projectId = randomUUID();
    const now = new Date().toISOString();

    const project = storage.createProject({
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
    const updated = storage.updateProject(req.params.projectId, updateData);
    if (!updated) return res.status(404).json({ error: "Not found" });

    // Auto-push to GitHub when approved + token provided
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

  // DELETE project
  app.delete("/api/projects/:projectId", (req, res) => {
    storage.deleteProject(req.params.projectId);
    res.json({ success: true });
  });

  // POST export as JSON (returns the full package)
  app.get("/api/projects/:projectId/export", (req, res) => {
    const project = storage.getProject(req.params.projectId);
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

  return httpServer;
}

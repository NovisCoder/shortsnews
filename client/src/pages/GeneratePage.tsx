import React, { useEffect, useState } from "react";
import { useHashLocation } from "wouter/use-hash-location";
import { setSessionValue, getSessionValue } from "../lib/sessionStore";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  Github,
  Save,
  CheckCircle2,
} from "lucide-react";
import type { Project } from "../../../shared/schema";

const ANGLES = [
  { value: "none", label: "기본 (일반 시청자)" },
  { value: "경제 초보자", label: "경제 초보자" },
  { value: "직장인", label: "직장인" },
  { value: "부동산", label: "부동산 관심자" },
  { value: "정치", label: "정치 관심자" },
  { value: "글로벌", label: "글로벌 관점" },
];

const TONES = [
  { value: "easy_explainer", label: "쉬운 설명체" },
  { value: "neutral_news", label: "중립적 뉴스체" },
  { value: "daily_conversation", label: "일상 대화체" },
];

type TodayNewsResponse = {
  headline: string;
  summary: string;
  keywords: string[];
  articles: Array<{
    title: string;
    url: string;
    source?: string;
    publishedAt?: string;
  }>;
};

export default function GeneratePage() {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();

  const [inputType, setInputType] = useState<"url" | "pasted_text">("pasted_text");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tone, setTone] = useState("easy_explainer");
  const [angle, setAngle] = useState("none");

  const [apiKey, setApiKey] = useState(() => getSessionValue("geminiApiKey"));
  const [showKey, setShowKey] = useState(false);
  const [githubToken, setGithubToken] = useState(() => getSessionValue("githubToken"));
  const [showGhToken, setShowGhToken] = useState(false);

  const [geminiSaved, setGeminiSaved] = useState(false);
  const [ghSaved, setGhSaved] = useState(false);

  const [todayNews, setTodayNews] = useState<TodayNewsResponse | null>(null);
  const [todayNewsLoading, setTodayNewsLoading] = useState(false);

  const { data: savedGemini } = useQuery<{ value: string }>({
    queryKey: ["/api/settings/geminiApiKey"],
    retry: false,
    staleTime: Infinity,
  });

  const { data: savedGhToken } = useQuery<{ value: string }>({
    queryKey: ["/api/settings/githubToken"],
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (savedGemini?.value && !apiKey) {
      setApiKey(savedGemini.value);
      setGeminiSaved(true);
    }
  }, [savedGemini, apiKey]);

  useEffect(() => {
    if (savedGhToken?.value && !githubToken) {
      setGithubToken(savedGhToken.value);
      setGhSaved(true);
    }
  }, [savedGhToken, githubToken]);

  useEffect(() => {
    setSessionValue("geminiApiKey", apiKey);
  }, [apiKey]);

  useEffect(() => {
    setSessionValue("githubToken", githubToken);
  }, [githubToken]);

  useEffect(() => {
    setGeminiSaved(false);
  }, [apiKey]);

  useEffect(() => {
    setGhSaved(false);
  }, [githubToken]);

  const saveKeyMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) =>
      await apiRequest("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      }),
  });

  const handleSaveGemini = async () => {
    if (!apiKey.trim()) return;
    await saveKeyMutation.mutateAsync({
      key: "geminiApiKey",
      value: apiKey.trim(),
    });
    setGeminiSaved(true);
    toast({
      title: "Gemini API 키 저장 완료",
      description: "다음 번 앱 로드 시 자동으로 채워집니다.",
    });
  };

  const handleSaveGhToken = async () => {
    if (!githubToken.trim()) return;
    await saveKeyMutation.mutateAsync({
      key: "githubToken",
      value: githubToken.trim(),
    });
    setGhSaved(true);
    toast({
      title: "GitHub 토큰 저장 완료",
      description: "다음 번 앱 로드 시 자동으로 채워집니다.",
    });
  };

const handleFetchTodayNews = async () => {
  try {
    setTodayNewsLoading(true);

    const googleNewsRssUrl =
      "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko";
    const rssToJsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
      googleNewsRssUrl
    )}`;

    const response = await fetch(rssToJsonUrl, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`RSS 요청 실패 (${response.status})`);
    }

    const data = await response.json();

    if (data.status !== "ok" || !data.items || data.items.length === 0) {
      throw new Error("뉴스 데이터를 불러오지 못했습니다.");
    }

    const articles = data.items.slice(0, 5).map((item: any) => ({
      title: item.title || "제목 없음",
      url: item.link || "#",
      source: "Google News",
      publishedAt: item.pubDate,
    }));

    const headline = articles[0]?.title || "오늘의 핵심 뉴스";

    const keywords = headline
      .split(/[,\-\|\·\[\]\(\)\/\s]+/)
      .map((word: string) => word.trim())
      .filter((word: string) => word.length >= 2)
      .slice(0, 5);

    setTodayNews({
      headline,
      summary:
        "Google News RSS 기준으로 오늘 많이 다뤄지는 기사들을 불러왔습니다. 아래 링크를 눌러 원문을 확인할 수 있습니다.",
      keywords,
      articles,
    });

    toast({
      title: "오늘의 핵심 뉴스 불러오기 완료",
      description: "실제 뉴스 데이터를 가져왔어요.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";

    toast({
      title: "뉴스 불러오기 실패",
      description: `${message} — 테스트 데이터로 대체합니다.`,
      variant: "destructive",
    });

    setTodayNews({
      headline: "오늘의 테스트 핵심 뉴스: 금리·물가·부동산 이슈 정리",
      summary:
        "실제 뉴스 호출이 실패해서 테스트 데이터를 대신 표시하고 있습니다. GitHub Pages 환경이나 외부 API 응답 상태를 확인해 주세요.",
      keywords: ["금리", "물가", "부동산", "한국경제", "테스트"],
      articles: [
        {
          title: "테스트 기사 1: 기준금리 동결이 시장에 미치는 영향",
          url: "https://example.com/test-news-1",
          source: "테스트 데이터",
          publishedAt: "2026-04-14T17:00:00+09:00",
        },
        {
          title: "테스트 기사 2: 소비자물가 흐름과 체감 경기 변화",
          url: "https://example.com/test-news-2",
          source: "테스트 데이터",
          publishedAt: "2026-04-14T17:01:00+09:00",
        },
        {
          title: "테스트 기사 3: 부동산 시장 관망세 이어지나",
          url: "https://example.com/test-news-3",
          source: "테스트 데이터",
          publishedAt: "2026-04-14T17:02:00+09:00",
        },
      ],
    });
  } finally {
    setTodayNewsLoading(false);
  }
};

  const generateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<Project>("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputType,
          rawInputText: rawText,
          sourceUrl: inputType === "url" ? sourceUrl : undefined,
          tone,
          topicAngle: angle === "none" ? null : angle,
          apiKey,
        }),
      });
    },
    onSuccess: (project) => {
      toast({
        title: "대본 생성 완료",
        description: "검수 화면으로 이동합니다.",
      });
      navigate(`/review/${project.projectId}`);
    },
    onError: (err: Error) => {
      toast({
        title: "생성 실패",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const canGenerate =
    apiKey.trim().length > 10 &&
    (inputType === "url"
      ? sourceUrl.trim().length > 5
      : rawText.trim().length > 30);

  return (
    <div className="max-w-2xl mx-auto animate-in space-y-8">
      <div className="space-y-1">
        <h1
          className="text-xl font-bold"
          style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}
        >
          새 대본 생성
        </h1>
        <p className="text-sm text-muted-foreground">
          뉴스 URL 또는 기사 텍스트를 입력하면 60초 이내 쇼츠 대본이 생성됩니다.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">오늘의 핵심 뉴스 찾기</h2>
          <p className="text-sm text-muted-foreground">
            현재는 외부 호출 없이 GitHub Pages에서 동작 확인용 테스트 데이터를 표시합니다.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleFetchTodayNews}
          disabled={todayNewsLoading}
          data-testid="button-find-today-news"
        >
          {todayNewsLoading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              불러오는 중...
            </>
          ) : (
            "오늘의 핵심 뉴스 찾기"
          )}
        </Button>

        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground min-h-[100px] space-y-3">
          {!todayNews ? (
            <p>버튼을 누르면 테스트 뉴스 카드가 표시됩니다.</p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  {todayNews.headline}
                </p>
                <p>{todayNews.summary}</p>
              </div>

              {!!todayNews.keywords?.length && (
                <div className="flex flex-wrap gap-2">
                  {todayNews.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="px-2 py-1 rounded-md bg-background border border-border text-xs text-foreground"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              )}

              {!!todayNews.articles?.length && (
                <div className="space-y-2 pt-1">
                  {todayNews.articles.map((article) => (
                    <a
                      key={article.url}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border border-border bg-background px-3 py-2 hover:border-primary/40 transition-colors"
                    >
                      <p className="text-sm text-foreground font-medium">
                        {article.title}
                      </p>
                      {article.source && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {article.source}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <Tabs
          value={inputType}
          onValueChange={(v) => setInputType(v as "url" | "pasted_text")}
        >
          <TabsList className="w-full grid grid-cols-2" data-testid="tabs-input-type">
            <TabsTrigger value="pasted_text" data-testid="tab-paste">
              텍스트 붙여넣기
            </TabsTrigger>
            <TabsTrigger value="url" data-testid="tab-url">
              URL 입력
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pasted_text" className="mt-4">
            <Label className="text-sm font-medium mb-2 block">기사 텍스트</Label>
            <Textarea
              placeholder="뉴스 기사 전문을 붙여넣으세요..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              className="resize-none text-sm"
              data-testid="textarea-article"
            />
            <p className="mt-1 text-xs text-muted-foreground">{rawText.length}자</p>
          </TabsContent>

          <TabsContent value="url" className="mt-4">
            <Label className="text-sm font-medium mb-2 block">뉴스 기사 URL</Label>
            <Input
              type="url"
              placeholder="https://news.example.com/article/..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              data-testid="input-url"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              기사 본문을 자동으로 추출합니다. 일부 사이트는 차단될 수 있습니다.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">톤</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger data-testid="select-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">시청자 관점</Label>
            <Select value={angle} onValueChange={setAngle}>
              <SelectTrigger data-testid="select-angle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANGLES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            Google Gemini API 키
            {geminiSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-normal">
                <CheckCircle2 size={12} />
                저장됨
              </span>
            )}
          </Label>
          <span className="text-xs text-muted-foreground">서버에 저장, 자동 로드</span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="pr-10 font-mono text-sm"
              data-testid="input-api-key"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-toggle-key"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveGemini}
            disabled={!apiKey.trim() || saveKeyMutation.isPending || geminiSaved}
            className="shrink-0 px-3"
            data-testid="button-save-gemini"
          >
            {geminiSaved ? (
              <CheckCircle2 size={14} className="text-green-600" />
            ) : (
              <Save size={14} />
            )}
            <span className="ml-1.5 text-xs">{geminiSaved ? "저장됨" : "저장"}</span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          처음 한 번만 입력하고 저장하면 이후 자동으로 채워집니다.{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            API 키 발급
          </a>
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <Github size={14} />
            GitHub Personal Access Token
            {ghSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-normal">
                <CheckCircle2 size={12} />
                저장됨
              </span>
            )}
          </Label>
          <span className="text-xs text-muted-foreground">
            선택 — 승인 시 대본 자동 저장
          </span>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showGhToken ? "text" : "password"}
              placeholder="ghp_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              className="pr-10 font-mono text-sm"
              data-testid="input-github-token"
            />
            <button
              type="button"
              onClick={() => setShowGhToken(!showGhToken)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-toggle-gh-token"
            >
              {showGhToken ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveGhToken}
            disabled={!githubToken.trim() || saveKeyMutation.isPending || ghSaved}
            className="shrink-0 px-3"
            data-testid="button-save-gh-token"
          >
            {ghSaved ? (
              <CheckCircle2 size={14} className="text-green-600" />
            ) : (
              <Save size={14} />
            )}
            <span className="ml-1.5 text-xs">{ghSaved ? "저장됨" : "저장"}</span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          처음 한 번만 입력하고 저장하면 이후 자동으로 채워집니다.{" "}
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=ShortsNews"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            토큰 생성 (repo 권한 필요)
          </a>
        </p>
      </div>

      <Button
        onClick={() => generateMutation.mutate()}
        disabled={!canGenerate || generateMutation.isPending}
        className="w-full h-12 text-base font-semibold"
        data-testid="button-generate"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 size={18} className="mr-2 animate-spin" />
            대본 생성 중...
          </>
        ) : (
          <>
            <Sparkles size={18} className="mr-2" />
            쇼츠 대본 생성하기
          </>
        )}
      </Button>
    </div>
  );
}

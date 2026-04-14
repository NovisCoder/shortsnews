import { useState } from "react";
import { useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";
import type { Project } from "@shared/schema";

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

export default function GeneratePage() {
  const [, navigate] = useHashLocation();
  const { toast } = useToast();

  const [inputType, setInputType] = useState<"url" | "pasted_text">("pasted_text");
  const [rawText, setRawText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tone, setTone] = useState("easy_explainer");
  const [angle, setAngle] = useState("none");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

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
      toast({ title: "대본 생성 완료", description: "검수 화면으로 이동합니다." });
      navigate(`/review/${project.projectId}`);
    },
    onError: (err: Error) => {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    },
  });

  const canGenerate =
    apiKey.trim().length > 10 &&
    (inputType === "url" ? sourceUrl.trim().length > 5 : rawText.trim().length > 30);

  return (
    <div className="max-w-2xl mx-auto animate-in space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
          새 대본 생성
        </h1>
        <p className="text-sm text-muted-foreground">
          뉴스 URL 또는 기사 텍스트를 입력하면 60초 이내 쇼츠 대본이 생성됩니다.
        </p>
      </div>

      {/* Input section */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <Tabs value={inputType} onValueChange={(v) => setInputType(v as "url" | "pasted_text")}>
          <TabsList className="w-full grid grid-cols-2" data-testid="tabs-input-type">
            <TabsTrigger value="pasted_text" data-testid="tab-paste">텍스트 붙여넣기</TabsTrigger>
            <TabsTrigger value="url" data-testid="tab-url">URL 입력</TabsTrigger>
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

        {/* Tone + Angle */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">톤</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger data-testid="select-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* API Key section */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Google Gemini API 키</Label>
          <span className="text-xs text-muted-foreground">세션 내 임시 저장, 서버에 보관 안 됨</span>
        </div>
        <div className="relative">
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
        <p className="text-xs text-muted-foreground">
          API 키가 없으면{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            aistudio.google.com
          </a>
          에서 무료로 발급하세요.
        </p>
      </div>

      {/* Generate button */}
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

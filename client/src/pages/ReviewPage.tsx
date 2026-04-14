import { useRoute } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle2, Download, Loader2,
  ChevronRight, FileJson, Captions, ArrowLeft
} from "lucide-react";
import type { Project } from "@shared/schema";
import { Link } from "wouter";

interface ScriptData {
  topic?: string;
  summary_line?: string;
  key_points?: string[];
  script?: {
    opening?: string;
    topic_intro?: string;
    summary_intro?: string;
    what_happened?: string[];
    daily_impact?: string[];
    flex_intro?: string;
    flex_line?: string;
    search_intro?: string;
    search_keywords_ko?: string[];
  };
  subtitles_ko?: Array<{ id: number; text: string; start_sec: number; end_sec: number }>;
  subtitles_en?: Array<{ id: number; text: string }>;
  broll_keywords_en?: string[];
  onscreen_cards?: Array<{ type: string; text: string }>;
  factual_confidence_score?: number;
  risk_flags?: string[];
  char_count_estimate?: number;
}

const FLAG_LABELS: Record<string, string> = {
  long_quote_risk: "직접 인용 과다",
  attribution_missing: "출처 누락",
  factual_confidence_low: "팩트 신뢰도 낮음",
  extraction_quality_low: "기사 추출 품질 낮음",
  script_too_long: "대본 너무 김",
  translation_needs_review: "번역 검수 필요",
};

export default function ReviewPage() {
  const [, params] = useRoute("/review/:projectId");
  const [, navigate] = useHashLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const projectId = params?.projectId ?? "";

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest<Project>(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });

  const [scriptData, setScriptData] = useState<ScriptData>({});
  const [editorNotes, setEditorNotes] = useState("");
  const [editedScript, setEditedScript] = useState<Record<string, string>>({});

  useEffect(() => {
    if (project?.scriptJson) {
      try {
        const parsed: ScriptData = JSON.parse(project.scriptJson);
        setScriptData(parsed);
        // Pre-populate editable fields
        const s = parsed.script || {};
        setEditedScript({
          topic_intro: s.topic_intro || "",
          summary_intro: s.summary_intro || "",
          flex_line: s.flex_line || "",
          what_happened: (s.what_happened || []).join("\n"),
          daily_impact: (s.daily_impact || []).join("\n"),
          search_keywords_ko: (s.search_keywords_ko || []).join(", "),
        });
      } catch { /* empty */ }
    }
    if (project?.editorNotes) setEditorNotes(project.editorNotes);
  }, [project]);

  const approveMutation = useMutation({
    mutationFn: () =>
      apiRequest<Project>(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: "approved",
          exportStatus: "approved",
          editorNotes,
          // Merge edits back to scriptJson
          scriptJson: JSON.stringify({
            ...scriptData,
            script: {
              ...scriptData.script,
              topic_intro: editedScript.topic_intro,
              summary_intro: editedScript.summary_intro,
              flex_line: editedScript.flex_line,
              what_happened: editedScript.what_happened.split("\n").filter(Boolean),
              daily_impact: editedScript.daily_impact.split("\n").filter(Boolean),
              search_keywords_ko: editedScript.search_keywords_ko.split(",").map((s) => s.trim()).filter(Boolean),
            },
          }),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "승인 완료", description: "export 준비 상태로 변경됩니다." });
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const handleExport = () => {
    window.open(`/api/projects/${projectId}/export`, "_blank");
  };

  const handleSrtDownload = (lang: "ko" | "en") => {
    const subs = lang === "ko" ? scriptData.subtitles_ko : scriptData.subtitles_en;
    if (!subs?.length) {
      toast({ title: "자막 없음", variant: "destructive" });
      return;
    }
    const lines = subs.map((s, i) => {
      const ko = scriptData.subtitles_ko?.[i];
      const startSec = ko?.start_sec ?? i * 3;
      const endSec = ko?.end_sec ?? startSec + 3;
      const fmt = (sec: number) => {
        const h = Math.floor(sec / 3600).toString().padStart(2, "0");
        const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
        const sec2 = Math.floor(sec % 60).toString().padStart(2, "0");
        return `${h}:${m}:${sec2},000`;
      };
      return `${s.id}\n${fmt(startSec)} --> ${fmt(endSec)}\n${s.text}`;
    });
    const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shortsnews-${projectId}-${lang}.srt`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!project || !scriptData.script) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>대본을 불러올 수 없습니다.</p>
        <Link href="/">
          <a className="text-primary text-sm mt-2 inline-block">← 처음으로</a>
        </Link>
      </div>
    );
  }

  const s = scriptData.script;
  const flags: string[] = (() => {
    try { return JSON.parse(project.riskFlags || "[]"); } catch { return []; }
  })();
  const confidence = scriptData.factual_confidence_score ?? 1;
  const charCount = scriptData.char_count_estimate ?? 0;
  const isApproved = project.reviewStatus === "approved";

  return (
    <div className="max-w-2xl mx-auto animate-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <Link href="/">
              <a className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back">
                <ArrowLeft size={16} />
              </a>
            </Link>
            <h1 className="text-xl font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
              대본 검수
            </h1>
          </div>
          {scriptData.topic && (
            <p className="text-sm text-muted-foreground">{scriptData.topic}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isApproved ? (
            <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10">
              <CheckCircle2 size={12} className="mr-1" /> 승인됨
            </Badge>
          ) : (
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 bg-yellow-400/10">
              검수 대기
            </Badge>
          )}
        </div>
      </div>

      {/* Stats + Flags */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">예상 글자 수 </span>
            <span className={charCount > 320 ? "text-yellow-400 font-semibold" : "text-foreground font-semibold"}>
              {charCount}자
            </span>
            <span className="text-muted-foreground text-xs ml-1">(60초 기준 ≤300자 권장)</span>
          </div>
          <div>
            <span className="text-muted-foreground">신뢰도 </span>
            <span className={confidence < 0.7 ? "text-yellow-400 font-semibold" : "text-green-400 font-semibold"}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
        </div>

        {flags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {flags.map((f: string) => (
              <span key={f} className="flag-badge">
                <AlertTriangle size={11} />
                {FLAG_LABELS[f] || f}
              </span>
            ))}
          </div>
        )}

        {scriptData.summary_line && (
          <p className="text-sm text-muted-foreground border-t border-border pt-3 mt-1">
            {scriptData.summary_line}
          </p>
        )}
      </div>

      {/* Script sections */}
      <div className="space-y-4">
        {/* Opening — fixed */}
        <div className="script-block">
          <p className="script-label">오프닝 (고정)</p>
          <p className="text-sm font-medium text-primary">{s.opening}</p>
        </div>

        {/* Topic intro — editable */}
        <ScriptEditBlock
          label="주제 소개"
          value={editedScript.topic_intro || ""}
          onChange={(v) => setEditedScript((p) => ({ ...p, topic_intro: v }))}
        />

        {/* Summary intro — editable */}
        <ScriptEditBlock
          label="요약 한 문장"
          value={editedScript.summary_intro || ""}
          onChange={(v) => setEditedScript((p) => ({ ...p, summary_intro: v }))}
        />

        {/* What happened — editable (multi-line) */}
        <div className="script-block">
          <p className="script-label">무슨 일이 (1줄에 1문장)</p>
          <Textarea
            value={editedScript.what_happened || ""}
            onChange={(e) => setEditedScript((p) => ({ ...p, what_happened: e.target.value }))}
            rows={4}
            className="text-sm resize-none mt-1"
            data-testid="textarea-what-happened"
          />
        </div>

        {/* Daily impact — editable */}
        <div className="script-block">
          <p className="script-label">일상 영향 (1줄에 1문장)</p>
          <Textarea
            value={editedScript.daily_impact || ""}
            onChange={(e) => setEditedScript((p) => ({ ...p, daily_impact: e.target.value }))}
            rows={3}
            className="text-sm resize-none mt-1"
            data-testid="textarea-daily-impact"
          />
        </div>

        {/* Flex line */}
        <div className="script-block border-primary/30 bg-primary/5">
          <p className="script-label text-primary/70">아는 척 멘트</p>
          <p className="text-xs text-muted-foreground mb-2">{s.flex_intro}</p>
          <Textarea
            value={editedScript.flex_line || ""}
            onChange={(e) => setEditedScript((p) => ({ ...p, flex_line: e.target.value }))}
            rows={2}
            className="text-sm resize-none font-medium"
            data-testid="textarea-flex-line"
          />
        </div>

        {/* Search keywords */}
        <div className="script-block">
          <p className="script-label">검색 키워드 (쉼표 구분)</p>
          <p className="text-xs text-muted-foreground mb-2">{s.search_intro}</p>
          <input
            type="text"
            value={editedScript.search_keywords_ko || ""}
            onChange={(e) => setEditedScript((p) => ({ ...p, search_keywords_ko: e.target.value }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="키워드1, 키워드2, 키워드3"
            data-testid="input-keywords"
          />
        </div>

        {/* B-roll keywords */}
        {scriptData.broll_keywords_en?.length && (
          <div className="script-block">
            <p className="script-label">B-roll 키워드 (영문)</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {scriptData.broll_keywords_en.map((k) => (
                <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Editor notes */}
        <div className="script-block">
          <p className="script-label">검수 메모</p>
          <Textarea
            value={editorNotes}
            onChange={(e) => setEditorNotes(e.target.value)}
            rows={2}
            placeholder="수정 사항, 확인 필요 내용 등..."
            className="text-sm resize-none mt-1"
            data-testid="textarea-editor-notes"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending}
          className="flex-1"
          data-testid="button-approve"
        >
          {approveMutation.isPending ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <CheckCircle2 size={16} className="mr-2" />
          )}
          검수 완료 / 승인
        </Button>

        <Button variant="outline" onClick={handleExport} data-testid="button-export-json">
          <FileJson size={16} className="mr-1.5" />
          JSON
        </Button>

        <Button variant="outline" onClick={() => handleSrtDownload("ko")} data-testid="button-srt-ko">
          <Captions size={16} className="mr-1.5" />
          KO 자막
        </Button>

        <Button variant="outline" onClick={() => handleSrtDownload("en")} data-testid="button-srt-en">
          <Captions size={16} className="mr-1.5" />
          EN 자막
        </Button>
      </div>
    </div>
  );
}

function ScriptEditBlock({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="script-block">
      <p className="script-label">{label}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="text-sm resize-none mt-1"
      />
    </div>
  );
}

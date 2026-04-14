import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileJson, Trash2, ChevronRight, Plus } from "lucide-react";
import type { Project } from "@shared/schema";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "초안", color: "text-muted-foreground border-muted-foreground/30 bg-muted-foreground/10" },
  needs_review: { label: "검수 필요", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" },
  approved: { label: "승인", color: "text-green-400 border-green-400/30 bg-green-400/10" },
  rejected: { label: "반려", color: "text-red-400 border-red-400/30 bg-red-400/10" },
};

const TONE_LABELS: Record<string, string> = {
  easy_explainer: "쉬운 설명",
  neutral_news: "중립 뉴스",
  daily_conversation: "일상 대화",
};

export default function HistoryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () => apiRequest<Project[]>("/api/projects"),
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) =>
      apiRequest(`/api/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "삭제 완료" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold" style={{ fontFamily: "'Cabinet Grotesk', sans-serif" }}>
            히스토리
          </h1>
          <p className="text-sm text-muted-foreground">생성된 대본 목록</p>
        </div>
        <Link href="/">
          <a>
            <Button size="sm" data-testid="button-new">
              <Plus size={14} className="mr-1.5" />
              새 대본
            </Button>
          </a>
        </Link>
      </div>

      {/* List */}
      {!projects?.length ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
          <p className="text-muted-foreground text-sm">아직 생성된 대본이 없습니다.</p>
          <Link href="/">
            <a>
              <Button size="sm" variant="outline">첫 대본 만들기</Button>
            </a>
          </Link>
        </div>
      ) : (
        <div className="space-y-3" data-testid="project-list">
          {projects.map((p) => {
            let topic = "";
            try {
              const parsed = JSON.parse(p.scriptJson || "{}");
              topic = parsed.topic || p.articleTitle || "";
            } catch { topic = p.articleTitle || ""; }

            const statusCfg = STATUS_CONFIG[p.reviewStatus] || STATUS_CONFIG["draft"];
            const dateStr = (() => {
              try {
                return format(new Date(p.createdAt), "M월 d일 HH:mm", { locale: ko });
              } catch { return p.createdAt.slice(0, 16); }
            })();

            return (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
                data-testid={`card-project-${p.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>
                        {statusCfg.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{dateStr}</span>
                      <span className="text-xs text-muted-foreground">
                        {TONE_LABELS[p.tone] || p.tone}
                      </span>
                      {p.topicAngle && (
                        <span className="text-xs text-muted-foreground">· {p.topicAngle}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">
                      {topic || "(주제 없음)"}
                    </p>
                    {p.publisher && (
                      <p className="text-xs text-muted-foreground">{p.publisher}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`/api/projects/${p.projectId}/export`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-export-${p.id}`}>
                        <FileJson size={15} />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(p.projectId)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${p.id}`}
                    >
                      <Trash2 size={15} />
                    </Button>
                    <Link href={`/review/${p.projectId}`}>
                      <a>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-review-${p.id}`}>
                          <ChevronRight size={15} />
                        </Button>
                      </a>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

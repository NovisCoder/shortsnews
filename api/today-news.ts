export default function handler() {
  return new Response(
    JSON.stringify({
      ok: true,
      headline: "테스트용 오늘의 핵심 뉴스",
      summary: "이 JSON이 보이면 Vercel 함수는 정상 작동합니다.",
      keywords: ["테스트", "Vercel", "정상작동"],
      articles: [
        {
          title: "테스트 기사 1",
          url: "https://example.com/1",
          source: "Test Source",
          publishedAt: "2026-04-14T22:20:00+09:00"
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

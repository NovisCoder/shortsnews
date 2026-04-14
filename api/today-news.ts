export default async function handler(req: Request) {
  return new Response(
    JSON.stringify({
      headline: "테스트용 오늘의 핵심 뉴스",
      summary: "이 응답이 보이면 Vercel API 함수는 정상 작동 중입니다.",
      keywords: ["테스트", "Vercel", "뉴스"],
      articles: [
        {
          title: "테스트 기사 1",
          url: "https://example.com/1",
          source: "Test Source",
          publishedAt: "2026-04-14T22:10:00+09:00"
        },
        {
          title: "테스트 기사 2",
          url: "https://example.com/2",
          source: "Test Source",
          publishedAt: "2026-04-14T22:10:00+09:00"
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    }
  );
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const googleNewsRssUrl =
      "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko";

    const rssToJsonUrl =
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
        googleNewsRssUrl
      )}`;

    const response = await fetch(rssToJsonUrl);

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

    const first = articles[0];
    const headline = first?.title || "오늘의 핵심 뉴스";

    const keywords = headline
      .split(/[,\-\|\·\[\]\(\)\/\s]+/)
      .map((word: string) => word.trim())
      .filter((word: string) => word.length >= 2)
      .slice(0, 5);

    const body = {
      headline,
      summary:
        "오늘 많이 다뤄지는 이슈를 기준으로 관련 기사들을 모아봤어요. 아래 링크를 눌러 원문을 확인할 수 있습니다.",
      keywords,
      articles,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";

    return new Response(
      JSON.stringify({
        message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

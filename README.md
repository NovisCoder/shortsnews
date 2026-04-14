# 쇼츠뉴스 MVP

뉴스 기사 URL 또는 텍스트 → 60초 유튜브 쇼츠 대본 + MP4 영상 자동 생성 도구

## 🚀 바로 실행

[![Open App](https://img.shields.io/badge/▶%20앱%20바로가기-쇼츠뉴스-blue?style=for-the-badge)](https://www.perplexity.ai/computer/a/syoceunyuseu-mvp-u_jc8aO7RwmDMPEAWFqerA)

> **링크 클릭 → Perplexity Computer 앱이 바로 열립니다.**  
> Gemini API 키를 처음 한 번만 입력하고 저장하면 이후 자동 로드됩니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 대본 자동 생성 | 뉴스 URL 또는 텍스트 → 60초 쇼츠 대본 6섹션 자동 생성 |
| 대본 검수 | 오프닝·주제·요약·무슨일이·일상영향·아는척 멘트 인라인 편집 |
| GitHub 자동 저장 | 승인 시 `scripts/` 폴더에 JSON 자동 커밋 |
| **영상 자동 생성** | 승인 후 버튼 하나로 TTS + 자막 + 9:16 MP4 자동 합성 |
| API 키 서버 저장 | 처음 한 번 입력·저장하면 이후 자동 로드 (재입력 불필요) |

## 워크플로

```
기사 URL/텍스트 입력
       ↓
Gemini로 대본 자동 생성
       ↓
검수 화면에서 편집 + 승인 → scripts/ 폴더에 JSON 자동 저장 (GitHub)
       ↓
영상 생성 버튼 → TTS 음성 + 자막 합성 → 9:16 MP4 다운로드
```

## 필요한 키

| 키 | 용도 | 발급 |
|----|------|------|
| **Google Gemini API 키** | 대본 생성 + TTS 음성 | [aistudio.google.com](https://aistudio.google.com/apikey) — 무료 |
| **GitHub Personal Access Token** | 승인 대본 자동 저장 (선택) | [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=ShortsNews) — `repo` 권한 |

> 키는 앱 내 설정에서 저장하면 서버 DB에 보관되어 다음 방문부터 자동 입력됩니다.

## 로컬 실행

```bash
# 의존성 설치 (최초 1회)
npm install

# 개발 서버 시작
npm run dev
# → http://localhost:5000
```

### 프로덕션 빌드

```bash
npm run build
node dist/index.cjs
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React + Tailwind CSS + shadcn/ui + Wouter (hash routing) |
| Backend | Express + SQLite (better-sqlite3 + Drizzle ORM) |
| 대본 생성 LLM | Google Gemini 2.5 Flash-Lite (무료, 1000 RPD) |
| TTS | Google Gemini 2.5 Flash Preview TTS (무료, 10 RPM) |
| 영상 합성 | ffmpeg (이미지 슬라이드 + 자막 오버레이 + WAV 오디오) |
| 저장소 | GitHub API (대본 JSON 자동 커밋) |

## 프로젝트 구조

```
client/          # React 프론트엔드
  src/pages/
    GeneratePage.tsx   # 기사 입력 + API 키 설정
    ReviewPage.tsx     # 대본 검수 + 영상 생성
    HistoryPage.tsx    # 생성 히스토리
server/          # Express 백엔드
  routes.ts            # API 라우트
  storage.ts           # SQLite CRUD
  video_pipeline.ts    # TTS + ffmpeg 영상 합성 파이프라인
shared/          # Drizzle ORM 스키마
scripts/         # 승인된 대본 JSON 저장 위치 (자동 커밋)
```

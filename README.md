# 쇼츠뉴스 MVP

뉴스 기사 URL 또는 텍스트 → 60초 유튜브 쇼츠 대본 자동 생성 도구

## 🚀 바로 실행

[![Open App](https://img.shields.io/badge/▶%20앱%20바로가기-쇼츠뉴스-blue?style=for-the-badge)](https://www.perplexity.ai/computer/a/syoceunyuseu-mvp-u_jc8aO7RwmDMPEAWFqerA)

> **링크 클릭 → Perplexity Computer 앱이 바로 열립니다.**  
> Gemini API 키와 (선택) GitHub 토큰만 입력하면 바로 사용 가능합니다.

## 로컬 실행 방법

### 사전 준비
- [Node.js 18+](https://nodejs.org) 설치 필요

### 실행
```bash
# 1. 의존성 설치 (최초 1회)
npm install

# 2. 개발 서버 시작
npm run dev
```

브라우저에서 `http://localhost:5000` 접속

### 프로덕션 빌드
```bash
npm run build
node dist/index.cjs
```

## 필요한 키
- **Google Gemini API 키** — [aistudio.google.com](https://aistudio.google.com/apikey) 에서 무료 발급
- **GitHub Personal Access Token** (선택) — 승인 시 대본 자동 저장용. `repo` 권한 필요

## 구조
```
client/       # React 프론트엔드
server/       # Express 백엔드
shared/       # 공통 스키마 (Drizzle ORM)
scripts/      # 승인된 대본 JSON 저장 폴더
```

## 기술 스택
- Frontend: React + Tailwind CSS + shadcn/ui
- Backend: Express + SQLite (better-sqlite3)
- LLM: Google Gemini 2.5 Flash-Lite
- ORM: Drizzle

# 쇼츠뉴스 MVP

뉴스 기사 URL 또는 텍스트 → 60초 유튜브 쇼츠 대본 자동 생성 도구

## 🚀 로컬 실행

```bash
# 의존성 설치 (최초 1회)
npm install

# 개발 서버 시작
npm run dev
# → http://localhost:5000
```

## 🌐 배포 방법 (Railway 추천)

이 앱은 **Express 서버 + SQLite DB**가 필요해서 Vercel 단독으로는 동작하지 않습니다.

### Railway 배포 (무료 플랜 가능)

1. [railway.app](https://railway.app) 접속 → GitHub으로 로그인
2. **New Project** → **Deploy from GitHub repo** → 이 저장소 선택
3. 환경변수 설정:
   - `NODE_ENV` = `production`
   - `PORT` = `5000`
4. **Deploy** 클릭

Railway는 `package.json`의 `build` → `start` 명령을 자동 실행합니다.

### 환경변수 (선택)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `5000` |
| `DB_PATH` | SQLite DB 파일 경로 | `./shortsnews.db` |

## 📋 필요한 키

| 키 | 용도 | 발급 |
|----|------|------|
| **Google Gemini API 키** | 대본 생성 + TTS | [aistudio.google.com](https://aistudio.google.com/apikey) — 무료 |
| **GitHub Personal Access Token** | 승인 대본 자동 저장 (선택) | [github.com/settings/tokens](https://github.com/settings/tokens) — `repo` 권한 |

## 🛠 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React + Tailwind CSS + shadcn/ui |
| Backend | Express + SQLite (Drizzle ORM) |
| 대본 생성 | Google Gemini 2.5 Flash-Lite |
| TTS | Google Gemini 2.5 Flash Preview TTS |
| 영상 합성 | ffmpeg (서버 환경 필요) |

## 📁 프로젝트 구조

```
client/          # React 프론트엔드
server/          # Express 백엔드
shared/          # DB 스키마 (Drizzle ORM)
scripts/         # 승인된 대본 JSON (GitHub 자동 커밋)
```

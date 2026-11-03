# 나의 가계부

HTML/CSS/JavaScript + Node.js(Express) + Neon PostgreSQL로 만든 개인 가계부입니다. Vercel에 배포할 수 있습니다.

## 기능

- 지출 내역 추가 · 조회 · 수정 · 삭제 (날짜, 항목, 카테고리, 금액)
- 날짜별 지출 검색 (시작일~종료일, 오늘 / 이번 달 / 전체 바로가기)
- 월별 지출 합계 (연도 선택)
- 카테고리별 지출 합계 및 막대그래프 (월 선택)
- 비밀번호 로그인 (`APP_PASSWORD`)

## 폴더 구조

```
api/index.js      Vercel 서버리스 함수 진입점 (/api/* 처리)
lib/app.js        Express 앱 (API 라우트)
lib/auth.js       비밀번호 확인 · 서명된 세션 쿠키
lib/db.js         Neon 연결 (DATABASE_URL) · 테이블 자동 생성
db/schema.sql     테이블 정의
db/init.js        테이블 생성 스크립트 (npm run db:init)
public/           프런트엔드 (index.html, style.css, app.js)
dev-server.js     로컬 실행용 서버
vercel.json       Vercel 라우팅 설정
```

## 로컬 실행

1. 패키지 설치
   ```bash
   npm install
   ```
2. `.env.example`을 `.env`로 복사하고 값을 채웁니다.
   ```
   DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
   APP_PASSWORD=원하는-비밀번호
   ```
   `DATABASE_URL`은 Neon 콘솔 → 프로젝트 → **Connect**에서 복사합니다.
3. (선택) 테이블 미리 만들기. 첫 API 요청 때도 자동으로 만들어집니다.
   ```bash
   npm run db:init
   ```
4. 서버 실행 후 http://localhost:3000 접속
   ```bash
   npm start        # 또는 npm run dev (파일 변경 시 자동 재시작)
   ```

## GitHub + Vercel 배포

1. GitHub에 새 저장소를 만들고 푸시합니다. (`.env`는 `.gitignore`에 있어서 올라가지 않습니다.)
   ```bash
   git add .
   git commit -m "가계부 웹앱"
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
2. Vercel → **Add New… → Project**에서 해당 저장소를 Import합니다. Framework Preset은 **Other** 그대로 둡니다.
3. **Settings → Environment Variables**에 다음 값을 추가합니다.
   - `DATABASE_URL`: Neon 연결 문자열
   - `APP_PASSWORD`: 로그인 비밀번호
   - `SESSION_SECRET` (선택): 임의의 긴 문자열
4. Deploy를 누릅니다. 환경변수를 나중에 바꿨다면 **Redeploy**해야 반영됩니다.

> Vercel 대시보드의 Neon 연동(Storage → Neon)을 쓰면 `DATABASE_URL`이 자동으로 등록됩니다.

## 보안

- `DATABASE_URL`과 `APP_PASSWORD`는 서버 환경변수로만 읽고, 브라우저로 보내는 코드나 응답에는 포함하지 않습니다. DB 오류의 상세 내용은 서버 로그에만 남깁니다.
- 로그인하면 HMAC으로 서명된 `HttpOnly` · `SameSite=Strict` 쿠키(HTTPS에서는 `Secure`)를 7일간 발급합니다. 서명은 서버에서 검증합니다.
- `APP_PASSWORD`나 `SESSION_SECRET`을 바꾸면 기존 로그인은 모두 만료됩니다.
- 모든 SQL은 파라미터 바인딩으로 실행합니다(SQL 인젝션 방지). 화면 출력은 `textContent`를 사용합니다(XSS 방지).
- 로그인 실패가 반복되면 일시적으로 막습니다(서버 인스턴스 단위의 간단한 제한).

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/login` | `{ password }` 로그인 |
| POST | `/api/logout` | 로그아웃 |
| GET | `/api/me` | 로그인 여부 |
| GET | `/api/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD` | 내역 조회 (기간 선택) |
| POST | `/api/expenses` | `{ date, item, category, amount }` 추가 |
| PUT | `/api/expenses/:id` | 수정 |
| DELETE | `/api/expenses/:id` | 삭제 |
| GET | `/api/summary/monthly?year=2026` | 월별 합계 |
| GET | `/api/summary/category?month=2026-11` | 카테고리별 합계 |

// Vercel 서버리스 함수 진입점: /api/* 요청은 vercel.json의 rewrite로 이곳에 전달된다.
import app from '../lib/app.js';

export default app;

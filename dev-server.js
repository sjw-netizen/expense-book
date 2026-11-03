// 로컬 개발용 서버: .env를 읽고 정적 파일(public/)과 API를 함께 제공한다.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import app from './lib/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const server = express();
server.disable('x-powered-by');
server.use(app);
server.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`가계부 서버 실행 중: http://localhost:${PORT}`);
  if (!process.env.DATABASE_URL) console.warn('경고: DATABASE_URL이 설정되지 않았습니다 (.env 확인).');
  if (!process.env.APP_PASSWORD) console.warn('경고: APP_PASSWORD가 설정되지 않았습니다 (.env 확인).');
});

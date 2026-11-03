// 사용법: npm run db:init  — Neon에 expenses 테이블을 만든다.
import 'dotenv/config';
import { ensureSchema } from '../lib/db.js';

try {
  await ensureSchema();
  console.log('expenses 테이블 준비 완료');
} catch (err) {
  console.error('테이블 생성 실패:', err.message);
  process.exit(1);
}

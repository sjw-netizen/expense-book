import { neon } from '@neondatabase/serverless';

let sqlClient;
let schemaReady;

// DATABASE_URL은 서버에서만 읽으며, 클라이언트로 절대 전달하지 않는다.
export function getSql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
    sqlClient = neon(url);
  }
  return sqlClient;
}

// 첫 요청 시 테이블이 없으면 만든다. (서버리스 인스턴스당 한 번)
export function ensureSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS expenses (
          id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          date     DATE    NOT NULL,
          item     TEXT    NOT NULL,
          category TEXT    NOT NULL,
          amount   INTEGER NOT NULL
        )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date)`;
    })().catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  }
  return schemaReady;
}

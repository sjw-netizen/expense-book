CREATE TABLE IF NOT EXISTS expenses (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date     DATE    NOT NULL,
  item     TEXT    NOT NULL,
  category TEXT    NOT NULL,
  amount   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);

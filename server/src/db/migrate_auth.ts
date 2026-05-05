import "dotenv/config";
import { query, testConnection } from "./index";

const migrations = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(255) NOT NULL,
    email        VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS sessions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(512) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(512) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='meetings' AND column_name='user_id'
    ) THEN
      ALTER TABLE meetings ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
  `,

  `CREATE INDEX IF NOT EXISTS idx_sessions_token     ON sessions(token);`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_prt_token          ON password_reset_tokens(token);`,
  `CREATE INDEX IF NOT EXISTS idx_meetings_user_id   ON meetings(user_id);`,

  `
  DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `,

  `
  CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS void AS $$
  BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
    DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE;
  END;
  $$ LANGUAGE plpgsql;
  `,
];

async function migrate() {
  console.log("Running auth migrations...");
  const connected = await testConnection();
  if (!connected) process.exit(1);

  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      console.log(`Auth migration ${i + 1}/${migrations.length} ✓`);
    } catch (err) {
      console.error(`Auth migration ${i + 1} failed:`, err);
      process.exit(1);
    }
  }
  console.log("Auth migrations complete!");
  process.exit(0);
}

migrate();
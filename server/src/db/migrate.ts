// src/db/migrate.ts
import "dotenv/config";
import { query, testConnection } from "./index";

const migrations = [
  `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  `,

  `
  CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    duration VARCHAR(50),
    participants TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('completed', 'processing', 'scheduled')),
    tags TEXT[] NOT NULL DEFAULT '{}',
    summary TEXT,
    audio_file_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS action_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    assignee VARCHAR(255) NOT NULL,
    due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS transcript_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    timestamp VARCHAR(20) NOT NULL,
    sequence_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS embeddings_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    pinecone_vector_id VARCHAR(500) NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,

  `
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ language 'plpgsql';
  `,

  `
  DROP TRIGGER IF EXISTS update_meetings_updated_at ON meetings;
  CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `,

  `CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);`,
  `CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON action_items(meeting_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transcript_entries_meeting_id ON transcript_entries(meeting_id, sequence_order);`,
  `CREATE INDEX IF NOT EXISTS idx_decisions_meeting_id ON decisions(meeting_id);`,
];

async function migrate() {
  console.log("Starting database migration...");

  const connected = await testConnection();
  if (!connected) {
    process.exit(1);
  }

  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      console.log(`Migration ${i + 1}/${migrations.length} completed`);
    } catch (err) {
      console.error(`Migration ${i + 1} failed:`, err);
      process.exit(1);
    }
  }

  console.log("All migrations completed successfully!");
  process.exit(0);
}

migrate();
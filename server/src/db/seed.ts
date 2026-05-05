// src/db/seed.ts
import "dotenv/config";
import { query, testConnection, transaction, getClient } from "./index";
import { PoolClient } from "pg";

async function seed() {
  console.log("🌱 Seeding database...");

  const connected = await testConnection();
  if (!connected) process.exit(1);

  await transaction(async (client: PoolClient) => {
    // Clear existing data
    await client.query("DELETE FROM embeddings_log");
    await client.query("DELETE FROM decisions");
    await client.query("DELETE FROM transcript_entries");
    await client.query("DELETE FROM action_items");
    await client.query("DELETE FROM meetings");

    // Seed meetings
    const m1 = await client.query(
      `INSERT INTO meetings (title, date, duration, participants, status, tags, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        "Q1 Product Strategy Review",
        "2026-03-10T10:00:00Z",
        "58 min",
        ["Sarah Chen", "Marcus Rivera", "Priya Patel", "James O'Brien"],
        "completed",
        ["strategy", "product", "quarterly"],
        "The team reviewed Q1 progress against OKRs. The mobile app launch exceeded targets with 45K downloads in the first two weeks. Discussion focused on prioritizing the AI-powered search feature for Q2, with concerns about timeline given the current engineering bandwidth. Marketing proposed a phased rollout approach that was well-received.",
      ]
    );

    const m2 = await client.query(
      `INSERT INTO meetings (title, date, duration, participants, status, tags, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        "Engineering Sprint Retrospective",
        "2026-03-09T14:00:00Z",
        "42 min",
        ["Marcus Rivera", "Alex Kim", "Dana Torres"],
        "completed",
        ["engineering", "sprint", "retro"],
        "Sprint 24 retrospective. Team achieved 92% sprint completion rate. Key blocker was CI/CD pipeline instability causing 6 hours of lost productivity.",
      ]
    );

    const m3 = await client.query(
      `INSERT INTO meetings (title, date, duration, participants, status, tags, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        "Client Onboarding - Meridian Corp",
        "2026-03-08T09:00:00Z",
        "35 min",
        ["Priya Patel", "Tom Nguyen", "Client: Lisa Park"],
        "completed",
        ["client", "onboarding", "sales"],
        "Initial onboarding call with Meridian Corp. Discussed implementation timeline, data migration requirements, and training schedule.",
      ]
    );

    const m4 = await client.query(
      `INSERT INTO meetings (title, date, duration, participants, status, tags)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        "Design System Workshop",
        "2026-03-11T13:00:00Z",
        "1h 15min",
        ["James O'Brien", "Maya Johnson", "Sarah Chen"],
        "processing",
        ["design", "workshop"],
      ]
    );

    const m1Id = m1.rows[0].id;
    const m2Id = m2.rows[0].id;
    const m3Id = m3.rows[0].id;

    // Seed action items
    await client.query(
      `INSERT INTO action_items (meeting_id, text, assignee, due_date, completed) VALUES
       ($1, 'Draft Q2 roadmap with AI search feature timeline', 'Sarah Chen', '2026-03-17', false),
       ($1, 'Prepare engineering capacity analysis', 'Marcus Rivera', '2026-03-14', true),
       ($1, 'Create phased rollout plan for marketing', 'Priya Patel', '2026-03-20', false),
       ($1, 'Schedule follow-up with design team', 'James O''Brien', '2026-03-12', true)`,
      [m1Id]
    );

    await client.query(
      `INSERT INTO action_items (meeting_id, text, assignee, due_date, completed) VALUES
       ($1, 'Fix CI/CD pipeline flaky tests', 'Alex Kim', '2026-03-13', false),
       ($1, 'Update sprint estimation guidelines', 'Dana Torres', '2026-03-11', true)`,
      [m2Id]
    );

    await client.query(
      `INSERT INTO action_items (meeting_id, text, assignee, due_date, completed) VALUES
       ($1, 'Send implementation timeline document', 'Tom Nguyen', '2026-03-10', true),
       ($1, 'Schedule data migration dry run', 'Priya Patel', '2026-03-15', false)`,
      [m3Id]
    );

    // Seed decisions
    await client.query(
      `INSERT INTO decisions (meeting_id, text) VALUES
       ($1, 'AI search feature will be the primary Q2 focus'),
       ($1, 'Phased rollout approach approved for new features'),
       ($1, 'Engineering will hire 2 additional senior developers'),
       ($1, 'Weekly sync meetings reduced to bi-weekly')`,
      [m1Id]
    );

    await client.query(
      `INSERT INTO decisions (meeting_id, text) VALUES
       ($1, 'Allocate 20% of next sprint to tech debt'),
       ($1, 'Adopt new code review process')`,
      [m2Id]
    );

    await client.query(
      `INSERT INTO decisions (meeting_id, text) VALUES
       ($1, 'Go-live date set for April 1st'),
       ($1, 'Weekly check-in calls during onboarding')`,
      [m3Id]
    );

    // Seed transcript
    const transcriptEntries = [
      { speaker: "Sarah Chen", text: "Let's start with the Q1 review. I'm pleased to report that the mobile app launch has been a significant success.", timestamp: "00:00:12" },
      { speaker: "Sarah Chen", text: "We hit 45,000 downloads in just two weeks, which is 150% of our target.", timestamp: "00:00:28" },
      { speaker: "Marcus Rivera", text: "That's great news. The engineering team really pulled together on this one.", timestamp: "00:00:45" },
      { speaker: "Priya Patel", text: "From the marketing side, the launch campaign exceeded expectations. Social media engagement was up 300%.", timestamp: "00:01:15" },
      { speaker: "James O'Brien", text: "The design feedback has been overwhelmingly positive. Users love the dark mode implementation.", timestamp: "00:01:42" },
      { speaker: "Sarah Chen", text: "Now let's discuss Q2 priorities. The AI-powered search feature is time to move to the top.", timestamp: "00:02:10" },
      { speaker: "Marcus Rivera", text: "I have some concerns about the timeline. Our current engineering bandwidth is stretched.", timestamp: "00:02:35" },
      { speaker: "Priya Patel", text: "What if we do a phased rollout? Launch a basic version first and iterate based on user feedback.", timestamp: "00:03:00" },
      { speaker: "Sarah Chen", text: "I like that approach. Marcus, would that be more feasible from an engineering perspective?", timestamp: "00:03:22" },
      { speaker: "Marcus Rivera", text: "Yes, a phased approach would work much better. We could have phase one ready by end of April.", timestamp: "00:03:40" },
    ];

    for (let i = 0; i < transcriptEntries.length; i++) {
      const e = transcriptEntries[i];
      await client.query(
        `INSERT INTO transcript_entries (meeting_id, speaker, text, timestamp, sequence_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [m1Id, e.speaker, e.text, e.timestamp, i + 1]
      );
    }

    console.log("✅ Seed data inserted");
  });

  console.log("🎉 Database seeded successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
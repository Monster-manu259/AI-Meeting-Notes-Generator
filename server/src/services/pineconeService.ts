import { Pinecone, Index, RecordMetadata } from "@pinecone-database/pinecone";
import { logger } from "../middleware/logger";

let pineconeClient: Pinecone | null = null;
let pineconeIndex: Index | null = null;

const VECTOR_DIMENSION = 1024;

function getPineconeClient(): Pinecone {
  if (pineconeClient) return pineconeClient;
  if (!process.env.PINECONE_API_KEY) {
    throw new Error("PINECONE_API_KEY environment variable is required");
  }
  pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pineconeClient;
}

async function getPineconeIndex(): Promise<Index> {
  if (pineconeIndex) return pineconeIndex;

  const client = getPineconeClient();
  const indexName = process.env.PINECONE_INDEX_NAME ?? "meetingmind-embeddings";

  const existingIndexes = await client.listIndexes();
  const exists = existingIndexes.indexes?.some((idx) => idx.name === indexName);

  if (!exists) {
    logger.info(`Creating Pinecone index: ${indexName}`);
    await client.createIndex({
      name: indexName,
      dimension: VECTOR_DIMENSION,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: process.env.PINECONE_REGION ?? "us-east-1",
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    logger.info(`Pinecone index created: ${indexName}`);
  }

  pineconeIndex = client.index(indexName);
  return pineconeIndex;
}

function textToVector(text: string): number[] {
  const vector = new Array(VECTOR_DIMENSION).fill(0) as number[];
  const words = text.toLowerCase().split(/\s+/);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) % VECTOR_DIMENSION;
    }
    vector[hash] = (vector[hash] ?? 0) + 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return magnitude > 0 ? vector.map((v) => v / magnitude) : vector;
}

export interface VectorRecord {
  id: string;
  text: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  contentType: "summary" | "transcript" | "action_item" | "decision";
}

export async function upsertMeetingVectors(records: VectorRecord[]): Promise<void> {
  const index = await getPineconeIndex();

  const pineconeRecords = records.map((rec) => ({
    id: rec.id,
    values: textToVector(rec.text),
    metadata: {
      meetingId: rec.meetingId,
      meetingTitle: rec.meetingTitle,
      meetingDate: rec.meetingDate,
      contentType: rec.contentType,
      text: rec.text.slice(0, 1000),
    } as RecordMetadata,
  }));

 
  const batchSize = 100;
  for (let i = 0; i < pineconeRecords.length; i += batchSize) {
    const batch = pineconeRecords.slice(i, i + batchSize);
await index.upsert(batch);
  }

  logger.info(`Upserted ${pineconeRecords.length} vectors`);
}

export async function searchSimilarContent(
  queryText: string,
  topK = 5,
  filter?: { meetingId?: string }
): Promise<
  Array<{
    id: string;
    score: number;
    meetingId: string;
    meetingTitle: string;
    meetingDate: string;
    contentType: string;
    text: string;
  }>
> {
  const index = await getPineconeIndex();
  const queryVector = textToVector(queryText);

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    ...(filter?.meetingId
      ? { filter: { meetingId: { $eq: filter.meetingId } } }
      : {}),
  });

  return (results.matches ?? []).map((match) => ({
    id: match.id,
    score: match.score ?? 0,
    meetingId: (match.metadata?.meetingId as string) ?? "",
    meetingTitle: (match.metadata?.meetingTitle as string) ?? "",
    meetingDate: (match.metadata?.meetingDate as string) ?? "",
    contentType: (match.metadata?.contentType as string) ?? "",
    text: (match.metadata?.text as string) ?? "",
  }));
}

export async function deleteMeetingVectors(meetingId: string): Promise<void> {
  const index = await getPineconeIndex();

  const dummyVector = new Array(VECTOR_DIMENSION).fill(0) as number[];
  dummyVector[0] = 1;

  const results = await index.query({
    vector: dummyVector,
    topK: 1000,
    includeMetadata: false,
    filter: { meetingId: { $eq: meetingId } },
  });

  const ids = (results.matches ?? []).map((m) => m.id);

  if (ids.length === 0) {
    logger.info(`No vectors found for meeting: ${meetingId}`);
    return;
  }

  await index.deleteMany(ids);
  logger.info(`Deleted ${ids.length} vectors for meeting: ${meetingId}`);
}

export async function getIndexStats(): Promise<{
  totalVectors: number;
  dimension: number;
}> {
  const index = await getPineconeIndex();
  const stats = await index.describeIndexStats();
  return {
    totalVectors: stats.totalRecordCount ?? 0,
    dimension: stats.dimension ?? VECTOR_DIMENSION,
  };
}

export async function testPineconeConnection(): Promise<boolean> {
  try {
    await getPineconeIndex();
    logger.info("Pinecone connected successfully");
    return true;
  } catch (err) {
    logger.error("Pinecone connection failed", err);
    return false;
  }
}
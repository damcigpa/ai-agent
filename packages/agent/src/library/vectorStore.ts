// Vector store: the searchable index of the library's text chunks.
// Implements specs/material-library/material-library.plan.md — TD-1, TD-2 (serves AC-9, AC-10, AC-12).
//
// LanceDB is used through its native API (the LangChain wrapper has no delete and no
// filter). Embeddings are injected, so tests run with fake vectors and no network.
// Nothing outside this file knows about LanceDB.

import { connect, type Connection, type Table } from "@lancedb/lancedb";
import { resolve } from "path";

const TABLE = "chunks";

// What the store needs from an embedding provider. LangChain's VoyageEmbeddings fits it.
export interface Embedder {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface Chunk {
  text: string;
  sourceKind: "text" | "image";
}

export interface SearchHit {
  text: string;
  file: string;
  chunkIndex: number;
  sourceKind: "text" | "image";
  distance: number; // smaller = closer in meaning
}

export interface ChunkStore {
  // Deletes every chunk of `file` first, then writes the new ones. Safe to call for a
  // file that is already indexed — it never leaves duplicates (manifest loss is harmless).
  replaceFile(file: string, fileHash: string, chunks: Chunk[]): Promise<void>;
  // Removes every chunk of `file` (AC-10). A no-op if there are none.
  deleteFile(file: string): Promise<void>;
  // The `k` chunks closest in meaning to `query`. Empty if nothing is indexed (AC-17).
  search(query: string, k: number): Promise<SearchHit[]>;
}

// Resolved at call time, not at import time, so tests can pass their own folder.
export function defaultDbDir(): string {
  return resolve(process.cwd(), "data", "lancedb");
}

// Values go into a filter string: wrap in quotes and escape ' as ''.
const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function openChunkStore(embedder: Embedder, dbDir: string = defaultDbDir()): ChunkStore {
  let connection: Connection | null = null;

  const db = async () => (connection ??= await connect(dbDir));

  // The table does not exist until the first chunks are written.
   const existingTable = async (): Promise<Table | null> => {
    const conn = await db();

    // listTables replaces the deprecated tableNames. It is paged: a page can be
    // shorter than the limit without being the last, so walk until no page token is left.
    let pageToken: string | undefined;
    do {
      const page = await conn.listTables({ pageToken, limit: 100 });
      if (page.tables.includes(TABLE)) return conn.openTable(TABLE);
      pageToken = page.pageToken;
    } while (pageToken);

    return null;
  };

  const deleteFile = async (file: string) => {
    const table = await existingTable();
    if (table) await table.delete(`file = ${sqlString(file)}`);
  };

  return {
    deleteFile,

    async replaceFile(file, fileHash, chunks) {
      // Embed first: if the embedding fails, the old chunks are still there.
      const vectors = chunks.length ? await embedder.embedDocuments(chunks.map((c) => c.text)) : [];
      if (vectors.length !== chunks.length) {
        throw new Error(`Embedder returned ${vectors.length} vectors for ${chunks.length} chunks`);
      }

      await deleteFile(file);
      if (chunks.length === 0) return;

      const rows = chunks.map((chunk, chunkIndex) => ({
        vector: vectors[chunkIndex],
        text: chunk.text,
        file,
        fileHash,
        chunkIndex,
        sourceKind: chunk.sourceKind,
      }));

      const table = await existingTable();
      if (table) await table.add(rows);
      else await (await db()).createTable(TABLE, rows);
    },

    async search(query, k) {
      const table = await existingTable();
      if (!table || k <= 0) return [];

      const queryVector = await embedder.embedQuery(query);
      const rows = await table.vectorSearch(queryVector).limit(k).toArray();

      return rows.map((row) => ({
        text: row.text as string,
        file: row.file as string,
        chunkIndex: Number(row.chunkIndex),
        sourceKind: row.sourceKind as "text" | "image",
        distance: Number(row._distance),
      }));
    },
  };
}

// The real embedder: Voyage AI through LangChain. Created on demand (not at import time),
// so a missing key only fails where embeddings are actually needed.
// Two instances, because Voyage embeds documents and questions differently.
export async function createVoyageEmbedder(model: string = "voyage-4"): Promise<Embedder> {
  if (!process.env.VOYAGEAI_API_KEY) {
    throw new Error("VOYAGEAI_API_KEY is missing — add it to .env");
  }
  const { VoyageEmbeddings } = await import("@langchain/community/embeddings/voyage");

  // modelName must be explicit: the class defaults to a legacy model
  const documents = new VoyageEmbeddings({ modelName: model, inputType: "document" });
  const queries = new VoyageEmbeddings({ modelName: model, inputType: "query" });

  return {
    embedDocuments: (texts) => documents.embedDocuments(texts),
    embedQuery: (text) => queries.embedQuery(text),
  };
}
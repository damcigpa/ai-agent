// Spike for specs/topic-quiz/topic-quiz.plan.md — task T2.
// Checks, before building on them:
//   TD-1  Voyage embeddings through LangChain find Hungarian text by meaning
//   TD-2  LanceDB stores to disk, filters by topic (AC-8) and deletes by file (AC-6)
// Makes exactly 2 Voyage API requests (fits the 3 requests/minute free-trial limit).
//
// Run from packages/agent:  npx tsx spikes/voyageLance.ts

import "dotenv/config";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { connect } from "@lancedb/lancedb";
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";

const MODEL = "voyage-4"; // must be explicit: the class defaults to a legacy model

const chunks = [
  { topic: "Mohács", file: "jegyzet1.txt", text: "A mohácsi csatában 1526-ban II. Lajos serege súlyos vereséget szenvedett a törököktől." },
  { topic: "Mohács", file: "jegyzet2.txt", text: "Petőfi Sándor a Nemzeti dalt 1848. március 15-én szavalta el a Nemzeti Múzeum lépcsőjén." },
  { topic: "Mohács", file: "jegyzet3.txt", text: "A fotoszintézis során a növények a napfény energiáját használják fel cukor előállítására." },
  // decoy: very close in meaning to query 1, but in ANOTHER topic — the topic filter must hide it
  { topic: "Másik téma", file: "csali.txt", text: "1526-ban Mohácsnál a magyar király elesett a szultán hadseregével vívott ütközetben." },
];

// No query shares a content word with its expected chunk — only the meaning matches.
const queries = [
  { question: "Melyik ütközetben bukott el az uralkodó az oszmánokkal szemben?", expectedFile: "jegyzet1.txt" },
  { question: "Ki adta elő a forradalom versét Pesten?", expectedFile: "jegyzet2.txt" },
  { question: "Hogyan termelnek táplálékot a zöld élőlények fényből?", expectedFile: "jegyzet3.txt" },
];

const sql = (value: string) => `'${value.replace(/'/g, "''")}'`; // escape for LanceDB filters

async function main() {
  if (!process.env.VOYAGEAI_API_KEY) throw new Error("VOYAGEAI_API_KEY is missing from .env");

  const dir = mkdtempSync(join(tmpdir(), "spike-lancedb-"));
  try {
    const docEmbeddings = new VoyageEmbeddings({ modelName: MODEL, inputType: "document" });
    const queryEmbeddings = new VoyageEmbeddings({ modelName: MODEL, inputType: "query" });

    console.log("1) Embedding chunks (1 request)...");
    const vectors = await docEmbeddings.embedDocuments(chunks.map((c) => c.text));
    console.log(`   dimension: ${vectors[0].length}`);

    const db = await connect(dir);
    const table = await db.createTable(
      "chunks",
      chunks.map((c, i) => ({ ...c, vector: vectors[i] })),
      { mode: "overwrite" },
    );

    console.log("2) Embedding queries (1 request)...");
    const queryVectors = await queryEmbeddings.embedDocuments(queries.map((q) => q.question));

    const search = async (vector: number[]) =>
      (await table.vectorSearch(vector).where(`topic = ${sql("Mohács")}`).limit(1).toArray())[0];

    console.log("3) Search by meaning, filtered to topic 'Mohács' (TD-1, AC-8)");
    let passed = 0;
    for (const [i, q] of queries.entries()) {
      const hit = await search(queryVectors[i]);
      const ok = hit?.file === q.expectedFile;
      if (ok) passed++;
      console.log(`   ${ok ? "PASS" : "FAIL"}  "${q.question}"`);
      console.log(`         → ${hit?.file}  (distance ${Number(hit?._distance).toFixed(3)})`);
    }

    console.log("4) Delete jegyzet3.txt, search again (AC-6)");
    await table.delete(`file = ${sql("jegyzet3.txt")}`);
    const afterDelete = await search(queryVectors[2]);
    const deleteOk = afterDelete?.file !== "jegyzet3.txt";
    console.log(`   ${deleteOk ? "PASS" : "FAIL"}  best hit now: ${afterDelete?.file}`);

    console.log("5) Reopen from disk (A-4)");
    const reopened = await (await connect(dir)).openTable("chunks");
    const rows = await reopened.countRows();
    const persistOk = rows === chunks.length - 1;
    console.log(`   ${persistOk ? "PASS" : "FAIL"}  rows on disk: ${rows}`);

    const allOk = passed === queries.length && deleteOk && persistOk;
    console.log(`\n${allOk ? "✅ Spike passed" : "❌ Spike failed"} — ${passed}/${queries.length} searches correct`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
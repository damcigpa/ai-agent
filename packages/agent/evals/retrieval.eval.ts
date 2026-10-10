// Eval: how well does the library search find the right passage?
// Measures retrieval ALONE — no Claude call. The material eval measures the judge on top of
// the search; this one answers the question underneath it: is the right chunk among the hits
// the judge gets to see? A RAG answer can only be as good as what was retrieved.
//
// What it measures, for several chunk sizes (sync.ts: "Tuned later with the evals"):
//   Hit@1     the first hit is the right passage
//   Recall@3  the right passage is in the top 3
//   Recall@5  the right passage is in the top 5 (the app passes 5 hits to the judge)
//   MRR@5     mean of 1/rank — rewards finding it early, 0 if not in the top 5
// broken down by question type (direct, paraphrase, cross-language, distractor), plus the
// distances of questions the library does NOT answer, to see whether a distance threshold
// alone could tell "no relevant material" apart.
//
// Uses the real embeddings (voyage-4, needs VOYAGEAI_API_KEY), batched: one request per
// chunk size + one for all questions, so it fits the free tier.
//
// Run from packages/agent:  npx tsx --env-file=.env evals/retrieval.eval.ts
// A Markdown report is written to evals/results/.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { openChunkStore, type Embedder, type SearchHit } from "../src/library/vectorStore.js";

const K = 5; // the app searches with k = 5 (agent.ts: chunkStore.search(question, 5))

// The current setting in sync.ts is 800/100; the others are the comparison.
const CONFIGS = [
  { chunkSize: 400, chunkOverlap: 50 },
  { chunkSize: 800, chunkOverlap: 100 },
  { chunkSize: 1500, chunkOverlap: 150 },
];
const CURRENT = 800;

// --- The sample library: eighth-grade exam topics, written like a student's notes ---
// Several notes deliberately overlap (two Ottoman battles, two poets, Hunyadi in two notes,
// 1849 in three) so a search that only matches names or years is caught out.

const NOTES: Record<string, string> = {
  "tatarjaras.txt": `A tatárjárás (1241–1242)

A mongolok (a korabeli források szerint tatárok) Batu kán vezetésével 1241 tavaszán törtek be Magyarországra. IV. Béla király serege 1241. április 11-én a Sajó folyó mellett, a muhi csatában súlyos vereséget szenvedett. A király elmenekült, egészen az Adriai-tenger partjáig, Trau váráig.

A mongolok egy évig pusztították az országot. 1242 tavaszán váratlanul kivonultak, valószínűleg azért, mert meghalt a nagykán, Ögödei, és Batu részt akart venni az utód megválasztásában.

A pusztítás után IV. Béla újjászervezte az országot, ezért "második honalapítónak" is nevezik. Felismerte, hogy a földvárak nem védenek meg, ezért kővárak építésére ösztönözte a nemeseket. Betelepítéseket is szervezett, hogy pótolja az elpusztult lakosságot, és befogadta a kunokat.`,

  "nandorfehervar.txt": `A nándorfehérvári diadal (1456)

Konstantinápoly eleste (1453) után II. Mehmed szultán Magyarország felé indult. Nándorfehérvár (a mai Belgrád) a déli végvárrendszer kulcsa volt.

A vár védelmét Hunyadi János szervezte meg. Mellette Kapisztrán János ferences szerzetes toborzott keresztes sereget, főleg parasztokból és városi szegényekből. A döntő összecsapás 1456. július 21–22-én zajlott: a védők visszaverték az ostromot, majd kitörtek a várból, és megfutamították a török sereget.

A győzelem után néhány héttel Hunyadi János a táborban kitört pestisjárványban meghalt (1456. augusztus 11.).

III. Callixtus pápa még a csata előtt elrendelte, hogy a templomokban délben szóljanak a harangok, és imádkozzanak a keresztény seregekért. A győzelem híre után ez a déli harangszó a nándorfehérvári diadal emlékévé vált, és ma is szól. A győzelem után a török hódítás hét évtizedre megakadt.`,

  "matyas_kiraly.txt": `Hunyadi Mátyás (uralkodott 1458–1490)

Mátyás Hunyadi János fia volt. 1458 januárjában a köznemesség támogatásával választották királlyá, alig tizenöt évesen. A Szent Koronát III. Frigyes császártól csak 1463-ban tudta visszaszerezni, ezért 1464-ben koronázták meg.

Hatalmának alapja az állandó zsoldos hadsereg, a fekete sereg volt. Ennek fenntartásához sok pénz kellett, ezért Mátyás új, rendkívüli adókat vezetett be (például a kincstári adót). Hadvezérei közül Kinizsi Pál 1479-ben a kenyérmezei csatában győzte le a törököket.

Mátyás nyugat felé terjeszkedett: elfoglalta Morvaországot, Sziléziát, 1485-ben pedig Bécset is, ahová udvarát áttette.

Udvara a reneszánsz kultúra központja lett, különösen második felesége, Aragóniai Beatrix érkezése (1476) után. Híres könyvtára, a Corvina (Bibliotheca Corviniana), a kor egyik leggazdagabb gyűjteménye volt: a díszes kódexeket korvináknak nevezzük. Mátyás 1490. április 6-án halt meg Bécsben, törvényes örökös nélkül.`,

  "janus_pannonius.txt": `Janus Pannonius (1434–1472)

Janus Pannonius (eredeti nevén Csezmiczei János) az első jelentős magyarországi humanista költő. Nagybátyja, Vitéz János váradi püspök taníttatta. Fiatalon Itáliába került: Ferrarában Guarino da Verona híres iskolájában tanult, majd Padovában jogot végzett.

Latin nyelven írt. Legismertebb műfaja az epigramma: rövid, csattanós, gyakran gúnyos vers. Hazatérése után Mátyás király pécsi püspökké nevezte ki.

Pannónia dicsérete című epigrammájában büszkén írja, hogy az ő versei révén Pannónia is híressé vált, amely addig Itáliától kapta a műveket. Búcsú Váradtól című elégiájában a város nevezetességeitől búcsúzik.

1471-ben részt vett a Vitéz János vezette összeesküvésben Mátyás ellen. Menekülés közben, Medvevárban halt meg 1472-ben.`,

  "mohacsi_csata.txt": `A mohácsi csata (1526)

A 16. század elején I. Szulejmán szultán vezetésével a Török Birodalom ismét Magyarország ellen fordult. 1521-ben elesett Nándorfehérvár, és ezzel megnyílt az út az ország belseje felé.

II. Lajos király serege 1526. augusztus 29-én Mohácsnál ütközött meg a jóval nagyobb török haderővel. A magyar sereg fővezére Tomori Pál kalocsai érsek volt. A csata két óra alatt súlyos magyar vereséggel ért véget, a seregből kevesen menekültek meg.

A menekülő fiatal király a megáradt Csele-patakba fulladt. Halála után két királyt választottak: Szapolyai Jánost és Habsburg Ferdinándot, ami belháborúhoz vezetett.

A vereség következményeként az ország három részre szakadt: 1541-ben a török elfoglalta Budát, a középső rész török uralom alá került, nyugaton és északon a Habsburgok uralkodtak, keleten pedig kialakult az Erdélyi Fejedelemség.`,

  "szechenyi.txt": `Széchenyi István és a reformkor

A reformkor (1825–1848) a magyar polgári átalakulás előkészítésének időszaka. Egyik legfontosabb alakja gróf Széchenyi István.

Az 1825-ös pozsonyi országgyűlésen birtokainak egyévi jövedelmét ajánlotta fel egy tudós társaság alapítására: így jött létre a Magyar Tudós Társaság, a mai Magyar Tudományos Akadémia elődje.

1830-ban jelent meg Hitel című könyve, amelyben azt írta, hogy az ősiség törvénye és a jobbágyrendszer akadályozza a fejlődést, mert a birtokot nem lehet jelzálogként felhasználni.

Széchenyi kezdeményezte a Pestet és Budát összekötő első állandó híd, a Lánchíd megépítését; a munkálatokat Clark Ádám vezette. Szorgalmazta a folyószabályozást, a gőzhajózást és a lóversenyt is. Kossuth Lajos, akivel sok vitája volt, "a legnagyobb magyarnak" nevezte.`,

  "1848_marcius15.txt": `1848. március 15. – a pesti forradalom

A forradalom napján reggel a márciusi ifjak (köztük Petőfi Sándor, Vasvári Pál és Jókai Mór) a Pilvax kávéházban gyülekeztek. Innen indultak el, hogy a 12 pontot és a Nemzeti dalt cenzúra nélkül kinyomtassák.

A Landerer és Heckenast nyomdában lefoglalták a sajtót, és kinyomtatták a két szöveget: ezek lettek a szabad sajtó első termékei. Délután a Nemzeti Múzeum előtt nagygyűlést tartottak, majd Budára vonultak, és kiszabadították a börtönből Táncsics Mihályt.

A 12 pont követelései között szerepelt a sajtószabadság, a felelős minisztérium Pesten, a közteherviselés, a jobbágyfelszabadítás és a nemzetőrség felállítása. Az első pont így szólt: "Kívánjuk a sajtó szabadságát, cenzúra eltörlését."

Ezt követően megalakult az első felelős magyar kormány, a Batthyány-kormány, és az uralkodó jóváhagyta az áprilisi törvényeket.`,

  "aradi_vertanuk.txt": `A szabadságharc vége és az aradi vértanúk (1849)

1849 nyarán az osztrák és az orosz cári csapatok túlerőben voltak. Görgei Artúr 1849. augusztus 13-án Világosnál letette a fegyvert az orosz csapatok előtt. Ezzel a szabadságharc gyakorlatilag véget ért.

A megtorlást Julius Haynau táborszernagy irányította. 1849. október 6-án Aradon tizenhárom honvédtisztet végeztek ki, őket nevezzük aradi vértanúknak. Közülük többet golyó, a többieket kötél által. Damjanich János és Kiss Ernő is köztük volt.

Ugyanezen a napon Pesten kivégezték Batthyány Lajost, az első felelős magyar miniszterelnököt. Október 6. ma nemzeti gyásznap.

A megtorlás után kiépült a Bach-rendszer, az önkényuralom, amely az 1860-as évekig tartott.`,

  "petofi_sandor.txt": `Petőfi Sándor (1823–1849)

Petőfi Sándor 1823. január 1-jén született Kiskőrösön. Gyermekkorában sokat költözött a család, több iskolában tanult. Volt színész és katona is, mielőtt költőként ismert lett.

1844-ben írta meg a János vitéz című elbeszélő költeményt. Főhőse Kukorica Jancsi, az árva juhászlegény, aki szerelmét, Iluskát elveszítve bejárja a világot, és végül Tündérországban találkozik vele újra. A mű a népies stílus egyik csúcsa.

1847 őszén feleségül vette Szendrey Júliát. A Szeptember végén című versét Koltón írta a mézeshetek idején: a vers a mulandóságról és a hűségről szól.

1848. március 15-én ő szavalta el a Nemzeti dalt. A szabadságharcban Bem József segédtisztje volt Erdélyben. 1849. július 31-én esett el a segesvári (fehéregyházi) csatában; sírja ismeretlen.`,

  "arany_janos.txt": `Arany János (1817–1882)

Arany János 1817-ben született Nagyszalontán, szegény családban. Egy ideig vándorszínész volt, majd hazatért, és jegyzőként dolgozott.

A Toldi című elbeszélő költeményét 1846-ban a Kisfaludy Társaság pályázatára írta, és megnyerte vele a díjat. A mű hőse Toldi Miklós, a hatalmas erejű parasztlegény, aki bátyja, György ármánykodása ellenére vitézi hírnevet szerez. A siker után Petőfi Sándor lelkes levélben üdvözölte, és barátok lettek.

Arany a magyar ballada mestere. A ballada "tragédia dalban elbeszélve" (Gyulai Pál meghatározása): drámai, sokszor szaggatott, homályos elbeszélés. Ismert balladái: Ágnes asszony, Szondi két apródja, A walesi bárdok.

A walesi bárdok (1857) történetében I. Edward angol király meghódítja Walest, de a lakomán egyetlen bárd sem hajlandó dicsőíteni, ezért máglyára küldi őket. A vers burkoltan az önkényuralomra és Ferenc József magyarországi látogatására utal.`,

  "kiegyezes_1867.txt": `Az osztrák–magyar kiegyezés (1867)

Az 1860-as évekre a Habsburg Birodalom meggyengült (vereségek Itáliában, majd 1866-ban Königgrätznél a poroszoktól). Így mindkét fél számára fontossá vált a megegyezés.

A magyar oldalon Deák Ferenc, "a haza bölcse" készítette elő a kiegyezést. 1865-ben a Pesti Naplóban megjelent húsvéti cikkében jelezte, hogy Magyarország kész a megegyezésre, ha az alkotmányát visszaállítják.

A kiegyezés eredményeként jött létre az Osztrák–Magyar Monarchia, a dualizmus rendszere. Két önálló állam volt, közös uralkodóval. Közös ügynek számított a külügy, a hadügy és az ezek fedezésére szolgáló pénzügy. A gazdasági kérdésekről (vámszövetség) tízévente újra meg kellett állapodni.

Ferenc Józsefet 1867. június 8-án magyar királlyá koronázták. Az első magyar miniszterelnök a kiegyezés után gróf Andrássy Gyula lett.`,

  "trianon.txt": `A trianoni békeszerződés (1920)

Az első világháborút Magyarország a vesztes oldalon fejezte be. A győztes antant hatalmak a Párizs környéki békék keretében döntöttek a határokról.

A békeszerződést 1920. június 4-én írták alá a versailles-i Nagy-Trianon kastélyban. Magyarország elvesztette korábbi területének mintegy kétharmadát, és több mint hárommillió magyar került az új határokon kívülre.

Területeket kapott Csehszlovákia, Románia, a Szerb–Horvát–Szlovén Királyság és Ausztria is. Sopron és környéke az 1921-es népszavazás után Magyarországnál maradt, ezért nevezik "a leghűségesebb városnak".

A békeszerződés korlátozta a hadsereg létszámát is (legfeljebb 35 000 fő), és jóvátétel fizetésére kötelezte az országot. A két világháború közötti magyar politika egyik fő célja a revízió, vagyis a határok megváltoztatása lett.`,
};

// --- Questions, each labelled with the note AND a short passage the right chunk contains ---
// Labelling the passage (not just the file) matters: "the right file" is too easy when a
// file has only a couple of chunks. The anchor is short, so it fits in a chunk of any size.

type Category = "direct" | "paraphrase" | "cross-language" | "distractor" | "none";

interface Query {
  question: string;
  category: Category;
  file?: string; // absent for "none": the library does not answer it
  anchor?: string; // the right chunk contains this exact text
}

const QUERIES: Query[] = [
  // direct — shares key words with the note
  { category: "direct", question: "Mikor volt a mohácsi csata?", file: "mohacsi_csata.txt", anchor: "1526. augusztus 29" },
  { category: "direct", question: "Ki volt a magyar sereg fővezére Mohácsnál?", file: "mohacsi_csata.txt", anchor: "Tomori Pál" },
  { category: "direct", question: "Mik voltak a közös ügyek a kiegyezés után?", file: "kiegyezes_1867.txt", anchor: "a hadügy és az ezek fedezésére" },
  { category: "direct", question: "Mikor született Petőfi Sándor?", file: "petofi_sandor.txt", anchor: "1823. január 1" },
  { category: "direct", question: "Mit követelt a 12 pont?", file: "1848_marcius15.txt", anchor: "közteherviselés" },

  // paraphrase — the meaning matches, the key words do not
  { category: "paraphrase", question: "Hogyan halt meg a fiatal uralkodó a törökök elleni vereség után?", file: "mohacsi_csata.txt", anchor: "Csele-patakba" },
  { category: "paraphrase", question: "Milyen szokás emlékeztet ma is a győzelemre a templomokban?", file: "nandorfehervar.txt", anchor: "déli harangszó" },
  { category: "paraphrase", question: "Melyik nemesember ajánlotta fel egy évnyi bevételét a tudomány támogatására?", file: "szechenyi.txt", anchor: "egyévi jövedelmét" },
  { category: "paraphrase", question: "Melyik költő írt mesés történetet egy árva fiúról, aki bejárja a világot?", file: "petofi_sandor.txt", anchor: "Kukorica Jancsi" },
  { category: "paraphrase", question: "Milyen híres könyvgyűjtemény volt a reneszánsz uralkodó udvarában?", file: "matyas_kiraly.txt", anchor: "Bibliotheca Corviniana" },
  { category: "paraphrase", question: "Melyik versben tagadják meg az énekesek, hogy egy hódító királyt dicsőítsenek?", file: "arany_janos.txt", anchor: "egyetlen bárd sem" },
  { category: "paraphrase", question: "Hogyan próbálták az ország védelmét megerősíteni a mongol pusztítás után?", file: "tatarjaras.txt", anchor: "kővárak építésére" },

  // cross-language — English question, Hungarian notes
  { category: "cross-language", question: "When did Hungary lose two-thirds of its territory?", file: "trianon.txt", anchor: "1920. június 4" },
  { category: "cross-language", question: "Which humanist poet studied in Ferrara?", file: "janus_pannonius.txt", anchor: "Ferrarában" },
  { category: "cross-language", question: "Which newspaper article prepared the Austro-Hungarian Compromise?", file: "kiegyezes_1867.txt", anchor: "húsvéti cikkében" },
  { category: "cross-language", question: "Where did the March youth print the 12 points?", file: "1848_marcius15.txt", anchor: "Landerer és Heckenast" },

  // distractor — another note shares the names, years or theme
  { category: "distractor", question: "Melyik csatában győzte le Hunyadi János a szultán seregét?", file: "nandorfehervar.txt", anchor: "Hunyadi János szervezte" },
  { category: "distractor", question: "Kinek a fia volt Mátyás király?", file: "matyas_kiraly.txt", anchor: "Hunyadi János fia" },
  { category: "distractor", question: "Melyik csatában esett el Petőfi?", file: "petofi_sandor.txt", anchor: "segesvári" },
  { category: "distractor", question: "Mi történt Világosnál 1849-ben?", file: "aradi_vertanuk.txt", anchor: "Világosnál" },
  { category: "distractor", question: "Melyik pályázatra írta Arany a Toldit?", file: "arany_janos.txt", anchor: "Kisfaludy Társaság" },
  { category: "distractor", question: "Mikor esett el Nándorfehérvár a töröknek?", file: "mohacsi_csata.txt", anchor: "1521-ben elesett" },

  // none — the library does not answer these; only their distances are recorded
  { category: "none", question: "Ki írta A Pál utcai fiúkat?" },
  { category: "none", question: "Hogyan ért véget a Rákóczi-szabadságharc?" },
  { category: "none", question: "Mit jelent a fotoszintézis?" },
  { category: "none", question: "Who was the first king of Hungary?" },
];

// --- Embedders ---

// One request per batch instead of LangChain's default 8 texts per request.
async function voyageEmbedders(): Promise<{ documents: (t: string[]) => Promise<number[][]>; queries: (t: string[]) => Promise<number[][]> }> {
  if (!process.env.VOYAGEAI_API_KEY) {
    throw new Error("VOYAGEAI_API_KEY is missing — add it to .env and run with --env-file=.env");
  }
  const { VoyageEmbeddings } = await import("@langchain/community/embeddings/voyage");
  // Same model and input types as createVoyageEmbedder in src/library/vectorStore.ts
  const documents = new VoyageEmbeddings({ modelName: "voyage-4", inputType: "document", batchSize: 128 });
  const queries = new VoyageEmbeddings({ modelName: "voyage-4", inputType: "query", batchSize: 128 });
  return {
    documents: (t) => documents.embedDocuments(t),
    queries: (t) => queries.embedDocuments(t),
  };
}

// The store asks the embedder text by text; everything was embedded in one batch beforehand.
function cachedEmbedder(vectors: Map<string, number[]>): Embedder {
  const get = (t: string) => {
    const v = vectors.get(t);
    if (!v) throw new Error(`No precomputed vector for: "${t.slice(0, 60)}…"`);
    return v;
  };
  return {
    embedDocuments: async (texts) => texts.map(get),
    embedQuery: async (text) => get(text),
  };
}

// --- Scoring ---

interface QueryResult {
  query: Query;
  rank: number | null; // 1-based rank of the right chunk in the top K, null if missing
  fileRank: number | null; // looser: rank of any chunk of the right file
  top1Distance: number;
  goldDistance: number | null;
  top1: SearchHit | undefined;
}

function rankOf(hits: SearchHit[], match: (h: SearchHit) => boolean): number | null {
  const i = hits.findIndex(match);
  return i === -1 ? null : i + 1;
}

interface Metrics {
  n: number;
  hit1: number;
  recall3: number;
  recall5: number;
  mrr: number;
  fileRecall5: number;
}

function metrics(results: QueryResult[]): Metrics {
  const n = results.length;
  const share = (pred: (r: QueryResult) => boolean) => (n ? results.filter(pred).length / n : 0);
  return {
    n,
    hit1: share((r) => r.rank === 1),
    recall3: share((r) => r.rank !== null && r.rank <= 3),
    recall5: share((r) => r.rank !== null),
    mrr: n ? results.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / n : 0,
    fileRecall5: share((r) => r.fileRank !== null),
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => x.toFixed(3);

// --- Main ---

interface ConfigResult {
  chunkSize: number;
  chunkOverlap: number;
  chunkCount: number;
  results: QueryResult[];
}

async function runConfig(
  config: (typeof CONFIGS)[number],
  embed: Awaited<ReturnType<typeof voyageEmbedders>>,
  queryVectors: Map<string, number[]>,
): Promise<ConfigResult> {
  const splitter = new RecursiveCharacterTextSplitter(config);
  const chunksByFile = new Map<string, string[]>();
  for (const [file, text] of Object.entries(NOTES)) chunksByFile.set(file, await splitter.splitText(text));

  // Labelling check: an anchor split across two chunks could never be found — say so instead
  // of silently counting it as a retrieval miss.
  for (const q of QUERIES) {
    if (q.anchor && !chunksByFile.get(q.file!)!.some((c) => c.includes(q.anchor!))) {
      console.warn(`  ⚠️  chunk size ${config.chunkSize}: "${q.anchor}" is split across chunks of ${q.file}`);
    }
  }

  const allChunks = [...new Set([...chunksByFile.values()].flat())];
  const docVectors = await embed.documents(allChunks); // one request
  const vectors = new Map(queryVectors);
  allChunks.forEach((c, i) => vectors.set(c, docVectors[i]));

  const dir = mkdtempSync(join(tmpdir(), "retrieval-eval-"));
  try {
    // The real store (src/library/vectorStore.ts), so the eval measures what the app uses.
    const store = openChunkStore(cachedEmbedder(vectors), dir);
    for (const [file, chunks] of chunksByFile) {
      await store.replaceFile(file, "eval", chunks.map((text) => ({ text, sourceKind: "text" as const })));
    }

    const results: QueryResult[] = [];
    for (const query of QUERIES) {
      const hits = await store.search(query.question, K);
      const rank = query.anchor ? rankOf(hits, (h) => h.file === query.file && h.text.includes(query.anchor!)) : null;
      results.push({
        query,
        rank,
        fileRank: query.file ? rankOf(hits, (h) => h.file === query.file) : null,
        top1Distance: hits[0]?.distance ?? NaN,
        goldDistance: rank ? hits[rank - 1].distance : null,
        top1: hits[0],
      });
    }
    return { ...config, chunkCount: allChunks.length, results };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildReport(configs: ConfigResult[]): string {
  const answerable = (r: ConfigResult) => r.results.filter((x) => x.query.category !== "none");
  const lines: string[] = [];
  const answerableCount = QUERIES.filter((q) => q.category !== "none").length;
  const noneCount = QUERIES.length - answerableCount;

  lines.push(`# Retrieval eval — voyage-4`);
  lines.push("");
  lines.push(`${new Date().toISOString().slice(0, 10)} · ${Object.keys(NOTES).length} notes · ${answerableCount} answerable questions + ${noneCount} the library does not answer · top ${K}`);
  lines.push("");

  lines.push("## Chunk size comparison");
  lines.push("");
  lines.push("| Chunk size / overlap | Chunks | Hit@1 | Recall@3 | Recall@5 | MRR@5 | Right file in top 5 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const c of configs) {
    const m = metrics(answerable(c));
    const mark = c.chunkSize === CURRENT ? " (current)" : "";
    lines.push(`| ${c.chunkSize} / ${c.chunkOverlap}${mark} | ${c.chunkCount} | ${pct(m.hit1)} | ${pct(m.recall3)} | ${pct(m.recall5)} | ${num(m.mrr)} | ${pct(m.fileRecall5)} |`);
  }
  lines.push("");

  const current = configs.find((c) => c.chunkSize === CURRENT) ?? configs[0];
  lines.push(`## By question type (chunk size ${current.chunkSize})`);
  lines.push("");
  lines.push("| Type | Questions | Hit@1 | Recall@5 | MRR@5 |");
  lines.push("|---|---|---|---|---|");
  for (const cat of ["direct", "paraphrase", "cross-language", "distractor"] as Category[]) {
    const m = metrics(current.results.filter((r) => r.query.category === cat));
    lines.push(`| ${cat} | ${m.n} | ${pct(m.hit1)} | ${pct(m.recall5)} | ${num(m.mrr)} |`);
  }
  lines.push("");

  const misses = answerable(current).filter((r) => r.rank !== 1);
  lines.push(`## Not ranked first (chunk size ${current.chunkSize})`);
  lines.push("");
  if (misses.length === 0) lines.push("None — every right passage was the first hit.");
  for (const r of misses) {
    const where = r.rank ? `rank ${r.rank}` : `not in top ${K}`;
    lines.push(`- **${r.query.question}** (${r.query.category}) — ${where}; first hit: ${r.top1?.file ?? "—"}`);
  }
  lines.push("");

  // Could a distance cut-off alone decide "the library has nothing on this"?
  const gold = answerable(current).map((r) => r.goldDistance).filter((d): d is number => d !== null);
  const none = current.results.filter((r) => r.query.category === "none").map((r) => r.top1Distance);
  const maxGold = Math.max(...gold);
  const minNone = Math.min(...none);
  lines.push(`## Can a distance threshold detect "no relevant material"? (chunk size ${current.chunkSize})`);
  lines.push("");
  lines.push(`- Right passages were found at distance ${num(Math.min(...gold))} – ${num(maxGold)}`);
  lines.push(`- For questions the library does not answer, the closest chunk was at ${num(minNone)} – ${num(Math.max(...none))}`);
  lines.push(
    maxGold < minNone
      ? `- The ranges do not overlap on this sample: a cut-off between ${num(maxGold)} and ${num(minNone)} would separate them. With so few questions this is a hint, not proof.`
      : `- The ranges overlap: no single distance cut-off separates "relevant" from "nothing relevant". This is why the app lets a model (judgeMaterial) decide coverage instead of a threshold.`,
  );
  lines.push("");

  return lines.join("\n");
}

export async function main(): Promise<void> {
  const embed = await voyageEmbedders();

  // Labelling check: every anchor must really be in its note, or the eval measures nothing.
  for (const q of QUERIES) {
    if (q.anchor && !NOTES[q.file!]?.includes(q.anchor)) throw new Error(`Anchor "${q.anchor}" is not in ${q.file}`);
  }

  console.log(`Retrieval eval — voyage-4, ${QUERIES.length} questions, ${CONFIGS.length} chunk sizes\n`);

  const questions = QUERIES.map((q) => q.question);
  const qv = await embed.queries(questions); // one request for all questions
  const queryVectors = new Map(questions.map((q, i) => [q, qv[i]]));

  const configs: ConfigResult[] = [];
  for (const config of CONFIGS) {
    console.log(`· chunk size ${config.chunkSize}/${config.chunkOverlap}`);
    configs.push(await runConfig(config, embed, queryVectors));
  }

  const report = buildReport(configs);
  console.log(`\n${report}`);

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `retrieval-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(file, report);
  console.log(`Report written to ${file}`);
}

if (process.argv[1]?.endsWith("retrieval.eval.ts")) {
  main().catch((e) => {
    console.error(`💥 ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
# CLAUDE.md — AI Todo Agent

Persistent kontext för framtida Claude Code-sessioner i detta repo.

## Vad appen gör

Chat-baserad todo-lista där användaren pratar med Claude på svenska. AI:n använder function calling för att lägga till, hämta och markera uppgifter som klara i en lokal SQLite. UI:t visar en live-sidebar med öppna uppgifter som uppdateras direkt efter varje tool-anrop.

Utöver todo-hanteringen finns ett `analyze_tiktok_video`-tool som tar en TikTok-URL, laddar ner videon med `yt-dlp`, extraherar bildrutor + ljud med `ffmpeg`, transkriberar ljudet via OpenAI Whisper och låter Claude sammanfatta videon multimodalt. Resultatet visas som chat-svar och skrivs **inte** till todo-databasen.

## Tech stack

| Lager | Val |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack, Node runtime, `output: standalone`) |
| React | 19.2 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/postcss`) |
| AI SDK | `ai@^4` + `@ai-sdk/anthropic@^1` + `@ai-sdk/react@^1` + `zod@^3` |
| Modell | `claude-sonnet-4-5` via Anthropic API |
| Databas | `better-sqlite3` (synkron, native module — **kräver Node runtime, inte Edge**) |
| Ikoner | `lucide-react@^1` |
| Deploy | Docker (multi-stage, non-root, volume-mounted `/app/data`) |

## Filstruktur

```
./
├── app/
│   ├── layout.tsx              # Root layout, Geist-fonter, mörkt läge via prefers-color-scheme
│   ├── page.tsx                # Chat-UI (client) — useChat + live task sidebar
│   ├── globals.css             # Tailwind v4 import + tema-variabler
│   └── api/
│       ├── chat/route.ts       # POST — streamText mot Claude med tools, system prompt på svenska
│       └── tasks/route.ts      # GET — läser pending/completed/all till sidebar
├── lib/
│   ├── db.ts                   # better-sqlite3 singleton, schema, helpers (addTask/getTasks/completeTask)
│   ├── tools.ts                # AI SDK tool-definitioner (add_task / get_tasks / complete_task / analyze_tiktok_video)
│   └── tiktok.ts               # TikTok-pipelinen (yt-dlp → ffmpeg → Whisper → multimodal Claude)
├── scripts/
│   └── init-db.mjs             # Idempotent CREATE TABLE, körs av `npm run db:init` och i Docker CMD
├── data/                       # SQLite-filer (gitignorerad, dockerignorerad volym)
│   └── todo.db
├── public/                     # Next.js statiska assets
├── Dockerfile                  # 3-stegs: deps → builder → runner
├── .dockerignore
├── next.config.ts              # output: "standalone", serverExternalPackages: ["better-sqlite3"]
├── .env.local.example          # Mall för ANTHROPIC_API_KEY
└── CLAUDE.md                   # (denna fil)
```

## Databasschema

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT    NOT NULL,
  priority    TEXT    NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
  status      TEXT    NOT NULL CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
```

- **Typer**: se [lib/db.ts](lib/db.ts) — `Task`, `Priority`, `Status`
- **Sortering** (i `getTasks`): high → medium → low, sedan senaste först
- **Schema ensured** vid både `npm run db:init` och första anropet till `getDb()` i runtime — säker mot glömt init-steg.

## AI-tools

Definierade i [lib/tools.ts](lib/tools.ts), registrerade i [app/api/chat/route.ts](app/api/chat/route.ts) via `streamText({ tools: todoTools, maxSteps: 5 })`.

| Tool | Parametrar | Vad den gör |
|---|---|---|
| `add_task` | `description: string`, `priority: 'low'\|'medium'\|'high'` | `INSERT ... RETURNING *` |
| `get_tasks` | `filter: 'pending'\|'completed'\|'all'` (default `pending`) | `SELECT` sorterat på prioritet + datum |
| `complete_task` | `id: number` | `UPDATE status='completed' ... RETURNING *`, returnerar `{error: 'not_found'}` om id saknas |
| `analyze_tiktok_video` | `url: string` (TikTok-URL) | yt-dlp → ffmpeg (frames + mp3) → Whisper → multimodal `generateText`, returnerar `{ summary }` |

System prompt (i `chat/route.ts`) instruerar Claude att:
- Proaktivt använda tools utan att fråga om lov
- Alltid anropa `get_tasks` innan prioriteringsråd
- Hämta lista innan `complete_task` om id är okänt
- Svara kort, på svenska, med medium som default-prioritet

## Kommandon

### Lokal utveckling
```bash
# Första gången:
cp .env.local.example .env.local     # fyll i ANTHROPIC_API_KEY
npm install
npm run db:init                      # skapar data/todo.db

# Dev-server:
npm run dev                          # http://localhost:3000

# Om du startar dev från Claude Code (eller någon process som
# exporterar tom ANTHROPIC_API_KEY): använd dev:safe — den
# unsetter variabeln så Next läser den från .env.local.
npm run dev:safe

# Production build + start:
npm run build
npm start
```

### Övrigt
```bash
npm run lint                         # ESLint
npx tsc --noEmit                     # typecheck
```

### Docker
```bash
# Build:
docker build -t todo-agent .

# Run (mount data-volymen så SQLite persisterar mellan restarts):
docker run -d \
  --name todo-agent \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  todo-agent
```

Containern kör `node scripts/init-db.mjs && node server.js` vid start, så schemat ensureas automatiskt.

## Miljövariabler

| Variabel | Obligatorisk | Default | Beskrivning |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | API-nyckel för Claude |
| `OPENAI_API_KEY` | ✅ (för `analyze_tiktok_video`) | — | API-nyckel för OpenAI Whisper-transkription |
| `DB_PATH` | ❌ | `./data/todo.db` (lokalt) · `/app/data/todo.db` (Docker) | Absolut sökväg till SQLite-filen |
| `PORT` | ❌ | `3000` | Next.js server-port |
| `HOSTNAME` | ❌ | `0.0.0.0` i Docker | Bind address |

### Systemberoenden (utöver Node)

`analyze_tiktok_video` spawnar två externa binärer som måste finnas på `PATH`:

- `yt-dlp` — laddar ner TikTok-videon
- `ffmpeg` — extraherar bildrutor och ljud

Dockerfilen installerar båda i `runner`-stagen. Lokalt: `brew install yt-dlp ffmpeg` (macOS) eller motsvarande paketmanager.

## Viktiga fotgropar (läs innan du ändrar)

1. **Inga Edge-routes.** `/api/chat` och `/api/tasks` har `export const runtime = "nodejs"` — **rör inte detta**. `better-sqlite3` är en native C++-modul och fungerar inte i Edge.
2. **`serverExternalPackages`** i [next.config.ts](next.config.ts) är nödvändig — annars försöker Next bundla `better-sqlite3` och bygget eller runtime-anropet kraschar. (I Next 14 hette inställningen `experimental.serverComponentsExternalPackages`.)
3. **Dockerfile kopierar `better-sqlite3` manuellt** från builder-stagen till runner-stagen. `output: standalone` kopierar inte automatiskt native-`.node`-filer, så vi kopierar `node_modules/better-sqlite3` + `bindings` + `file-uri-to-path` uttryckligen. Om du lägger till fler native-moduler: lägg till dem här.
4. **Alpine behöver `python3 make g++`** för att bygga `better-sqlite3` från källa. Redan satt i `deps`-stagen.
5. **Auto-scroll + live task refresh**: `useChat.onFinish` triggar `refreshTasks()` så sidebaren uppdateras direkt efter att AI:n kört ett tool. Om du byter till stream-baserad approach: tänk på att tool-results kommer innan `onFinish`.
6. **AI SDK v4 vs v5**: projektet är låst på `ai@^4` och `@ai-sdk/react@^1`. `useChat` i v5 har brytande ändringar (`messages` blir `parts`-baserat m.m.). Uppgradering kräver UI-refactor.
7. **Script-filen `scripts/init-db.mjs`** är medvetet fristående (ingen import från `lib/db.ts`) så att den kan köras av Docker CMD innan Next är startat.

## Arkitektur i korthet

```
Browser (app/page.tsx, useChat)
  │  POST /api/chat   ── streaming
  ▼
app/api/chat/route.ts ── streamText(Claude, tools)
  │                              │
  │                              ▼
  │                        lib/tools.ts ── execute → lib/db.ts ── better-sqlite3 ── data/todo.db
  │
  └── (onFinish) ── GET /api/tasks?filter=pending ── lib/db.ts ── SELECT
```

All mutation går via tool-calls. UI:t skriver aldrig direkt till databasen — bara den serverside-AI:n gör det.

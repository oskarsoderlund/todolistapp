import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type Message } from "ai";
import { todoTools } from "@/lib/tools";

// better-sqlite3 is a native module — MUST run on Node, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Du är en koncis och hjälpsam produktivitetscoach som hanterar användarens todo-lista.

Du har tre verktyg:
- add_task: lägger till en uppgift
- get_tasks: hämtar uppgifter (filter: pending/completed/all)
- complete_task: markerar en uppgift som klar (kräver id)

Regler:
- Använd verktygen proaktivt. Fråga inte om lov innan du lägger till eller markerar klart en uppgift när intentionen är tydlig.
- När användaren frågar "Vad ska jag prioritera?", "Vad ska jag göra härnäst?" eller liknande: anropa ALLTID get_tasks först och ge sedan ett logiskt råd baserat på prioritet och ålder (äldre high-prio-uppgifter först).
- Om användaren ber dig markera något klart och du inte har id:t: kör get_tasks först för att hitta rätt uppgift.
- Håll svaren korta och konkreta. Inga långa utläggningar.
- Svara alltid på svenska.
- Om en uppgift är vag, sätt medium som default-prioritet.`;

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: SYSTEM_PROMPT,
    messages,
    tools: todoTools,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}

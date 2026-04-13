"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Flag,
  ListTodo,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import type { Task } from "@/lib/db";

const priorityStyles: Record<
  Task["priority"],
  { label: string; chip: string; flag: string }
> = {
  high: {
    label: "Hög",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    flag: "text-rose-500",
  },
  medium: {
    label: "Medel",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    flag: "text-amber-500",
  },
  low: {
    label: "Låg",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    flag: "text-emerald-500",
  },
};

export default function Home() {
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?filter=pending", { cache: "no-store" });
      if (!res.ok) throw new Error("Kunde inte hämta uppgifter");
      const data = (await res.json()) as { tasks: Task[] };
      setPendingTasks(data.tasks);
    } catch (err) {
      console.error(err);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
      onFinish: () => {
        refreshTasks();
      },
    });

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  // Auto-scroll chat to bottom when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto p-4 md:p-6 grid gap-4 md:grid-cols-[1fr_320px]">
      {/* Chat column */}
      <section className="flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[80vh] md:min-h-[85vh]">
        <header className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold leading-tight">Todo-agent</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Driven av Claude · hanterar dina uppgifter
            </p>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {messages.length === 0 && <EmptyState />}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pl-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Tänker…
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-600 dark:text-rose-400 pl-2">
              Fel: {error.message}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-200 dark:border-slate-800 p-3 flex items-end gap-2 bg-slate-50 dark:bg-slate-950"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isLoading) {
                  handleSubmit();
                }
              }
            }}
            placeholder="Skriv till din todo-agent… (t.ex. 'lägg till att ringa tandläkaren' eller 'vad ska jag prioritera?')"
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
            aria-label="Skicka"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </section>

      {/* Task sidebar */}
      <aside className="rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold">Att göra</h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {pendingTasks.length} st
          </span>
        </header>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tasksLoading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 p-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Laddar…
            </div>
          )}
          {!tasksLoading && pendingTasks.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400 p-3 text-center">
              Inga öppna uppgifter. Be agenten lägga till något!
            </div>
          )}
          {pendingTasks.map((task) => {
            const styles = priorityStyles[task.priority];
            return (
              <div
                key={task.id}
                className="group rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition"
              >
                <div className="flex items-start gap-2">
                  <Flag className={`h-4 w-4 mt-0.5 flex-shrink-0 ${styles.flag}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">
                      {task.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles.chip}`}
                      >
                        {styles.label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        #{task.id}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </main>
  );
}

function EmptyState() {
  const examples = [
    "Lägg till att ringa tandläkaren (hög prio)",
    "Lägg till att handla mjölk",
    "Vad ska jag prioritera?",
    "Markera uppgift 1 som klar",
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
        <Sparkles className="h-6 w-6" />
      </div>
      <div>
        <p className="font-semibold">Hej! Vad ska vi fixa idag?</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Prova något av exemplen nedan eller skriv själv.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {examples.map((ex) => (
          <span
            key={ex}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            {ex}
          </span>
        ))}
      </div>
    </div>
  );
}

type ChatMessage = ReturnType<typeof useChat>["messages"][number];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const invocations = message.toolInvocations ?? [];

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-md"
            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-md"
        }`}
      >
        {message.content && <div>{message.content}</div>}

        {invocations.length > 0 && (
          <div className="mt-2 space-y-1">
            {invocations.map((inv) => (
              <ToolBadge key={inv.toolCallId} invocation={inv} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBadge({
  invocation,
}: {
  invocation: NonNullable<ChatMessage["toolInvocations"]>[number];
}) {
  const state = invocation.state;
  const name = invocation.toolName;

  const label = (() => {
    if (name === "add_task") {
      const args = invocation.args as { description?: string } | undefined;
      return `La till: ${args?.description ?? "…"}`;
    }
    if (name === "get_tasks") return "Läste todo-listan";
    if (name === "complete_task") {
      const args = invocation.args as { id?: number } | undefined;
      return `Markerade #${args?.id ?? "?"} som klar`;
    }
    return name;
  })();

  return (
    <div className="flex items-center gap-1.5 text-[11px] opacity-80">
      {state === "result" ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      <span>{label}</span>
    </div>
  );
}

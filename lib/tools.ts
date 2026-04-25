import { tool } from "ai";
import { z } from "zod";
import { addTask, completeTask, getTasks } from "./db";
import { analyzeTikTokVideo } from "./tiktok";

export const todoTools = {
  add_task: tool({
    description:
      "Lägg till en ny uppgift på användarens todo-lista. Använd denna när användaren ber dig lägga till, spara eller påminna om något att göra.",
    parameters: z.object({
      description: z
        .string()
        .min(1)
        .describe("Kort beskrivning av uppgiften (på svenska)."),
      priority: z
        .enum(["low", "medium", "high"])
        .describe(
          "Prioritet. Använd 'high' för akuta/viktiga, 'medium' som default, 'low' för småsaker.",
        ),
    }),
    execute: async ({ description, priority }) => {
      const task = addTask(description, priority);
      return { ok: true, task };
    },
  }),

  get_tasks: tool({
    description:
      "Hämta användarens uppgifter från databasen. Används innan du ger råd om prioritering eller när användaren vill se sin lista.",
    parameters: z.object({
      filter: z
        .enum(["pending", "completed", "all"])
        .default("pending")
        .describe(
          "Vilka uppgifter som ska hämtas. Default är 'pending' (ogjorda).",
        ),
    }),
    execute: async ({ filter }) => {
      const tasks = getTasks(filter);
      return { ok: true, count: tasks.length, tasks };
    },
  }),

  complete_task: tool({
    description:
      "Markera en specifik uppgift som klar. Kräver uppgiftens id (hämta via get_tasks först om du är osäker).",
    parameters: z.object({
      id: z.number().int().positive().describe("Uppgiftens id."),
    }),
    execute: async ({ id }) => {
      const result = completeTask(id);
      if ("error" in result) {
        return { ok: false, error: "Uppgiften hittades inte." };
      }
      return { ok: true, task: result };
    },
  }),

  analyze_tiktok_video: tool({
    description:
      "Analysera en TikTok-video från en URL. Verktyget laddar ner videon, extraherar bildrutor, transkriberar ljudet och returnerar en kort sammanfattning på svenska. Använd när användaren delar en TikTok-länk (vm.tiktok.com/... eller tiktok.com/...).",
    parameters: z.object({
      url: z
        .string()
        .url()
        .describe("TikTok-URL, antingen kort (vm.tiktok.com/...) eller full."),
    }),
    execute: async ({ url }, { abortSignal }) => {
      try {
        const summary = await analyzeTikTokVideo(url, { signal: abortSignal });
        return { ok: true, summary };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  }),
};

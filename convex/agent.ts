import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

async function callLLM(task: string): Promise<{ content: string; traceId: string }> {
  if (process.env.MOCK_MODE === "true") {
    return { content: `[MOCK] Completed: ${task}`, traceId: `mock-trace-${Math.random().toString(36).slice(2)}` };
  }
  const baseUrl = process.env.RESPAN_BASE_URL ?? "";
  const apiKey = process.env.RESPAN_API_KEY ?? "";
  const model = process.env.RESPAN_MODEL ?? "gpt-4o";
  const path = process.env.RESPAN_PATH ?? "/chat/completions";

  if (!baseUrl) throw new Error("RESPAN_BASE_URL is not set");
  if (!apiKey) throw new Error("RESPAN_API_KEY is not set");

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a coding agent reporting back to your team. " +
            "Given a task, reply in 1-2 sentences describing exactly what you changed or produced — " +
            "be specific (file names, function names, what was added/fixed). No preamble.",
        },
        { role: "user", content: task },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Respan ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; id: string };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Respan returned empty content");
  return { content, traceId: data.id ?? "" };
}

function splitCommand(command: string): string[] {
  const parts = command
    .split(/,\s*and\s+|,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [command.trim()];
}

export const processJob = action({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }): Promise<null> => {
    try {
      const jobs = await ctx.runQuery(api.jobs.listJobs);
      const job = jobs.find((j) => j._id === id);
      if (!job) return null;
      const { content, traceId } = await callLLM(job.task);
      await ctx.runMutation(api.jobs.updateJob, { id, status: "done", result: content, trace: traceId });
    } catch (err) {
      await ctx.runMutation(api.jobs.updateJob, { id, status: "blocked", result: String(err) });
    }
    return null;
  },
});

export const dispatch = action({
  args: { command: v.string() },
  handler: async (ctx, { command }): Promise<{ jobIds: string[] }> => {
    const tasks = splitCommand(command);
    const jobIds = await Promise.all(
      tasks.map((task, i) => ctx.runMutation(api.jobs.createJob, { task, agent: `agent-${i + 1}` }))
    );
    await Promise.all(jobIds.map((id) => ctx.scheduler.runAfter(0, api.agent.processJob, { id })));
    return { jobIds: jobIds.map(String) };
  },
});

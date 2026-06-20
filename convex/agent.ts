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
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a senior software engineering agent. Complete the given coding task concisely." },
        { role: "user", content: task },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Respan error: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; id: string };
  return { content: data.choices[0]?.message?.content ?? "", traceId: data.id ?? "" };
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
    await Promise.all(jobIds.map((id) => ctx.runAction(api.agent.processJob, { id })));
    return { jobIds: jobIds.map(String) };
  },
});

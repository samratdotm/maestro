import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Each parallel agent owns a DISTINCT file → real edits with zero conflicts.
const FILE_POOL = ["src/validators.ts", "src/format.ts", "README.md"];

function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return ((m ? m[1] : t).trimEnd()) + "\n";
}

// Returns the FULL new contents of `file` implementing `task` (real edit),
// or a 1-2 sentence summary when no file is assigned.
async function callLLM(task: string, file?: string): Promise<{ content: string; traceId: string }> {
  if (process.env.MOCK_MODE === "true") {
    const mock = file
      ? file.endsWith(".md")
        ? `# Maestro Sandbox\n\nA tiny project for Maestro agents to edit.\n\n## Utilities\n\n- ${task}\n`
        : `// ${file} — updated by agent (mock)\n// Task: ${task}\nexport function generated(): boolean {\n  return true;\n}\n`
      : `[MOCK] Completed: ${task}`;
    return { content: mock, traceId: `mock-trace-${Math.random().toString(36).slice(2)}` };
  }
  const baseUrl = process.env.RESPAN_BASE_URL ?? "";
  const apiKey = process.env.RESPAN_API_KEY ?? "";
  const model = process.env.RESPAN_MODEL ?? "gpt-4o";
  const path = process.env.RESPAN_PATH ?? "/chat/completions";

  if (!baseUrl) throw new Error("RESPAN_BASE_URL is not set");
  if (!apiKey) throw new Error("RESPAN_API_KEY is not set");

  const system = file
    ? `You are a coding agent editing the file "${file}" in a small TypeScript project. ` +
      `Output ONLY the complete new contents of that file — valid ${file.endsWith(".md") ? "markdown" : "TypeScript"}. ` +
      `No explanations, no markdown code fences. Keep it small and self-contained.`
    : "You are a coding agent reporting back to your team. Given a task, reply in 1-2 sentences " +
      "describing exactly what you changed or produced. Be specific. No preamble.";
  const user = file ? `File: ${file}\nTask: ${task}` : task;

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Respan ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; id: string };
  let content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Respan returned empty content");
  if (file) content = stripFences(content);
  return { content, traceId: data.id ?? "" };
}

function splitCommand(command: string): string[] {
  const parts = command
    // split on commas, "and", and sentence-ending periods
    .split(/,\s*and\s+|,\s*|\s+and\s+|\.\s+/i)
    .map((s) => s.trim().replace(/[.\s]+$/, ""))
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
      const { content, traceId } = await callLLM(job.task, job.file);
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
    // Cap to the file pool so every agent edits a DISTINCT file (no conflicts).
    const tasks = splitCommand(command).slice(0, FILE_POOL.length);
    const jobIds = await Promise.all(
      tasks.map((task, i) =>
        ctx.runMutation(api.jobs.createJob, { task, agent: `agent-${i + 1}`, file: FILE_POOL[i] })
      )
    );
    await Promise.all(jobIds.map((id) => ctx.scheduler.runAfter(0, api.agent.processJob, { id })));
    return { jobIds: jobIds.map(String) };
  },
});

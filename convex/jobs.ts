import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createJob = mutation({
  args: { task: v.string(), agent: v.string(), file: v.optional(v.string()) },
  handler: async (ctx, { task, agent, file }) => {
    return await ctx.db.insert("jobs", {
      task,
      agent,
      status: "running",
      ...(file !== undefined && { file }),
      createdAt: Date.now(),
    });
  },
});

export const updateJob = mutation({
  args: {
    id: v.id("jobs"),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("blocked")),
    result: v.optional(v.string()),
    trace: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, result, trace }) => {
    await ctx.db.patch(id, { status, ...(result !== undefined && { result }), ...(trace !== undefined && { trace }) });
    return null;
  },
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("jobs").order("desc").collect();
  },
});

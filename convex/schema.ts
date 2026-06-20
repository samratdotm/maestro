import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  jobs: defineTable({
    task: v.string(),
    agent: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("blocked")),
    result: v.optional(v.string()),
    trace: v.optional(v.string()),
    createdAt: v.number(),
  }),
});

import { mutation } from "./_generated/server";

export const clearJobs = mutation({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").collect();
    await Promise.all(jobs.map((j) => ctx.db.delete(j._id)));
    return { deleted: jobs.length };
  },
});

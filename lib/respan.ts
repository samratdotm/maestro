const MOCK_MODE = process.env.MOCK_MODE === "true";
const RESPAN_BASE_URL = process.env.RESPAN_BASE_URL ?? "";
const RESPAN_API_KEY = process.env.RESPAN_API_KEY ?? "";
const RESPAN_MODEL = process.env.RESPAN_MODEL ?? "gpt-4o";

export interface RespanResult {
  content: string;
  traceId: string;
}

export async function callLLM(task: string): Promise<RespanResult> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    return {
      content: `[MOCK] Completed: ${task}`,
      traceId: `mock-trace-${Date.now()}`,
    };
  }

  const response = await fetch(`${RESPAN_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESPAN_API_KEY}`,
    },
    body: JSON.stringify({
      model: RESPAN_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a senior software engineering agent. Complete the given coding task concisely.",
        },
        { role: "user", content: task },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Respan API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    id: string;
  };

  return {
    content: data.choices[0]?.message?.content ?? "",
    traceId: data.id ?? "",
  };
}

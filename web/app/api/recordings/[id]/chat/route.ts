import { NextResponse } from "next/server";
import { getRecording, appendChatTurn } from "@/lib/recordings";
import { buildSystemPrompt, getAnthropic } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface IncomingMessage { role: "user" | "assistant"; content: string }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { messages?: IncomingMessage[] } | null;
  if (!body?.messages?.length) return NextResponse.json({ error: "Missing messages" }, { status: 400 });

  const rec = await getRecording(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!rec.transcript) return NextResponse.json({ error: "Transcript not ready" }, { status: 409 });

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (lastUser) await appendChatTurn(id, { role: "user", content: lastUser.content });

  const systemPrompt = buildSystemPrompt({ title: rec.title, segments: rec.transcript.segments });
  const genAI = getAnthropic();
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt,
  });

  // Convert message history to Gemini format (user/model roles, skip last user msg)
  const history = body.messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const userMessage = body.messages[body.messages.length - 1]!.content;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let assembled = "";
      try {
        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(userMessage);
        for await (const chunk of result.stream) {
          const t = chunk.text();
          if (t) {
            assembled += t;
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: t })}\n\n`));
          }
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        if (assembled) await appendChatTurn(id, { role: "assistant", content: assembled });
      } catch (err) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

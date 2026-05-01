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

  const system = buildSystemPrompt({ title: rec.title, segments: rec.transcript.segments });
  const client = getAnthropic();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let assembled = "";
      try {
        const resp = await client.messages.stream({
          model: "claude-opus-4-7",
          max_tokens: 2000,
          system: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
          ] as any,
          messages: body.messages!.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of resp) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const t = event.delta.text;
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

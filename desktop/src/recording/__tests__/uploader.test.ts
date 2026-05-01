import { describe, expect, it, vi, beforeEach } from "vitest";
import { Uploader, MIN_PART_SIZE } from "../uploader";

class FakeS3 {
  startCalls = 0;
  parts: Array<{ partNumber: number; size: number }> = [];
  completed = false;
  abort = false;
  uploadId = "upl-1";
  // The real SDK exposes `send(command)` which dispatches to per-command handlers.
  async send(cmd: any): Promise<any> {
    const name = cmd?.constructor?.name ?? "";
    if (name === "CreateMultipartUploadCommand") {
      this.startCalls++;
      return { UploadId: this.uploadId };
    }
    if (name === "UploadPartCommand") {
      const partNumber = cmd.input.PartNumber;
      const body: Uint8Array = cmd.input.Body;
      this.parts.push({ partNumber, size: body.length });
      return { ETag: `"etag-${partNumber}"` };
    }
    if (name === "CompleteMultipartUploadCommand") {
      this.completed = true;
      return { Location: "s3://bucket/key" };
    }
    if (name === "AbortMultipartUploadCommand") {
      this.abort = true;
      return {};
    }
    throw new Error(`Unexpected command ${name}`);
  }
}

function blob(size: number) { return new Blob([new Uint8Array(size)]); }

describe("Uploader", () => {
  let s3: FakeS3;
  let u: Uploader;
  beforeEach(() => {
    s3 = new FakeS3();
    u = new Uploader({ s3: s3 as any, bucket: "b", key: "k" });
  });

  it("does not upload tiny chunks; flushes once size exceeds MIN_PART_SIZE", async () => {
    await u.start();
    await u.push(blob(1024 * 1024)); // 1 MiB
    await u.push(blob(2 * 1024 * 1024)); // 2 MiB
    expect(s3.parts).toHaveLength(0);
    await u.push(blob(3 * 1024 * 1024)); // 3 MiB → total 6 MiB → flush
    expect(s3.parts).toEqual([{ partNumber: 1, size: 6 * 1024 * 1024 }]);
  });

  it("flushes the trailing buffer (any size) on complete()", async () => {
    await u.start();
    await u.push(blob(MIN_PART_SIZE)); // 5 MiB → flush
    await u.push(blob(100 * 1024)); // tiny remainder
    const out = await u.complete();
    expect(s3.parts.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(s3.completed).toBe(true);
    expect(out.size).toBe(MIN_PART_SIZE + 100 * 1024);
  });

  it("calls abort on cancel()", async () => {
    await u.start();
    await u.cancel();
    expect(s3.abort).toBe(true);
  });

  it("retries a failing UploadPart up to 3 times", async () => {
    let calls = 0;
    const origSend = s3.send.bind(s3);
    s3.send = vi.fn(async (cmd: any) => {
      const name = cmd?.constructor?.name ?? "";
      if (name === "UploadPartCommand") {
        calls++;
        if (calls < 3) throw new Error("transient");
      }
      return origSend(cmd);
    });
    await u.start();
    await u.push(blob(MIN_PART_SIZE));
    expect(calls).toBe(3);
  });
});

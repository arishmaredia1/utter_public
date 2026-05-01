import type { S3Client } from "@aws-sdk/client-s3";
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

export const MIN_PART_SIZE = 5 * 1024 * 1024;

interface UploaderOpts {
  s3: S3Client;
  bucket: string;
  key: string;
  contentType?: string;
}

interface CompleteResult { uploadId: string; etag: string; size: number }

export class Uploader {
  private buffer: Uint8Array[] = [];
  private buffered = 0;
  private uploadedParts: Array<{ ETag: string; PartNumber: number }> = [];
  private partNumber = 1;
  private uploadId: string | null = null;
  private totalBytes = 0;

  constructor(private opts: UploaderOpts) {}

  async start(): Promise<void> {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: this.opts.bucket,
      Key: this.opts.key,
      ContentType: this.opts.contentType ?? "video/webm",
    });
    const out = await this.opts.s3.send(cmd);
    if (!out.UploadId) throw new Error("R2 did not return UploadId");
    this.uploadId = out.UploadId;
  }

  async push(blob: Blob): Promise<void> {
    if (!this.uploadId) throw new Error("Uploader not started");
    const buf = new Uint8Array(await blob.arrayBuffer());
    this.buffer.push(buf);
    this.buffered += buf.byteLength;
    this.totalBytes += buf.byteLength;
    if (this.buffered >= MIN_PART_SIZE) await this.flushPart(false);
  }

  async complete(): Promise<CompleteResult> {
    if (!this.uploadId) throw new Error("Uploader not started");
    if (this.buffered > 0) await this.flushPart(true);
    const out = await this.opts.s3.send(new CompleteMultipartUploadCommand({
      Bucket: this.opts.bucket,
      Key: this.opts.key,
      UploadId: this.uploadId,
      MultipartUpload: { Parts: this.uploadedParts },
    }));
    return { uploadId: this.uploadId, etag: out.ETag ?? "", size: this.totalBytes };
  }

  async cancel(): Promise<void> {
    if (!this.uploadId) return;
    await this.opts.s3.send(new AbortMultipartUploadCommand({
      Bucket: this.opts.bucket,
      Key: this.opts.key,
      UploadId: this.uploadId,
    })).catch(() => {});
    this.uploadId = null;
  }

  private async flushPart(_isFinal: boolean): Promise<void> {
    const body = concat(this.buffer);
    this.buffer = [];
    this.buffered = 0;
    const partNumber = this.partNumber++;
    const etag = await this.uploadPartWithRetry(partNumber, body);
    this.uploadedParts.push({ ETag: etag, PartNumber: partNumber });
  }

  private async uploadPartWithRetry(partNumber: number, body: Uint8Array): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await this.opts.s3.send(new UploadPartCommand({
          Bucket: this.opts.bucket,
          Key: this.opts.key,
          UploadId: this.uploadId!,
          PartNumber: partNumber,
          Body: body,
        }));
        if (!out.ETag) throw new Error("Missing ETag");
        return out.ETag;
      } catch (err) {
        lastErr = err;
        await sleep(200 * Math.pow(2, attempt));
      }
    }
    throw lastErr;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.byteLength; }
  return out;
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

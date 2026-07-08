import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cached: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cached) return cached;
  const region = process.env.B2_REGION;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) throw new Error("B2 credentials are not configured");
  cached = new S3Client({
    region,
    endpoint: `https://s3.${region}.backblazeb2.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
}

export async function getSignedPlaybackUrl(key: string, ttlSec = 60 * 60 * 6): Promise<string> {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET is not set");
  const client = getR2Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSec });
}

import fs from "fs";
import path from "path";
import type { IncomingMessage } from "http";

const MAX_WIDTH = 512;

export class ImageHandler {
  private uploadsDir: string;

  constructor(projectRoot: string) {
    this.uploadsDir = path.join(projectRoot, "__ai_drafts__", ".uploads");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async handleUpload(req: IncomingMessage): Promise<{ path: string }> {
    this.ensureDir();

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);

    // Extract file from multipart form data
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(.+)/);

    let fileBuffer: Buffer;
    let filename: string;

    if (boundaryMatch) {
      // Parse multipart
      const boundary = boundaryMatch[1];
      const result = this.parseMultipart(body, boundary);
      fileBuffer = result.data;
      filename = result.filename || `upload-${Date.now()}.png`;
    } else {
      // Raw body
      fileBuffer = body;
      filename = `upload-${Date.now()}.png`;
    }

    // Try to resize with sharp if available, otherwise save as-is
    let outputBuffer: Buffer;
    try {
      const sharp = (await import("sharp")).default;
      const metadata = await sharp(fileBuffer).metadata();
      if (metadata.width && metadata.width > MAX_WIDTH) {
        outputBuffer = await sharp(fileBuffer)
          .resize(MAX_WIDTH)
          .jpeg({ quality: 85 })
          .toBuffer();
        filename = filename.replace(/\.[^.]+$/, ".jpg");
      } else {
        outputBuffer = fileBuffer;
      }
    } catch {
      // sharp not available, save as-is
      outputBuffer = fileBuffer;
    }

    const outputPath = path.join(this.uploadsDir, filename);
    fs.writeFileSync(outputPath, outputBuffer);

    return { path: outputPath };
  }

  private parseMultipart(
    body: Buffer,
    boundary: string
  ): { data: Buffer; filename: string } {
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = 0;

    while (start < body.length) {
      const idx = body.indexOf(boundaryBuf, start);
      if (idx === -1) break;
      if (start > 0) {
        parts.push(body.subarray(start, idx - 2)); // -2 for \r\n before boundary
      }
      start = idx + boundaryBuf.length + 2; // +2 for \r\n after boundary
    }

    for (const part of parts) {
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;
      const headers = part.subarray(0, headerEnd).toString();
      const data = part.subarray(headerEnd + 4);

      const filenameMatch = headers.match(/filename="([^"]+)"/);
      if (filenameMatch && data.length > 0) {
        return { data, filename: filenameMatch[1] };
      }
    }

    return { data: body, filename: `upload-${Date.now()}.png` };
  }
}

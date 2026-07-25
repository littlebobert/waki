import "dotenv/config";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { signWebhook } from "../packages/core/src/index.js";

const port = Number(process.env.MOCK_BOT_PORT ?? 4100);
const signingSecret = process.env.WEBHOOK_SIGNING_SECRET;

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/demo-events") {
    response.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const timestamp = String(request.headers["x-waki-timestamp"] ?? "");
    const actualSignature = String(
      request.headers["x-waki-signature"] ?? "",
    );
    if (signingSecret) {
      const expectedSignature = signWebhook(
        signingSecret,
        timestamp,
        body,
      );

      if (!signaturesMatch(expectedSignature, actualSignature)) {
        response.writeHead(401).end();
        return;
      }
    }

    console.log(
      JSON.stringify(
        {
          delivery: request.headers["x-waki-delivery"],
          event: request.headers["x-waki-event"],
          payload: JSON.parse(body) as unknown,
        },
        null,
        2,
      ),
    );
    response.writeHead(204).end();
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Mock bot callback listening on http://127.0.0.1:${port}`);
});

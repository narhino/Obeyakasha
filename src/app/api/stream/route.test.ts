import { afterAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { NextRequest } from "next/server";
import { LocalMediaProvider } from "@/lib/media/local";
import { makeStreamToken } from "@/lib/media/sign";
import { GET } from "./route";

/**
 * End-to-end byte-serving test (PLAN §7.3): a signed token streams real bytes
 * with HTTP Range support; a bad token is rejected. Runs against the LOCAL
 * provider with media under ./media-test (see vitest.config.ts).
 */
const provider = new LocalMediaProvider();
const trackId = "00000000-0000-4000-8000-000000000abc";
const bytes = new Uint8Array(1000).map((_, i) => i % 256);

async function seed(): Promise<string> {
  return provider.putStream(trackId, bytes, ".wav");
}

function streamRequest(qs: string, range?: string) {
  const headers = new Headers();
  if (range) headers.set("range", range);
  return new NextRequest(`http://localhost/api/stream?${qs}`, { headers });
}

afterAll(async () => {
  await rm("./media-test", { recursive: true, force: true });
});

describe("GET /api/stream", () => {
  it("serves the full file with a valid token", async () => {
    const key = await seed();
    const { token, exp } = makeStreamToken(key, 3600);
    const res = await GET(
      streamRequest(`key=${encodeURIComponent(key)}&exp=${exp}&token=${token}`),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Length")).toBe("1000");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(1000);
    expect(buf[0]).toBe(0);
    expect(buf[255]).toBe(255);
  });

  it("serves a partial range as 206 with Content-Range", async () => {
    const key = await seed();
    const { token, exp } = makeStreamToken(key, 3600);
    const res = await GET(
      streamRequest(
        `key=${encodeURIComponent(key)}&exp=${exp}&token=${token}`,
        "bytes=100-199",
      ),
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("Content-Length")).toBe("100");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.length).toBe(100);
    expect(buf[0]).toBe(100); // byte at offset 100 == 100 % 256
  });

  it("rejects a tampered token with 403", async () => {
    const key = await seed();
    const { exp } = makeStreamToken(key, 3600);
    const res = await GET(
      streamRequest(`key=${encodeURIComponent(key)}&exp=${exp}&token=deadbeef`),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a missing token", async () => {
    const res = await GET(streamRequest("key=stream/x.wav&exp=9999999999"));
    expect(res.status).toBe(403);
  });
});

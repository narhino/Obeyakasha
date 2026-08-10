import { describe, expect, it } from "vitest";
import { looksAutomated } from "./bots";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; SM-G996U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const SAMSUNG =
  "Mozilla/5.0 (Linux; Android 15; SM-G996U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";

describe("keeping automation out of her numbers", () => {
  it("counts real people on every device she actually has members on", () => {
    for (const ua of [CHROME, IPHONE, ANDROID, SAMSUNG]) {
      expect(looksAutomated(ua), `should count: ${ua}`).toBe(false);
    }
  });

  it("excludes the things that inflated the dashboard", () => {
    const automated = [
      null,
      "",
      "curl/8.0",
      "python-requests/2.31.0",
      "Go-http-client/1.1",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "axios/1.6.0",
      "PostmanRuntime/7.35.0",
    ];
    for (const ua of automated) {
      expect(looksAutomated(ua), `should exclude: ${ua}`).toBe(true);
    }
  });

  it("excludes anything with no plausible browser agent — an absent name is not a person", () => {
    expect(looksAutomated("x")).toBe(true);
    expect(looksAutomated("Mozilla/5.0")).toBe(true); // too short to be real
    expect(looksAutomated("SomeApp/1.0 (a long enough string to pass length)")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { taskDeadline } from "./deadline";

describe("taskDeadline", () => {
  const now = new Date("2026-07-17T12:00:00Z");
  const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);

  it("labels sub-hour deadlines as imminent, not overdue", () => {
    const r = taskDeadline(inHours(0.5), now);
    expect(r.overdue).toBe(false);
    expect(r.label).toBe("Before the hour is out");
  });

  it("labels an hours-away deadline", () => {
    const r = taskDeadline(inHours(3), now);
    expect(r.overdue).toBe(false);
    expect(r.label).toBe("3h to obey");
  });

  it("labels a days-away deadline", () => {
    const r = taskDeadline(inHours(50), now);
    expect(r.overdue).toBe(false);
    expect(r.label).toBe("2 days to obey");
  });

  it("marks a just-passed deadline overdue", () => {
    const r = taskDeadline(inHours(-2), now);
    expect(r.overdue).toBe(true);
    expect(r.label).toBe("Late. Obey now.");
  });

  it("counts full days late", () => {
    const r = taskDeadline(inHours(-49), now);
    expect(r.overdue).toBe(true);
    expect(r.label).toBe("2 days late");
  });
});

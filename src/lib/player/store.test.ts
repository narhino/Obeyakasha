import { beforeEach, describe, expect, it } from "vitest";
import { usePlayer, type QueueTrack } from "./store";

const t = (id: string): QueueTrack => ({
  id,
  title: `Track ${id}`,
  durationS: 100,
  artworkKey: null,
});

function reset() {
  usePlayer.setState({
    queue: [],
    index: 0,
    current: null,
    playing: false,
    positionS: 0,
    durationS: 0,
    endMode: "continue",
    sleepTimerMin: null,
    fullscreen: false,
    grounding: false,
  });
}

beforeEach(reset);

describe("player store — queue", () => {
  it("playNow loads the queue and starts at the given index", () => {
    usePlayer.getState().playNow([t("a"), t("b"), t("c")], 1);
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("b");
    expect(s.playing).toBe(true);
    expect(s.queue).toHaveLength(3);
  });

  it("addToQueue on an empty player starts playing", () => {
    usePlayer.getState().addToQueue(t("a"));
    expect(usePlayer.getState().current?.id).toBe("a");
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("addToQueue while playing appends without interrupting", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().addToQueue(t("b"));
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("a");
    expect(s.queue.map((q) => q.id)).toEqual(["a", "b"]);
  });

  it("playNext inserts right after the current track", () => {
    usePlayer.getState().playNow([t("a"), t("c")], 0);
    usePlayer.getState().playNext(t("b"));
    expect(usePlayer.getState().queue.map((q) => q.id)).toEqual(["a", "b", "c"]);
  });
});

describe("player store — navigation", () => {
  it("next advances through the queue then stops at the end (continue)", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 0);
    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("b");
    usePlayer.getState().next();
    expect(usePlayer.getState().playing).toBe(false);
  });

  it("repeatPlaylist wraps to the first track at the end", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 1);
    usePlayer.getState().setEndMode("repeatPlaylist");
    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("a");
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("prev restarts the track when >3s in", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 1);
    usePlayer.setState({ positionS: 10 });
    usePlayer.getState().prev();
    expect(usePlayer.getState().current?.id).toBe("b");
    expect(usePlayer.getState().positionS).toBe(0);
  });

  it("prev goes to the previous track when near the start", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 1);
    usePlayer.setState({ positionS: 1 });
    usePlayer.getState().prev();
    expect(usePlayer.getState().current?.id).toBe("a");
  });
});

describe("player store — end modes", () => {
  it("onTrackEnded with 'stop' pauses and resets position", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 0);
    usePlayer.getState().setEndMode("stop");
    usePlayer.getState().onTrackEnded();
    const s = usePlayer.getState();
    expect(s.playing).toBe(false);
    expect(s.positionS).toBe(0);
    expect(s.current?.id).toBe("a");
  });

  it("onTrackEnded with 'repeatTrack' restarts the same track", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 0);
    usePlayer.getState().setEndMode("repeatTrack");
    usePlayer.getState().onTrackEnded();
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("a");
    expect(s.playing).toBe(true);
  });

  it("onTrackEnded with 'continue' advances to the next track", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 0);
    usePlayer.getState().onTrackEnded();
    expect(usePlayer.getState().current?.id).toBe("b");
  });
});

describe("player store — grounding", () => {
  it("beginGrounding stops; endGrounding clears the queue", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 0);
    usePlayer.getState().beginGrounding();
    expect(usePlayer.getState().playing).toBe(false);
    expect(usePlayer.getState().grounding).toBe(true);
    usePlayer.getState().endGrounding();
    const s = usePlayer.getState();
    expect(s.current).toBeNull();
    expect(s.queue).toHaveLength(0);
  });
});

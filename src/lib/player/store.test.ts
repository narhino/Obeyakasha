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
    manualQueue: [],
    sourceQueue: [],
    sourceName: null,
    sourceIndex: 0,
    current: null,
    playing: false,
    positionS: 0,
    durationS: 0,
    bufferedS: 0,
    volume: 1,
    endMode: "continue",
    sleepTimerMin: null,
    fullscreen: false,
    queueOpen: false,
    grounding: false,
    seekRequest: null,
  });
}

beforeEach(reset);

describe("player store — playback entry", () => {
  it("playNow loads a source and starts at the given index", () => {
    usePlayer.getState().playNow([t("a"), t("b"), t("c")], 1);
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("b");
    expect(s.playing).toBe(true);
    expect(s.sourceQueue).toHaveLength(3);
    expect(s.sourceIndex).toBe(1);
    expect(s.sourceName).toBeNull();
  });

  it("playSource records the source name for the queue sheet", () => {
    usePlayer.getState().playSource([t("a"), t("b")], "The Descent", 0);
    const s = usePlayer.getState();
    expect(s.sourceName).toBe("The Descent");
    expect(s.current?.id).toBe("a");
    expect(s.manualQueue).toHaveLength(0);
  });

  it("addToQueue on an empty player starts playing", () => {
    usePlayer.getState().addToQueue(t("a"));
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("a");
    expect(s.playing).toBe(true);
    expect(s.manualQueue).toHaveLength(0);
  });

  it("addToQueue while playing appends to the manual queue, never the source", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().addToQueue(t("b"));
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("a");
    expect(s.sourceQueue.map((q) => q.id)).toEqual(["a"]);
    expect(s.manualQueue.map((q) => q.id)).toEqual(["b"]);
  });

  it("playNext puts a track at the front of the manual queue", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().addToQueue(t("b"));
    usePlayer.getState().playNext(t("c"));
    expect(usePlayer.getState().manualQueue.map((q) => q.id)).toEqual(["c", "b"]);
  });
});

describe("player store — manual vs source consumption", () => {
  it("next drains the manual queue before advancing the source", () => {
    usePlayer.getState().playSource([t("a"), t("b")], "S", 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().addToQueue(t("m2"));

    // manual first…
    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("m1");
    expect(usePlayer.getState().sourceIndex).toBe(0); // source pointer unmoved

    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("m2");

    // …then the source resumes where it left off.
    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("b");
    expect(usePlayer.getState().sourceIndex).toBe(1);
    expect(usePlayer.getState().manualQueue).toHaveLength(0);
  });

  it("next stops at the end of the source (continue)", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 0);
    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("b");
    usePlayer.getState().next();
    expect(usePlayer.getState().playing).toBe(false);
  });

  it("repeatPlaylist wraps to the first source track at the end", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 1);
    usePlayer.getState().setEndMode("repeatPlaylist");
    usePlayer.getState().next();
    expect(usePlayer.getState().current?.id).toBe("a");
    expect(usePlayer.getState().playing).toBe(true);
  });
});

describe("player store — queue editing", () => {
  it("reorderManual moves a manual item", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().addToQueue(t("m2"));
    usePlayer.getState().addToQueue(t("m3"));
    usePlayer.getState().reorderManual(2, 0);
    expect(usePlayer.getState().manualQueue.map((q) => q.id)).toEqual([
      "m3",
      "m1",
      "m2",
    ]);
  });

  it("removeFromQueue takes a track out of the manual queue only", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().addToQueue(t("m2"));
    usePlayer.getState().removeFromQueue("m1", "manual");
    expect(usePlayer.getState().manualQueue.map((q) => q.id)).toEqual(["m2"]);
  });

  it("removeFromQueue drops a future source item and keeps the pointer valid", () => {
    usePlayer.getState().playSource([t("a"), t("b"), t("c")], "S", 0);
    usePlayer.getState().removeFromQueue("c", "source");
    const s = usePlayer.getState();
    expect(s.sourceQueue.map((q) => q.id)).toEqual(["a", "b"]);
    expect(s.current?.id).toBe("a");
    expect(s.sourceIndex).toBe(0);
  });

  it("removeFromQueue never removes the currently-playing source track", () => {
    usePlayer.getState().playSource([t("a"), t("b")], "S", 0);
    usePlayer.getState().removeFromQueue("a", "source");
    expect(usePlayer.getState().sourceQueue).toHaveLength(2);
  });

  it("clearManual empties only the manual queue", () => {
    usePlayer.getState().playSource([t("a"), t("b")], "S", 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().clearManual();
    const s = usePlayer.getState();
    expect(s.manualQueue).toHaveLength(0);
    expect(s.sourceQueue).toHaveLength(2);
  });
});

describe("player store — jump", () => {
  it("jumpTo a manual item plays it and consumes the ones above", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().addToQueue(t("m2"));
    usePlayer.getState().addToQueue(t("m3"));
    usePlayer.getState().jumpTo("m2");
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("m2");
    expect(s.manualQueue.map((q) => q.id)).toEqual(["m3"]);
    expect(s.playing).toBe(true);
  });

  it("jumpTo a source item moves the pointer without touching the manual queue", () => {
    usePlayer.getState().playSource([t("a"), t("b"), t("c")], "S", 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().jumpTo("c");
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("c");
    expect(s.sourceIndex).toBe(2);
    expect(s.manualQueue.map((q) => q.id)).toEqual(["m1"]);
  });
});

describe("player store — navigation", () => {
  it("prev restarts the track when >3s in and requests a seek to 0", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 1);
    usePlayer.setState({ positionS: 10 });
    usePlayer.getState().prev();
    const s = usePlayer.getState();
    expect(s.current?.id).toBe("b");
    expect(s.positionS).toBe(0);
    expect(s.seekRequest?.positionS).toBe(0);
  });

  it("prev goes to the previous source track when near the start", () => {
    usePlayer.getState().playNow([t("a"), t("b")], 1);
    usePlayer.setState({ positionS: 1 });
    usePlayer.getState().prev();
    expect(usePlayer.getState().current?.id).toBe("a");
  });
});

describe("player store — seek + buffered", () => {
  it("seekTo sets an optimistic position and a bumped request", () => {
    usePlayer.getState().playNow([t("a")], 0);
    usePlayer.getState().seekTo(42);
    const s = usePlayer.getState();
    expect(s.positionS).toBe(42);
    expect(s.seekRequest?.positionS).toBe(42);
    const seq1 = s.seekRequest?.seq ?? 0;
    usePlayer.getState().seekTo(42); // same value must still re-fire
    expect((usePlayer.getState().seekRequest?.seq ?? 0)).toBe(seq1 + 1);
  });

  it("setBuffered records buffered seconds", () => {
    usePlayer.getState().setBuffered(88);
    expect(usePlayer.getState().bufferedS).toBe(88);
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
  it("beginGrounding stops; endGrounding clears both queues", () => {
    usePlayer.getState().playSource([t("a"), t("b")], "S", 0);
    usePlayer.getState().addToQueue(t("m1"));
    usePlayer.getState().beginGrounding();
    expect(usePlayer.getState().playing).toBe(false);
    expect(usePlayer.getState().grounding).toBe(true);
    usePlayer.getState().endGrounding();
    const s = usePlayer.getState();
    expect(s.current).toBeNull();
    expect(s.sourceQueue).toHaveLength(0);
    expect(s.manualQueue).toHaveLength(0);
    expect(s.sourceName).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_FPS, shouldDrawFrame } from "../fx-loop";

describe("背景特效帧节流", () => {
  it("首帧立刻绘制（lastDrawnAt=0），不空等一个间隔", () => {
    expect(shouldDrawFrame(16.7, 0, 33.3)).toBe(true);
  });

  it("间隔不足 minDelta 时跳过", () => {
    expect(shouldDrawFrame(20, 10, 1000 / DEFAULT_FPS)).toBe(false);
  });

  it("刚好达到 minDelta 时放行", () => {
    const min = 1000 / DEFAULT_FPS;
    expect(shouldDrawFrame(10 + min, 10, min)).toBe(true);
  });

  it("时间戳异常（NaN/Infinity）不绘制，避免把循环打乱", () => {
    expect(shouldDrawFrame(Number.NaN, 0, 16)).toBe(false);
    expect(shouldDrawFrame(Number.POSITIVE_INFINITY, 0, 16)).toBe(false);
  });

  it("30fps 上限下，一秒内最多画 30 帧", () => {
    const min = 1000 / DEFAULT_FPS;
    let drawn = 0;
    let last = 0;
    // 按 120Hz 的刷新率喂 2 秒
    const step = 1000 / 120;
    for (let t = 0; t <= 2000; t += step) {
      if (shouldDrawFrame(t, last, min)) {
        drawn += 1;
        last = t;
      }
    }
    // 2 秒窗口，30fps 上限 → 60 帧上下（留 1 帧边界）
    expect(drawn).toBeLessThanOrEqual(61);
    expect(drawn).toBeGreaterThan(56);
  });

  it("帧率上限越低，绘制次数越少（证明限帧真的生效）", () => {
    const count = (fps: number) => {
      const min = 1000 / fps;
      let drawn = 0;
      let last = 0;
      for (let t = 0; t <= 1000; t += 1000 / 60) {
        if (shouldDrawFrame(t, last, min)) {
          drawn += 1;
          last = t;
        }
      }
      return drawn;
    };
    expect(count(15)).toBeLessThan(count(30));
    expect(count(30)).toBeLessThan(count(60));
  });
});

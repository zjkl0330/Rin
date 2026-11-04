/**
 * 背景特效共用的帧循环。
 *
 * 这些 canvas 特效（氛围粒子、樱花、丝带、光标拖尾）原先各自写了一份
 * `requestAnimationFrame` 自循环，帧率跟着屏幕刷新率跑：120Hz 的机器上就是
 * 120 次全屏 clearRect + 重绘，而视觉上完全看不出差别。几个特效同时打开时
 * 主线程被这些"零收益"的重绘占满，卡片滚动、开关点击都会变钝。
 *
 * 这里统一做三件事：
 * 1. 按 fps 上限节流（默认 30，背景层足够，肉眼几乎无感）；
 * 2. 标签页隐藏时跳过绘制（浏览器只保证 rAF 降频，不保证停）；
 * 3. 把 tick 交给 draw 统一维护，避免各组件自己数帧导致相位漂移。
 *
 * 预算：`shouldDrawFrame` 是纯函数，单测覆盖节流边界。
 */

export const DEFAULT_FPS = 30;

/** 距上一帧不足 minDelta 就跳过：保证「最多 fps 帧/秒」，不补帧。 */
export function shouldDrawFrame(now: number, lastDrawnAt: number, minDelta: number): boolean {
  if (!Number.isFinite(now)) {
    return false;
  }
  // lastDrawnAt 为 0 表示还没画过，第一帧立刻画（否则首屏会空一个间隔）
  if (lastDrawnAt === 0) {
    return true;
  }
  // 1ms 容差：rAF 时间戳是浮点，恰好等于间隔时可能差 0.001 就被误判成"还不够"，
  // 在 120Hz/90Hz 这类非整除刷新率下会连锁丢帧（实测 30fps 目标掉到 24fps）。
  return now - lastDrawnAt >= minDelta - 1;
}

export interface FrameLoopOptions {
  /** 帧率上限，默认 30 */
  fps?: number;
  /**
   * 绘制一帧。返回 false 表示「这次没有内容可画」，
   * 循环会停止并在 `wake()` 被调用时重启（光标拖尾省电用）。
   */
  draw: (tick: number) => boolean | void;
}

export interface FrameLoopHandle {
  stop(): void;
  /** 外部事件（如 pointermove）唤醒已停止的循环 */
  wake(): void;
}

export function startFrameLoop({ fps = DEFAULT_FPS, draw }: FrameLoopOptions): FrameLoopHandle {
  const minDelta = 1000 / Math.max(1, fps);
  let raf = 0;
  let running = true;
  let lastDrawnAt = 0;
  let tick = 0;

  const frame = (now: number) => {
    if (!running) {
      return;
    }
    raf = requestAnimationFrame(frame);
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }
    if (!shouldDrawFrame(now, lastDrawnAt, minDelta)) {
      return;
    }
    lastDrawnAt = now;
    tick += 1;
    if (draw(tick) === false) {
      // 无事可画：停掉循环，等 wake() 再起，避免空转
      cancelAnimationFrame(raf);
      raf = 0;
      lastDrawnAt = 0;
    }
  };

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    wake() {
      if (!running || raf) {
        return;
      }
      lastDrawnAt = 0;
      raf = requestAnimationFrame(frame);
    },
  };
}

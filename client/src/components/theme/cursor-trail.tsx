import { useContext, useEffect, useRef } from "react";
import { ClientConfigContext } from "../../state/config";
import { useColorMode } from "../../utils/darkModeUtils";
import { startFrameLoop } from "./fx-loop";

type TrailPoint = {
  x: number;
  y: number;
  life: number;
};

const MAX_POINTS = 24;
/** 30fps 下约 0.33s 淡完，和原先 60fps × 16 帧的观感对齐 */
const FADE_TICKS = 10;

export function CursorTrail() {
  const config = useContext(ClientConfigContext);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorMode = useColorMode();
  const trailEnabled = config.getBoolean("widget.cursor.trail_enabled");
  // 触屏设备没有悬停指针，不挂拖尾
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const active = trailEnabled && !coarsePointer;

  useEffect(() => {
    if (!active) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let points: TrailPoint[] = [];

    const resize = () => {
      canvas.width = document.documentElement.clientWidth;
      canvas.height = document.documentElement.clientHeight;
    };

    // 光点取主题强调色，但浅色页面要压暗、深色页面要提亮，
    // 否则浅色主题（如樱粉、暖砂）的光点会和页面背景糊成一片。
    const themeRgb = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--theme-rgb")
        .trim();
      const parts = raw.split(/\s+/).map(Number);
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
        return "90 176 216";
      }
      const factor = colorMode === "light" ? 0.62 : 1.2;
      const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v * factor)));
      return `${clamp(parts[0])} ${clamp(parts[1])} ${clamp(parts[2])}`;
    };

    // getComputedStyle 会强制样式重算，此前每帧调一次 = 每秒 60 次同步重排。
    // 主题色只在切档/换主题时变，缓存起来，移动时最多每 500ms 校准一次。
    let cachedRgb = themeRgb();
    let lastRgbAt = 0;
    const refreshRgb = () => {
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now - lastRgbAt < 500) {
        return;
      }
      lastRgbAt = now;
      cachedRgb = themeRgb();
    };

    const loop = startFrameLoop({
      fps: 30,
      draw: () => {
        const alive = points.filter((p) => p.life < FADE_TICKS);
        if (alive.length === 0) {
          // 光标停下后不再空转：清一次画布就休眠，等下一次 pointermove 唤醒
          if (points.length > 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            points = [];
          }
          return false;
        }
        points = alive;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rgb = cachedRgb;
        ctx.shadowColor = `rgb(${rgb})`;
        ctx.shadowBlur = 10;
        points.forEach((p, index) => {
          p.life += 1;
          const alpha = Math.max(0, 1 - p.life / FADE_TICKS) * (index / MAX_POINTS) * 2;
          ctx.globalAlpha = Math.min(alpha, 0.72);
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.4 * Math.max(alpha, 0.12) + 0.6, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        return true;
      },
    });

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      points.push({ x: event.clientX, y: event.clientY, life: 0 });
      if (points.length > MAX_POINTS) {
        points = points.slice(points.length - MAX_POINTS);
      }
      refreshRgb();
      loop.wake();
    };

    resize();
    cachedRgb = themeRgb();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      loop.stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [active, colorMode]);

  if (!active) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-30"
      aria-hidden="true"
    />
  );
}

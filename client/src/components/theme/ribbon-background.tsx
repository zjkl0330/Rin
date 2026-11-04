import { useContext, useEffect, useRef } from "react";
import { ClientConfigContext } from "../../state/config";
import { useColorMode } from "../../utils/darkModeUtils";
import { startFrameLoop } from "./fx-loop";

type NestPoint = { x: number; y: number; vx: number; vy: number };

/** 连线距离阈值（CSS 像素） */
const NEST_LINK_DIST = 120;
/** 连线透明度分档数：同档合并成一次 stroke，把上百次 draw call 压到 4 次 */
const LINK_BUCKETS = 4;
/** 点数按可视面积换算，1.29M 像素 → 50 点；下限 24 保证手机上依然成网 */
const POINTS_PER_PIXEL = 1 / 26000;
const MIN_POINTS = 24;
const MAX_POINTS = 56;
/**
 * 背景层 30fps 就够；运动速度按「原 60fps 的每帧位移 × 2」补偿，
 * 否则限帧后整片网会明显变慢。
 */
const SPEED_SCALE = 2;

function nestColor(colorMode: "light" | "dark"): string {
  return colorMode === "dark" ? "168,224,245" : "47,111,146";
}

function pointCount(width: number, height: number): number {
  const area = Math.max(0, width) * Math.max(0, height);
  const raw = Math.round(area * POINTS_PER_PIXEL);
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, raw));
}

export function RibbonBackground() {
  const config = useContext(ClientConfigContext);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enabled = config.getBoolean("widget.ribbon.enabled");
  const mode = String(config.get("widget.ribbon.mode") ?? "nest");
  const colorMode = useColorMode();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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

    let points: NestPoint[] = [];
    // 每帧复用的线段桶，避免每次分配数组（GC 抖动在低端机上是可见的卡顿）
    const lines: number[][] = Array.from({ length: LINK_BUCKETS }, () => []);

    const resize = () => {
      canvas.width = document.documentElement.clientWidth;
      canvas.height = document.documentElement.clientHeight;
      if (mode === "nest") {
        const count = pointCount(canvas.width, canvas.height);
        points = [];
        for (let i = 0; i < count; i += 1) {
          points.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
          });
        }
      }
    };

    const loop = startFrameLoop({
      fps: 30,
      draw: (tick) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const rgb = nestColor(colorMode);

        if (mode === "ribbon") {
          // 三条正弦彩带，随 tick 流动
          for (let r = 0; r < 3; r += 1) {
            const baseY = canvas.height * (0.25 + r * 0.25);
            const amp = 40 + r * 18;
            const freq = 0.004 + r * 0.001;
            const speed = tick * SPEED_SCALE * (0.6 + r * 0.25);
            ctx.beginPath();
            for (let x = 0; x <= canvas.width; x += 8) {
              const y = baseY + Math.sin(x * freq + speed) * amp;
              if (x === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
            ctx.strokeStyle = `rgba(${rgb},${0.22 - r * 0.05})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          return true;
        }

        // canvas_nest 风格：漂浮点 + 近距连线
        const limit = NEST_LINK_DIST;
        const limitSq = limit * limit;
        for (const p of points) {
          p.x += p.vx * SPEED_SCALE;
          p.y += p.vy * SPEED_SCALE;
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
          if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        }

        for (const bucket of lines) bucket.length = 0;
        for (let i = 0; i < points.length; i += 1) {
          const a = points[i];
          for (let j = i + 1; j < points.length; j += 1) {
            const b = points[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy;
            // 平方距离比较，省掉每次 Math.hypot 的开销（O(n²) 下这是主要成本）
            if (distSq >= limitSq) continue;
            const strength = 1 - Math.sqrt(distSq) / limit;
            const index = Math.min(LINK_BUCKETS - 1, Math.max(0, Math.floor(strength * LINK_BUCKETS)));
            const bucket = lines[index];
            bucket.push(a.x, a.y, b.x, b.y);
          }
        }
        for (let b = 0; b < LINK_BUCKETS; b += 1) {
          const bucket = lines[b];
          if (bucket.length === 0) continue;
          ctx.strokeStyle = `rgba(${rgb},${(0.35 * ((b + 1) / LINK_BUCKETS)).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 0; k < bucket.length; k += 4) {
            ctx.moveTo(bucket[k], bucket[k + 1]);
            ctx.lineTo(bucket[k + 2], bucket[k + 3]);
          }
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(${rgb},0.6)`;
        ctx.beginPath();
        for (const p of points) {
          ctx.moveTo(p.x + 1.5, p.y);
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        }
        ctx.fill();
        return true;
      },
    });

    resize();
    window.addEventListener("resize", resize);

    return () => {
      loop.stop();
      window.removeEventListener("resize", resize);
    };
  }, [enabled, mode, colorMode]);

  if (!enabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 -z-10"
      data-rin-widget="fx"
      aria-hidden="true"
    />
  );
}

export default RibbonBackground;

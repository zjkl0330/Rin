import { lazy, Suspense, useContext } from "react";
import { useLocation } from "wouter";
import { ClientConfigContext } from "../../state/config";
import { CursorStyle } from "./cursor-style";
import { CursorTrail } from "./cursor-trail";
import { Firework } from "./firework";
import { Live2DWidget } from "./live2d-widget";
import { MusicPlayer } from "./music-player";
// 预加载遮罩要尽早出现：静态导入（lazy 会等 chunk 回来才渲染，错过首屏就失去意义）
import { Preloader } from "./preloader";

// 氛围背景按需加载，不进首屏 chunk（mermaid-render 同款模式）
const AmbientBackground = lazy(() => import("./ambient-background"));
// 二次元特效批次同样按需加载
const FallingSakura = lazy(() => import("./falling-sakura"));
const RibbonBackground = lazy(() => import("./ribbon-background"));
const PowerMode = lazy(() => import("./power-mode"));
const NoteEffect = lazy(() => import("./note-effect"));
const CyberEffects = lazy(() => import("./cyber-effects"));
const SocialFloat = lazy(() => import("./social-float"));

export function ThemeWidgets() {
  const config = useContext(ClientConfigContext);
  // 后台是干活的地方：飘落花瓣、网格连线、光标拖尾这些装饰会压在设置卡片上
  // （同一个层叠上下文里后渲染的 canvas 必胜），也会和底部保存条抢视觉焦点。
  // 在前台保留，进 /admin 一律不挂。
  const [location] = useLocation();
  const inAdmin = location.startsWith("/admin");
  const live2dEnabled = config.getBoolean("widget.live2d.enabled");
  const fireworkEnabled = config.getBoolean("widget.firework.enabled") && !inAdmin;
  const ambientEnabled = config.getBoolean("widget.ambient.enabled") && !inAdmin;
  const sakuraEnabled = config.getBoolean("widget.sakura.enabled") && !inAdmin;
  const ribbonEnabled = config.getBoolean("widget.ribbon.enabled") && !inAdmin;
  const powerModeEnabled = config.getBoolean("widget.power_mode.enabled") && !inAdmin;
  const noteEnabled = config.getBoolean("widget.note_click.enabled") && !inAdmin;
  const preloaderEnabled = config.getBoolean("widget.preloader.enabled");
  const cyberEnabled =
    (config.getBoolean("widget.cyber.title_glitch") || config.getBoolean("widget.cyber.grid_background")) && !inAdmin;
  const socialEnabled = config.getBoolean("widget.social.enabled");

  return (
    <>
      {preloaderEnabled ? <Preloader /> : null}
      {ambientEnabled ? (
        <Suspense fallback={null}>
          <AmbientBackground />
        </Suspense>
      ) : null}
      {sakuraEnabled ? (
        <Suspense fallback={null}>
          <FallingSakura />
        </Suspense>
      ) : null}
      {ribbonEnabled ? (
        <Suspense fallback={null}>
          <RibbonBackground />
        </Suspense>
      ) : null}
      <CursorStyle />
      {inAdmin ? null : <CursorTrail />}
      {fireworkEnabled ? <Firework /> : null}
      {live2dEnabled ? <Live2DWidget /> : null}
      {inAdmin ? null : <MusicPlayer />}
      {powerModeEnabled ? (
        <Suspense fallback={null}>
          <PowerMode />
        </Suspense>
      ) : null}
      {noteEnabled ? (
        <Suspense fallback={null}>
          <NoteEffect />
        </Suspense>
      ) : null}
      {cyberEnabled ? (
        <Suspense fallback={null}>
          <CyberEffects />
        </Suspense>
      ) : null}
      {socialEnabled ? (
        <Suspense fallback={null}>
          <SocialFloat />
        </Suspense>
      ) : null}
    </>
  );
}

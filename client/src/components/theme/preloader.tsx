import { useContext, useEffect, useState } from "react";
import { ClientConfigContext } from "../../state/config";

const SESSION_KEY = "rin-preloader-shown";

/**
 * 网页预加载动画：进站首屏遮罩，window load 后淡出。
 * 开关：widget.preloader.enabled。同一会话只显示一次（sessionStorage）。
 */
export function Preloader() {
  const config = useContext(ClientConfigContext);
  const enabled = config.getBoolean("widget.preloader.enabled");
  const [phase, setPhase] = useState<"hidden" | "showing" | "leaving">("hidden");

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (typeof sessionStorage === "undefined") {
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY)) {
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");

    setPhase("showing");
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      setPhase((prev) => (prev === "showing" ? "leaving" : prev));
      window.setTimeout(() => setPhase("hidden"), 480);
    };
    if (document.readyState === "complete") {
      window.setTimeout(leave, 500);
    } else {
      window.addEventListener("load", leave, { once: true });
      // 兜底：资源卡住也最多 2.5s 收场
      window.setTimeout(leave, 2500);
    }
    return () => {
      // 这里**不能**清掉负责 leave 的定时器。
      // StrictMode 双跑 / 配置异步加载（enabled 从 false 变 true）都会让 effect 重入：
      // React 先跑 cleanup 再跑新 effect。cleanup 若把 timer 清掉，新 effect 又因为
      // session key 已写而直接 return —— 定时器就此丢失，遮罩永远停在 showing（实测卡死）。
      // leave() 的 left 标志保证重复触发无害，残留 timer 最多存活 2.5s，
      // 且组件真卸载后 setState 无副作用。
      window.removeEventListener("load", leave);
    };
  }, [enabled]);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      className={`rin-preloader ${phase === "leaving" ? "rin-preloader-leaving" : ""}`}
      aria-hidden="true"
    >
      <div className="rin-preloader-ring" />
    </div>
  );
}

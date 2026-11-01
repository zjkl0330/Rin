/**
 * 换模型的分支决策（纯函数，便于单测）。
 *
 * 背景：看板娘有两套渲染器 —— Cubism 插件实例与自研 furina-mini。切换模型时
 * 能做的事分五档，代价从低到高：
 *
 *   noop          什么都没发生（目标就是当前模型，或目标 furina 且 Cubism 从未初始化）
 *   suspend       切到 furina-mini：Cubism 只藏起来 + 停渲染循环，实例、WebGL 上下文、
 *                 已上传的纹理全部留着（代价≈0）
 *   prewarm-wait  目标正是后台预渲染中的那个：容器亮出来等它画完即可，
 *                 这时若再 changeModel 会把正在进行的加载打断，反而更慢
 *   resume        实例里已经是这个模型且画过一帧：直接显示（代价≈0）
 *   change        实例可用但装的是别的模型：changeModel 换模型（要重新解析 moc3、
 *                 上传纹理，但没有引擎重建）
 *   remount       引擎根本不可用：只能重挂载组件，重新 initWidget（最贵）
 *
 * 这几种情况以前散在 switchModel 的 if 里，无 WebGL 的环境下没法端到端验证，
 * 所以抽出来用状态机的方式覆盖。
 */
export type SwitchPlan =
  | "noop"
  | "suspend"
  | "prewarm-wait"
  | "resume"
  | "change"
  | "remount";

export type SwitchInput = {
  /** 目标模型名 */
  target: string;
  /** 当前显示的模型名 */
  current: string;
  /** 引擎实例是否可用（window.__rinLive2dApp.changeModel 存在） */
  engineAvailable: boolean;
  /** Cubism 实例是否还活着（#waifu 在文档里、没被销毁） */
  cubismAlive: boolean;
  /** 该实例是否至少画完过一帧 */
  cubismReady: boolean;
  /** 该实例里当前装着的模型名 */
  cubismModel: string;
  /** 正在后台预渲染的模型名（空字符串表示没有） */
  prewarming: string;
};

export function planModelSwitch(input: SwitchInput): SwitchPlan {
  const { target, current } = input;
  if (!target || target === current) {
    return "noop";
  }
  // 目标是 furina-mini：Cubism 能保活就只藏，没初始化过就更不需要动
  if (target === "furina-mini") {
    return input.cubismAlive ? "suspend" : "noop";
  }
  // 以下都是目标为 Cubism 模型
  if (!input.engineAvailable) {
    return "remount";
  }
  if (input.prewarming && input.prewarming === target && !input.cubismReady) {
    return "prewarm-wait";
  }
  if (input.cubismAlive && input.cubismReady && input.cubismModel === target) {
    return "resume";
  }
  return "change";
}

import { describe, expect, it } from "vitest";
import { planModelSwitch, type SwitchInput } from "../switch-plan";

const base: SwitchInput = {
  target: "BCSZ1.1",
  current: "furina-mini",
  engineAvailable: true,
  cubismAlive: true,
  cubismReady: true,
  cubismModel: "BCSZ1.1",
  prewarming: "",
};

const plan = (patch: Partial<SwitchInput>) => planModelSwitch({ ...base, ...patch });

describe("换模型分支决策", () => {
  it("目标与当前相同：什么都不做", () => {
    expect(plan({ target: "BCSZ1.1", current: "BCSZ1.1" })).toBe("noop");
  });

  it("目标为空：什么都不做（防配置脏数据）", () => {
    expect(plan({ target: "" })).toBe("noop");
  });

  it("切到 furina-mini 且 Cubism 活着：只藏不拆", () => {
    expect(plan({ target: "furina-mini", current: "BCSZ1.1" })).toBe("suspend");
  });

  it("切到 furina-mini 且 Cubism 从未初始化：没东西可拆", () => {
    expect(plan({ target: "furina-mini", current: "furina", cubismAlive: false })).toBe("noop");
  });

  it("引擎不可用：只能重挂载", () => {
    expect(plan({ engineAvailable: false, cubismAlive: false })).toBe("remount");
  });

  it("目标正在后台预渲染且还没画完：等它，不要 changeModel 打断", () => {
    expect(
      plan({ prewarming: "BCSZ1.1", cubismReady: false, cubismModel: "" }),
    ).toBe("prewarm-wait");
  });

  it("目标正在预渲染且已画完：走 resume（预渲染那档让位于更快的复用）", () => {
    expect(plan({ prewarming: "BCSZ1.1", cubismReady: true })).toBe("resume");
  });

  it("实例里已装的就是目标模型且画完过：直接亮，不重建", () => {
    expect(plan({ cubismModel: "BCSZ1.1", cubismReady: true })).toBe("resume");
  });

  it("实例活着但装的是别的模型：changeModel", () => {
    expect(plan({ cubismModel: "furina", cubismReady: true })).toBe("change");
  });

  it("实例活着但还没画完过：不能当 resume，走 changeModel 重新确认", () => {
    expect(plan({ cubismModel: "BCSZ1.1", cubismReady: false })).toBe("change");
  });

  it("目标 furina（正式模型）与预渲染无关：engine 可用就走 changeModel", () => {
    expect(plan({ target: "furina", cubismModel: "BCSZ1.1", prewarming: "BCSZ1.1" })).toBe(
      "change",
    );
  });

  it("预渲染目标是 BCSZ，但用户要切的是另一个模型：不能被 prewarm-wait 劫持", () => {
    expect(plan({ target: "furina", prewarming: "BCSZ1.1", cubismReady: false, cubismModel: "" }))
      .toBe("change");
  });
});

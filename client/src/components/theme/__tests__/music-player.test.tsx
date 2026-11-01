import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientConfigContext, ConfigWrapper, defaultClientConfig } from "../../../state/config";
import { MusicPlayer } from "../music-player";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// 默认配置里带了一个可用的 meting 源（会真的发网络请求）。需要测"没配源"的用例
// 用一个剔除 meting 键的默认表——注意 ConfigWrapper 会把空串当成"未设置"回退默认，
// 所以传 "" 是关不掉默认源的。
const noMetingDefaults = new Map(
  [...defaultClientConfig].filter(([key]) => !key.startsWith("widget.player.meting")),
);

function renderWithConfig(
  overrides: Record<string, unknown>,
  defaults: Map<string, unknown> = noMetingDefaults,
) {
  const config = new ConfigWrapper(overrides, defaults);
  return render(
    <ClientConfigContext.Provider value={config}>
      <MusicPlayer />
    </ClientConfigContext.Provider>,
  );
}

describe("MusicPlayer 无源提示（修复开关开了却静默不渲染）", () => {
  it("开了开关但没配音频源时，显示配置提示而非空白", () => {
    renderWithConfig({ "widget.player.enabled": true });
    expect(screen.getByText("theme.player.no_source")).toBeTruthy();
  });

  it("关掉开关时整体不渲染", () => {
    const { container } = renderWithConfig({ "widget.player.enabled": false });
    expect(container.textContent).toBe("");
  });

  it("配了静态曲目时不提示无源，渲染出播放器", () => {
    const audio = JSON.stringify([
      { name: "示例曲", artist: "某人", url: "https://example.com/a.mp3" },
    ]);
    renderWithConfig({ "widget.player.enabled": true, "widget.player.audio": audio });
    expect(screen.queryByText("theme.player.no_source")).toBeNull();
    expect(screen.getByText("示例曲")).toBeTruthy();
  });

  it("歌单还在请求中时显示加载提示，而不是误报没配源", () => {
    // 请求挂起（不 resolve），组件应停在 loading 态
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithConfig(
      {
        "widget.player.enabled": true,
        "widget.player.meting_api": "https://music.example.com/api",
        "widget.player.meting": '{"server":"netease","type":"playlist","id":"1"}',
      },
      defaultClientConfig,
    );
    expect(screen.getByText("theme.player.loading")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

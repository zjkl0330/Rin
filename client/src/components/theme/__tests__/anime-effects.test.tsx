import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientConfigContext, ConfigWrapper, defaultClientConfig } from "../../../state/config";
import { FallingSakura } from "../falling-sakura";
import { Firework } from "../firework";
import { RibbonBackground } from "../ribbon-background";
import { PowerMode } from "../power-mode";
import { NoteEffect } from "../note-effect";
import { CyberEffects } from "../cyber-effects";
import { WaveFooter } from "../wave-footer";
import { Hitokoto } from "../hitokoto";
import { Preloader } from "../preloader";

// jsdom 未实现 matchMedia / IntersectionObserver：给最小 polyfill
beforeAll(() => {
    if (typeof window.matchMedia !== "function") {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }),
        });
    }
});

beforeEach(() => {
    document.documentElement.className = "";
    document.body.innerHTML = "";
});

afterEach(() => {
    sessionStorage.clear();
});

function renderWithConfig(ui: React.ReactElement, overrides: Record<string, unknown>) {
    const config = new ConfigWrapper(overrides, defaultClientConfig);
    return render(<ClientConfigContext.Provider value={config}>{ui}</ClientConfigContext.Provider>);
}

describe("FallingSakura", () => {
    it("renders nothing while disabled", () => {
        const { container } = renderWithConfig(<FallingSakura />, {});
        expect(container.querySelector("canvas")).toBeNull();
    });

    it("mounts a click-through canvas when enabled", () => {
        const { container } = renderWithConfig(<FallingSakura />, { "widget.sakura.enabled": true });
        const canvas = container.querySelector("canvas");
        expect(canvas).not.toBeNull();
        expect(canvas!.className).toContain("pointer-events-none");
    });
});

describe("RibbonBackground", () => {
    it("renders nothing while disabled", () => {
        const { container } = renderWithConfig(<RibbonBackground />, {});
        expect(container.querySelector("canvas")).toBeNull();
    });

    it("mounts canvas when enabled with default nest mode", () => {
        const { container } = renderWithConfig(<RibbonBackground />, { "widget.ribbon.enabled": true });
        expect(container.querySelector("canvas")).not.toBeNull();
    });
});

describe("PowerMode", () => {
    it("renders nothing while disabled", () => {
        const { container } = renderWithConfig(<PowerMode />, {});
        expect(container.querySelector("canvas")).toBeNull();
    });

    it("mounts canvas when enabled", () => {
        const { container } = renderWithConfig(<PowerMode />, { "widget.power_mode.enabled": true });
        expect(container.querySelector("canvas")).not.toBeNull();
    });
});

describe("事件型粒子特效不空转", () => {
    let pending: FrameRequestCallback[];
    let rafCalls = 0;
    let cancels = 0;

    beforeEach(() => {
        pending = [];
        rafCalls = 0;
        cancels = 0;
        let id = 1;
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
            pending.push(cb);
            rafCalls += 1;
            return id++;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
            cancels += 1;
        });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            beginPath: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            measureText: vi.fn(() => ({ width: 0 })),
            globalAlpha: 1,
            fillStyle: "",
            font: "",
        } as unknown as CanvasRenderingContext2D);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function flushFrames(count: number) {
        for (let i = 0; i < count; i += 1) {
            const frame = pending.splice(0);
            frame.forEach((cb) => cb(16.7 * (i + 1)));
        }
    }

    it("Firework 没有粒子时停止帧循环，pointerdown 后才唤醒", () => {
        const { unmount } = renderWithConfig(<Firework />, { "widget.firework.enabled": true });
        flushFrames(2);
        expect(cancels).toBeGreaterThan(0);
        const before = rafCalls;

        act(() => {
            window.dispatchEvent(new MouseEvent("pointerdown", { clientX: 12, clientY: 20 }));
        });
        expect(rafCalls).toBeGreaterThan(before);
        unmount();
    });

    it("PowerMode 没有粒子时停止帧循环，输入事件后才唤醒", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        const { unmount } = renderWithConfig(<PowerMode />, { "widget.power_mode.enabled": true });
        flushFrames(2);
        expect(cancels).toBeGreaterThan(0);
        const before = rafCalls;

        act(() => {
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(rafCalls).toBeGreaterThan(before);
        unmount();
    });
});

describe("NoteEffect", () => {
    it("does not spawn notes on unrelated clicks when disabled", () => {
        document.body.innerHTML = '<a aria-label="home" href="/">Home</a>';
        renderWithConfig(<NoteEffect />, {});
        document.querySelector('a[aria-label="home"]')!.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
        );
        expect(document.querySelectorAll(".rin-note")).toHaveLength(0);
    });

    it("spawns floating notes when the brand link is clicked", () => {
        document.body.innerHTML = '<a aria-label="home" href="/">Home</a>';
        renderWithConfig(<NoteEffect />, { "widget.note_click.enabled": true });
        act(() => {
            document.querySelector('a[aria-label="home"]')!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });
        const notes = document.querySelectorAll(".rin-note");
        expect(notes.length).toBeGreaterThanOrEqual(3);
        expect(notes.length).toBeLessThanOrEqual(5);
    });
});

describe("CyberEffects", () => {
    it("renders nothing and sets no class when disabled", () => {
        const { container } = renderWithConfig(<CyberEffects />, {});
        expect(container.querySelector(".rin-cyber-grid-bg")).toBeNull();
        expect(document.documentElement.classList.contains("rin-cyber-glitch")).toBe(false);
    });

    it("toggles the glitch class and renders the grid layer", () => {
        const { container, unmount } = renderWithConfig(<CyberEffects />, {
            "widget.cyber.title_glitch": true,
            "widget.cyber.grid_background": true,
        });
        expect(container.querySelector(".rin-cyber-grid-bg")).not.toBeNull();
        expect(document.documentElement.classList.contains("rin-cyber-glitch")).toBe(true);
        unmount();
        expect(document.documentElement.classList.contains("rin-cyber-glitch")).toBe(false);
    });
});

describe("WaveFooter", () => {
    it("renders nothing while disabled", () => {
        const { container } = renderWithConfig(<WaveFooter />, {});
        expect(container.querySelector("svg")).toBeNull();
    });

    it("renders two wave layers when enabled", () => {
        const { container } = renderWithConfig(<WaveFooter />, { "widget.wave_footer.enabled": true });
        expect(container.querySelectorAll("svg")).toHaveLength(2);
    });
});

describe("Hitokoto", () => {
    it("renders nothing while disabled", () => {
        renderWithConfig(<Hitokoto />, {});
        expect(screen.queryByTestId("hitokoto")).toBeNull();
    });

    it("types the configured quote character by character", async () => {
        renderWithConfig(<Hitokoto />, {
            "widget.hitokoto.enabled": true,
            "widget.hitokoto.quotes": [" Testing "],
        });
        await waitFor(
            () => {
                expect(screen.getByTestId("hitokoto").textContent).toContain("Testing");
            },
            { timeout: 2000 },
        );
    });
});

describe("Preloader", () => {
    it("renders nothing when disabled", () => {
        const { container } = renderWithConfig(<Preloader />, {});
        expect(container.querySelector(".rin-preloader")).toBeNull();
    });

    it("shows the overlay once per session and leaves after load", async () => {
        const { container } = renderWithConfig(<Preloader />, { "widget.preloader.enabled": true });
        expect(container.querySelector(".rin-preloader")).not.toBeNull();
        // 第二次挂载（同 session）不再显示
        const { container: second } = renderWithConfig(<Preloader />, { "widget.preloader.enabled": true });
        expect(second.querySelector(".rin-preloader")).toBeNull();
    });

    it("never leaves the overlay stuck when the effect re-runs before leave", async () => {
        // 配置异步加载会让 enabled 从 false 变 true，StrictMode 又会让 effect 双跑。
        // 旧实现：effect 开头写 session key，重入时新 effect 直接 return，
        // 而 cleanup 已把兜底 timer 清掉 → 遮罩永远卡在 showing（实测卡死）。
        vi.useFakeTimers();
        try {
            // StrictMode 是真实开发环境里的「双跑」来源：effect 会跑 → cleanup → 再跑。
            // 第二次跑时 session key 已写、旧代码的 cleanup 又清了兜底 timer，
            // 遮罩就会永远卡在 showing。这正是需要锁住的行为。
            const { container } = render(
                <StrictMode>
                    <ClientConfigContext.Provider value={new ConfigWrapper({ "widget.preloader.enabled": true }, defaultClientConfig)}>
                        <Preloader />
                    </ClientConfigContext.Provider>
                </StrictMode>,
            );
            expect(container.querySelector(".rin-preloader")).not.toBeNull();

            // 即便 load 事件不触发，兜底定时器也必须让遮罩退场。
            // 分两步断言：先在「已触发 leave、淡出动画还没结束」时检查 leaving，
            // 再等淡出结束检查完全消失。一次性推进会把 480ms 的隐藏定时器也跑掉。
            await act(async () => { vi.advanceTimersByTime(600); });
            expect(container.querySelector(".rin-preloader-leaving")).not.toBeNull();
            await act(async () => { vi.advanceTimersByTime(600); });
            expect(container.querySelector(".rin-preloader")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });
});

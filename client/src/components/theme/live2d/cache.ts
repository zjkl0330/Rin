// Live2D 模型源探测与本地缓存（Service Worker 预缓存）。
import { BUILTIN_MODELS, MODEL_FILES_BY_NAME } from "./models";

//
// 保存模块加载时的"原生 fetch"引用。组件挂载/切换时会短暂替换 window.fetch（为模型
// 文件做流式进度统计 + Layout 注入，见 live2d-widget.tsx 的 installProgressTracker）。
// 后台预下载模型缓存若走被替换的 window.fetch，会把预下载字节也计进页面进度，导致
// 进度虚高到 100%+ 且预下载与当前绘制模型抢带宽（表现为"卡在100%但不渲染"）。
// 因此预缓存一律走原生 fetch，完全旁路进度统计与 Layout 注入。
const nativeFetch: typeof fetch = window.fetch;

// 模型根地址候选（按模型区分）。生产环境：
//  - BCSZ1.1 已随博客打包成静态资源（见 vite.config.ts rinLive2dBundledModel），
//    优先本域本地根，毫秒级、摆脱远端 CDN；
//  - furina 的 moc3 单文件约 95MB 超 Cloudflare Pages 25MiB 限制，无法打包，只能走
//    远端模型源。优先 dpdns 加速镜像（国内直连更快、更稳），失败回退 github.io 直连。
// dev 环境统一由 vite.config.ts 的 rinLive2dLocalCdn 中间件提供本地模型文件。
export const REMOTE_CDN_CANDIDATES = [
  "https://raw-githubusercontent-com-gh.zjkl0330.dpdns.org/827802685/Live2D/refs/heads/master/",
  "https://827802685.github.io/Live2D/",
] as const;

// 各模型优先使用的本地/打包根（非远端 CDN）。BCSZ1.1 生产走随博客分发的打包根。
// 仅对内置模型生效；自定义模型不看根，直接用其配置 url（在 switchModel/prefetch 中另行处理）。
export function bundledRootFor(name: string): string {
  // furina-mini 走远端根（与引擎同仓库，全套仅约 2.4MB），本地不打包
  if (name === "furina-mini") return "";
  if (import.meta.env.DEV) return `${location.origin}/rin-live2d-cdn/`;
  return `${location.origin}/live2d-bundled/`;
}

// 模型资源目录。目录结构并不统一，拼错就是 404、缓存永远空：
//   - furina-mini（自研渲染器）：<root>furina-mini/ 直接放 js/bin/webp，没有 index.json；
//   - Cubism 模型：<root>model/<name>/ 下按 index.json 的 FileReferences 组织。
// 预取、预缓存、渲染器加载三处必须共用这一个口径，否则「明明缓存过、切换还在下载」。
export function modelAssetBase(root: string, name: string): string {
  if (name === "furina-mini") return `${root}furina-mini/`;
  return `${root}model/${name}/`;
}

// 上次探测成功的根记在 sessionStorage：同一会话里再切模型不必从头试一遍候选，
// 少一次（远端甚至要超时的）探测往返。命中记忆根后仍会做一次轻量校验，失败照旧回退。
const ROOT_MEMO_PREFIX = "rin.live2d.root:";

function readRootMemo(name: string): string {
  try {
    return sessionStorage.getItem(ROOT_MEMO_PREFIX + name) ?? "";
  } catch {
    return "";
  }
}

function writeRootMemo(name: string, root: string): void {
  try {
    sessionStorage.setItem(ROOT_MEMO_PREFIX + name, root);
  } catch {
    // ignore
  }
}

// 给渲染分支用的公开接口：furina-mini 的脚本加载要按"上次成功的根"优先，
// 否则每次切到它都会先撞一遍 dpdns 镜像的 MIME 错误。
export const readMemoizedRoot = readRootMemo;
export const rememberRoot = writeRootMemo;

// 单个根的可用性探测：furina-mini 的根下没有 model_list.json（自研渲染器的资源
// 平铺在 furina-mini/ 目录里），所以按"该根是否真有目标模型"来探，而不是按清单文件。
async function probeRoot(root: string, name: string): Promise<boolean> {
  const url =
    name === "furina-mini" ? `${root}furina-mini/furina-mini.js` : `${root}model_list.json`;
  try {
    const res = await fetch(url, { mode: "cors" });
    return res.ok;
  } catch {
    return false;
  }
}

// 探测可用的模型源：按目标模型组装候选根（本地/打包根优先），
// 依次请求探测 URL，返回第一个可用的根地址。
export async function pickCdnRoot(name: string): Promise<string> {
  const localRoot = bundledRootFor(name);
  const candidates = [...(localRoot ? [localRoot] : []), ...REMOTE_CDN_CANDIDATES];
  // 记忆根提到候选首位（仍要探测：换个网络环境它可能就挂了）
  const memo = readRootMemo(name);
  const ordered =
    memo && candidates.includes(memo) ? [memo, ...candidates.filter((r) => r !== memo)] : candidates;
  for (const root of ordered) {
    if (await probeRoot(root, name)) {
      writeRootMemo(name, root);
      return root;
    }
  }
  return ordered[0];
}

// 探测到模型根地址后立即并行预取当前模型的核心文件（moc3/贴图），
// 不等插件脚本加载；插件稍后请求同一 URL 时命中浏览器/SW 缓存。
export function prefetchModel(cdnRoot: string, name: string) {
  const base = modelAssetBase(cdnRoot, name);
  const files = MODEL_FILES_BY_NAME[name] ?? [];
  for (const file of files) {
    fetch(`${base}${file}`, { mode: "cors" }).catch(() => {
      // 预取失败不阻塞主流程
    });
  }
}

// 从模型的 index.json（FileReferences）递归收集全部资源文件的相对路径。
function collectModelFiles(manifest: unknown, out: Set<string>): void {
  if (Array.isArray(manifest)) {
    for (const item of manifest) collectModelFiles(item, out);
    return;
  }
  if (manifest && typeof manifest === "object") {
    for (const value of Object.values(manifest as Record<string, unknown>)) {
      collectModelFiles(value, out);
    }
    return;
  }
  if (
    typeof manifest === "string" &&
    /\.(moc3|model3\.json|png|jpe?g|webp|motion3\.json|physics3\.json|cdi3\.json|exp3\.json|wav|mp3)$/i.test(manifest)
  ) {
    out.add(manifest);
  }
}

// 收集某个模型**全部**需要缓存的 URL（绝对地址）。
// furina-mini 没有 index.json（自研渲染器的资源是固定四件套），直接用 MODEL_FILES_BY_NAME；
// 其余 Cubism 模型必须拉 index.json 递归收集——只按固定表缓存会漏掉 motion3/physics3/exp3
// 与 index.json 自身，切换时渲染器仍要联网取这些文件，表现为"每次切换都先下载一下"。
async function collectModelUrls(base: string, name: string): Promise<string[]> {
  const listed = MODEL_FILES_BY_NAME[name];
  if (name === "furina-mini") {
    return (listed ?? []).map((f) => `${base}${f}`);
  }
  try {
    const index = await nativeFetch(`${base}index.json`, { mode: "cors" });
    if (index.ok) {
      const manifest = (await index.json()) as { FileReferences?: unknown };
      const files = new Set<string>();
      collectModelFiles(manifest, files);
      // index.json 本身也会被渲染器再次请求，必须一起缓存
      files.add("index.json");
      if (files.size > 1) {
        return [...files].map((f) => (/^https?:/i.test(f) ? f : `${base}${f}`));
      }
    }
  } catch {
    // 取不到清单（离线/跨域失败）：退回固定表
  }
  return (listed ?? []).map((f) => `${base}${f}`);
}

// 通过 Service Worker 的 CACHE_LIVE2D 消息，把一批 URL 下载并写入本地 Cache Storage。
//
// 为什么不能只看 controller：首次访问时页面往往还没有被 SW 接管（注册/激活在首屏之后），
// controller 为 null，此前这里直接跳过 → 预缓存一次都没执行（线上实测 36s 后
// Cache Storage 仍只有 1 条）。现在依次尝试：controller → registration.active（未被
// 控制也能收消息）→ 页面自己 fetch 后直写缓存桶（与 SW 同名，读得到）。
async function sendCacheMessage(urls: string[]): Promise<void> {
  try {
    const ctrl = navigator.serviceWorker?.controller;
    if (ctrl) {
      ctrl.postMessage({ type: "CACHE_LIVE2D", urls });
      return;
    }
    // ready 在"没有注册"时会永远挂起，先确认确实有注册再等
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    if (regs && regs.length > 0) {
      const reg = await navigator.serviceWorker.ready;
      const sw = reg?.active ?? reg?.waiting ?? reg?.installing;
      if (sw) {
        sw.postMessage({ type: "CACHE_LIVE2D", urls });
        return;
      }
    }
  } catch {
    // SW 不可用则走下面的直写
  }
  try {
    const cache = await caches.open(LIVE2D_CACHE_NAME);
    await Promise.allSettled(
      urls.map(async (u) => {
        const res = await nativeFetch(u, { mode: "cors" });
        if (res.ok) await cache.put(u, res.clone());
      }),
    );
  } catch {
    // 无 Cache Storage：放弃预缓存，不影响主流程
  }
}

// 对给定模型整目录预缓存：拉取 index.json → 收集全部文件 → 写入本地缓存。
// 不依赖固定文件表，能覆盖贴图/动作/物理/口型等所有资源，真正做到"下载一次不再重下"。
// 一律走 nativeFetch：旁路进度统计与 Layout 注入，避免干扰当前模型的下载进度。
//
// furina-mini 没有 index.json（自研渲染器的资源是固定四件套），走 MODEL_FILES_BY_NAME；
// 其余模型按 index.json 递归收集。两者最终都归一成 URL 列表写进 Cache Storage。
async function precacheModel(cdnRoot: string, name: string): Promise<void> {
  try {
    const base = modelAssetBase(cdnRoot, name);
    const urls = await collectModelUrls(base, name);
    if (urls.length === 0) return;
    await sendCacheMessage(urls);
  } catch {
    // 预缓存失败不影响主流程
  }
}

// 目标模型是否**整目录**已在本地缓存里。
//
// 用途：切换模型前先判断"这一下是本地热切换还是真要联网下载"，据此决定显示
// "切换中"还是"正在下载 x%"——否则命中缓存时进度条仍按 fetch 字节从 0 涨到 100%，
// 观感就是"每次切模型都先下载一遍"（实际上字节是从 Cache Storage 读的）。
//
// 判定必须按完整清单：只看几个核心文件会把"只缓存了 moc3+贴图"的模型误判成已缓存。
// 清单本身走 nativeFetch（SW 的 cache-first 会直接返回缓存里的 index.json，几乎零成本）。
// 结果记在内存里（同一会话内重复切同一模型不必再查）：清空缓存时由 clearModelCache 失效。
const cachedFullMemo = new Map<string, { at: number; full: boolean }>();
const CACHED_FULL_TTL = 5 * 60 * 1000;

export async function isModelFullyCached(name: string, cdnRoot?: string): Promise<boolean> {
  const memo = cachedFullMemo.get(name);
  if (memo && Date.now() - memo.at < CACHED_FULL_TTL) return memo.full;
  let full = false;
  try {
    const root = cdnRoot ?? (await pickCdnRoot(name));
    const urls = await collectModelUrls(modelAssetBase(root, name), name);
    if (urls.length > 0) {
      const cache = await caches.open(LIVE2D_CACHE_NAME);
      const hits = await Promise.all(urls.map((u) => cache.match(u, { ignoreVary: true })));
      full = hits.every(Boolean);
    }
  } catch {
    // 无 Cache Storage（隐私模式等）：视为未缓存，走下载进度
    full = false;
  }
  cachedFullMemo.set(name, { at: Date.now(), full });
  return full;
}

// 首次进入后，后台并行预缓存内置模型（furina 远端 + BCSZ1.1 本地）。
// 每个模型用各自最优根（BCSZ→打包根，furina→远端 CDN）。
// 清单只维护在 live2d/models.ts 的 BUILTIN_MODELS，此处不再重复枚举。
// includeRemoteLarge=false（widget.live2d.preload 关闭时）：跳过只能走远端的大模型
// （furina moc3 约 95MB），不提前占用带宽与磁盘；当前展示模型仍会正常下载。
export function precacheAllModels(includeRemoteLarge = true): void {
  // furina-mini 虽然也走远端根，但整套仅 2.4MB 且是默认模型：关掉 preload 时也照常
  // 预缓存，否则它永远只有浏览器 HTTP 缓存、Cache Storage 里是空的，
  // "是否已缓存"判定为否，切回它时遮罩会退回"下载"形态。
  const jobs = BUILTIN_MODELS.filter(
    (name) => includeRemoteLarge || name === "furina-mini" || bundledRootFor(name) !== "",
  ).map(async (name) => {
    try {
      const root = await pickCdnRoot(name);
      await precacheModel(root, name);
    } catch {
      // ignore
    }
  });
  void Promise.allSettled(jobs);
}

// ---- 缓存状态（设置页展示 / 手动管理） ----
// 与 sw.js 的 CACHE_NAME 保持一致：版本不同则读写的是两个桶，页面看不到 SW 写的内容。
export const LIVE2D_CACHE_NAME = "rin-live2d-v4";

export type ModelCacheStats = {
  // 缓存条目数（每个文件一条）
  count: number;
  // 命中 MIME 里的 Content-Length 求和，拿不到长度时按 0 计
  bytes: number;
  // 分模型的条目数，用于界面判断"哪个模型已经下好了"
  perModel: Record<string, number>;
};

// 统计当前 Cache Storage 里的模型缓存。页面与 SW 同源，直接读即可。
export async function getModelCacheStats(): Promise<ModelCacheStats> {
  const out: ModelCacheStats = { count: 0, bytes: 0, perModel: {} };
  try {
    const cache = await caches.open(LIVE2D_CACHE_NAME);
    const requests = await cache.keys();
    out.count = requests.length;
    for (const req of requests) {
      const url = req.url;
      const model = BUILTIN_MODELS.find((n) => url.includes(modelAssetBase("", n)));
      if (model) out.perModel[model] = (out.perModel[model] ?? 0) + 1;
      const res = await cache.match(req, { ignoreVary: true });
      const len = Number(res?.headers.get("content-length") ?? 0);
      if (Number.isFinite(len)) out.bytes += len;
    }
  } catch {
    // 无 Cache Storage（隐私模式等）：返回全零
  }
  return out;
}

// 清空模型缓存（含历史版本桶），下次进入会重新下载。
export async function clearModelCache(): Promise<void> {
  cachedFullMemo.clear();
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith("rin-live2d")).map((k) => caches.delete(k)),
    );
  } catch {
    // ignore
  }
}

// 手动"立即下载全部模型"：无视 preload 开关，强制把范围兜底打开。
export function downloadAllModels(): void {
  // 手动下载会改变缓存状态，先让"是否已完整缓存"的记忆失效，下次切换重新判定
  cachedFullMemo.clear();
  precacheAllModels(true);
}

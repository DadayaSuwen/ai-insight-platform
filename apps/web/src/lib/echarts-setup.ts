/**
 * echarts-setup.ts — 扩展包按需加载 (M4)
 *
 * 设计原则:
 *   - echarts 全量包已经常驻 bundle (提供 18 类核心 series)
 *   - 3D 系列需要 echarts-gl (≈250KB)
 *   - liquidFill / wordCloud 需要各自扩展包 (≈25KB / 12KB)
 *   - 用 dynamic import + module-level Promise cache,首次遇到对应 type 时再加载,
 *     React 18 strict mode 重复 useEffect 不会触发多次 import
 *
 * [M5-Patch] 地图资源加载已迁出至 `echarts-map-loader.ts`,本文件只负责扩展包。
 */

import * as echarts from "echarts";

// ============================================================
// echarts-gl (3D 系列: bar3D / scatter3D / surface3D / map3D / line3D / points3D / lines3D)
// echarts-gl 通过 install(echarts) 把 3D chart 类型注册进 echarts 全局
// ============================================================
let glPromise: Promise<void> | null = null;

export function ensureEchartsGL(): Promise<void> {
  if (glPromise) return glPromise;
  glPromise = (async () => {
    try {
      const gl = await import("echarts-gl");
      // echarts-gl v2 export { install }
      const install = (gl as unknown as { install?: (e: typeof echarts) => void }).install
        ?? (gl as unknown as { default?: { install?: (e: typeof echarts) => void } }).default?.install;
      if (typeof install === "function") {
        install(echarts);
      } else {
        console.warn("[echarts-setup] echarts-gl install function not found");
      }
    } catch (err) {
      console.error("[echarts-setup] echarts-gl import failed:", err);
      throw err;
    }
  })();
  return glPromise;
}

// ============================================================
// echarts-liquidfill (水球图)
// import 'echarts-liquidfill' 会自动调用 echarts.use(...) 注册 series
// ============================================================
let liquidFillPromise: Promise<void> | null = null;

export function ensureLiquidFill(): Promise<void> {
  if (liquidFillPromise) return liquidFillPromise;
  liquidFillPromise = (async () => {
    try {
      await import("echarts-liquidfill");
    } catch (err) {
      console.error("[echarts-setup] echarts-liquidfill import failed:", err);
      throw err;
    }
  })();
  return liquidFillPromise;
}

// ============================================================
// echarts-wordcloud (词云)
// ============================================================
let wordCloudPromise: Promise<void> | null = null;

export function ensureWordCloud(): Promise<void> {
  if (wordCloudPromise) return wordCloudPromise;
  wordCloudPromise = (async () => {
    try {
      await import("echarts-wordcloud");
    } catch (err) {
      console.error("[echarts-setup] echarts-wordcloud import failed:", err);
      throw err;
    }
  })();
  return wordCloudPromise;
}

// ============================================================
// series type → loader 路由表
// ============================================================
export type LoaderFn = () => Promise<void>;

const LOADER_MAP: Record<string, LoaderFn> = {
  liquidFill: ensureLiquidFill,
  wordCloud: ensureWordCloud,
};

/** 3D 系列统一走 echarts-gl */
const GL_TYPES = new Set([
  "bar3D",
  "scatter3D",
  "surface3D",
  "map3D",
  "line3D",
  "points3D",
  "lines3D",
]);

/**
 * 从 EChartsOption 中提取 series.type 列表
 * 用于 DynamicChart 检测是否需要 dynamic import 扩展包
 */
export function collectSeriesTypes(option: unknown): string[] {
  const types = new Set<string>();
  const seriesList = (option as { series?: unknown[] })?.series;
  if (!Array.isArray(seriesList)) return [];
  for (const s of seriesList) {
    const t = (s as { type?: string })?.type;
    if (typeof t === "string") types.add(t);
  }
  return [...types];
}

/** [M12] map 系列兜底
 *  map 已有 china GeoJSON (ensureChinaMap),不再 rewrite;
 *  map3D 仍无 GeoJSON 资源,降级 bar
 */
export function rewriteMap3DToBar(option: unknown): void {
  const seriesList = (option as { series?: unknown[] })?.series;
  if (!Array.isArray(seriesList)) return;
  for (const s of seriesList) {
    const t = (s as { type?: string })?.type;
    if (t === "map3D") {
      (s as { type: string }).type = "bar";
    }
  }
}

// ============================================================
// 地图加载已迁至 `echarts-map-loader.ts` (M5-Patch)
// 历史: M12 引入 ensureChinaMap() + /public/china.json,本次重构为通用 ensureMap(mapType)
//   + /src/assets/maps/{mapType}.json dynamic import,Vite 自动 code split
// ============================================================

/**
 * 提取 option 中需要异步加载的扩展包 loader
 * 返回 Promise 数组 (Promise.all 等待所有 loader 完成)
 */
export function getRequiredLoaders(types: string[]): Promise<void>[] {
  const loaders = new Set<LoaderFn>();
  for (const t of types) {
    if (GL_TYPES.has(t)) {
      loaders.add(ensureEchartsGL);
    }
    const direct = LOADER_MAP[t];
    if (direct) loaders.add(direct);
  }
  return [...loaders].map((fn) => fn());
}
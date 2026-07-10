/**
 * echarts-map-loader.ts — 地图资源按需动态加载 (M5-Patch)
 *
 * 设计原则:
 *   - Vite dynamic import 自动 code split,地图 GeoJSON 不进入首屏 bundle
 *   - 用户首次提到 "世界地图"/"美国地图"/"广东省地图" 时,才下载对应 chunk
 *   - 浏览器强缓存 chunk,后续使用同地图 0 字节下载
 *   - module-level Promise cache 防并发重复 import
 *   - 加载失败 → 清理缓存 + 抛错,上层 ChartErrorBoundary 兜底表格
 *
 * 用法:
 *   import { ensureMap } from "@/lib/echarts-map-loader";
 *   try {
 *     await ensureMap("world");  // 首次:fetch /assets/world-xxxxx.json → registerMap
 *   } catch (err) {
 *     // 上层 Boundary 接住,渲染 fallbackRows 表格 + "地图资源加载失败" 提示
 *   }
 *
 * 资源目录: apps/web/src/assets/maps/{mapType}.json
 *   - china.json (DataV.GeoAtlas, ~570KB / ~150KB gzip,Apache-2.0)
 *   - world.json / usa.json / prov-*.json: 后续按需追加
 */

import * as echarts from "echarts";

// ============================================================
// [M5-Patch] 静态 loader 映射 — 使用 `?url` import 强制 emit 独立 chunk
// 关键: Vite 默认会把小 JSON inline 进 JS 模块;这里用 `?url` 让 Vite 把
//   china.json (570KB) 当成独立 asset emit 到 dist/assets/,首屏不下载。
//   必须用静态 import 路径 (不能用 import(`...${mapType}.json`) 模板
//   — Vite 无法解析运行时变量,会跳过 emit,生产环境 404)
// ============================================================
import chinaUrl from "../assets/maps/china.json?url";
import worldUrl from "../assets/maps/world.json?url";
import usaUrl from "../assets/maps/usa.json?url";

type GeoJsonType = Parameters<typeof echarts.registerMap>[1];

const GEO_URLS: Record<string, string> = {
  china: chinaUrl,
  world: worldUrl,
  usa: usaUrl,
  // 后续按需追加: prov-guangdong, prov-beijing, ...
};

// ============================================================
// loadingPromises 缓存 — 防并发重复 fetch
// ============================================================
const loadingPromises: Record<string, Promise<void> | undefined> = {};
const registeredMaps = new Set<string>();

/**
 * [M5-Patch] 按需加载地图 GeoJSON 并注册到 ECharts
 *
 * @param mapType 地图类型标识 (如 'china' / 'world' / 'usa' / 'prov-guangdong')
 * @returns Promise<void> resolve 表示 registerMap 完成
 * @throws Error 当地图类型未配置或 fetch 失败时
 */
export async function ensureMap(mapType: string = "china"): Promise<void> {
  // 1. 已注册 → 立即跳过
  if (registeredMaps.has(mapType) || echarts.getMap(mapType)) return;

  // 2. 正在加载 → 复用 Promise 防并发
  const pending = loadingPromises[mapType];
  if (pending) return pending;

  // 3. 查静态表 → 无匹配 → 抛错 (Boundary 兜底表格)
  const url = GEO_URLS[mapType];
  if (!url) {
    throw new Error(`地图资源 ${mapType} 未配置 (在 GEO_URLS 中无对应条目)`);
  }

  // 4. fetch GeoJSON → registerMap
  const promise: Promise<void> = fetch(url)
    .then((resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    })
    .then((geoJson: unknown) => {
      // [Sprint 5.7+] 检测空占位 GeoJSON — 抛错让 Boundary 兜底表格
      const geo = geoJson as Record<string, unknown>;
      if (
        geo.type === "FeatureCollection" &&
        Array.isArray(geo.features) &&
        geo.features.length === 0
      ) {
        throw new Error(`地图 ${mapType} 是空占位文件，GeoJSON 数据待补充`);
      }
      echarts.registerMap(mapType, geoJson as GeoJsonType);
      registeredMaps.add(mapType);
    })
    .catch((err: unknown) => {
      delete loadingPromises[mapType];
      console.error(`[MapLoader] 加载地图 ${mapType} 失败:`, err);
      throw new Error(`地图资源 ${mapType} 加载失败`);
    });

  loadingPromises[mapType] = promise;
  return promise;
}

/**
 * 当前已注册的地图列表 (用于前端展示/调试)
 */
export function listRegisteredMaps(): string[] {
  return [...registeredMaps];
}

/** 检查某地图是否已注册 (供父组件短路判断) */
export function isMapRegistered(mapType: string): boolean {
  return registeredMaps.has(mapType) || !!echarts.getMap?.(mapType);
}

/** 当前所有可用的地图类型标识 (供 Schema 提示/LLM 引导) */
export function listAvailableMapTypes(): string[] {
  return Object.keys(GEO_URLS);
}
import ReactECharts from "echarts-for-react";
import type { CSSProperties } from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  collectSeriesTypes,
  getRequiredLoaders,
  rewriteMap3DToBar,
} from "../../../lib/echarts-setup";
import { ensureMap } from "../../../lib/echarts-map-loader";

interface DynamicChartProps {
  /** EChartsOption — ChartAgent 直出 (M3) 或 ChartHelper 模板降级 */
  option: Record<string, unknown>;
  style?: CSSProperties;
  /** 默认 400,3D / 复杂图需要更高画布 */
  height?: number;
  /** 扩展包加载失败 / option 畸形 / ECharts 内部异常时回调 */
  onError?: (error: Error) => void;
  /** [M5-Patch] 地图类型标识 (如 'china' / 'world' / 'usa' / 'prov-guangdong')。
   *  来自后端 intent.mapType,缺省 'china'。
   */
  mapType?: string;
  /** [M5-Patch] 加载态提示文案 (默认 "正在加载图表资源...") */
  loadingMessage?: string;
  /** [M5-Patch] 启用 ResizeObserver 响应式 (默认 true) */
  enableResize?: boolean;
}

/**
 * 父组件通过 ref 拿到本组件后,可调 exportPng() / getEchartsInstance()
 */
export interface DynamicChartHandle {
  /** 导出当前图表为 PNG dataURL (M5, GUARD-5b) */
  exportPng(): string | null;
  /** 直接获取底层 echarts instance (供高级用法,如 resizing) */
  getEchartsInstance(): unknown;
}

/**
 * DynamicChart — 透传 EChartsOption (M4 + M5 + M5-Patch):
 *   - M4: useEffect dynamic import 扩展包 (echarts-gl / liquidfill / wordcloud)
 *   - M4: MutationObserver 监听 dark mode 变化,实时切换 theme
 *   - M4: [GUARD-5a] dark 切换时通过 key prop 强制重建,清理 WebGL context 残留
 *   - M5: forwardRef + useImperativeHandle 暴露 exportPng() 给父组件 (GUARD-5b)
 *   - M5-Patch: 加载态 (loadError / isLoading) + ResizeObserver 响应式 + ensureMap 按需加载地图
 *
 * 注: echarts-for-react 内部在 theme 变化时会自动 dispose → init → setOption,
 * 但 WebGL canvas (3D 系列) 不会被 echarts.dispose() 完整清理,
 * 因此 React 层通过 key 强制卸载/重建整组件,确保彻底清理 GPU 资源。
 */
const DynamicChart = forwardRef<DynamicChartHandle, DynamicChartProps>(
  function DynamicChart(
    {
      option,
      style,
      height,
      onError,
      mapType = "china",
      loadingMessage,
      enableResize = true,
    },
    ref,
  ) {
    // [M13-V2] GUARD-V2-3: 高度硬编码 380px, 防止父容器塌陷导致静默空画布
    const CHART_HEIGHT = 380;
    const finalHeight = height ?? CHART_HEIGHT;
    const [isDark, setIsDark] = useState(() =>
      document.documentElement.classList.contains("dark"),
    );
    const [loadError, setLoadError] = useState<Error | null>(null);
    // [M5-Patch] 加载态: true 直到扩展包 + 地图资源就绪
    const [isLoading, setIsLoading] = useState(true);
    // GUARD-5a: 强制 key 重建组件 (处理 WebGL canvas 残留)
    const [rebuildKey, setRebuildKey] = useState(0);
    const echartsInstanceRef = useRef<unknown>(null);
    // [M5-Patch] ResizeObserver 容器 ref
    const containerRef = useRef<HTMLDivElement>(null);

    // ─── 1. dark mode 监听 ───
    useEffect(() => {
      const obs = new MutationObserver(() => {
        const next = document.documentElement.classList.contains("dark");
        setIsDark((prev) => {
          if (prev !== next) {
            // GUARD-5a: dark 切换时强制 rebuild
            setRebuildKey((k) => k + 1);
          }
          return next;
        });
      });
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => obs.disconnect();
    }, []);

    // ─── 2. 扩展包 + 地图资源 按需加载 (M5-Patch 升级) ───
    useEffect(() => {
      setIsLoading(true);
      setLoadError(null);

      const types = collectSeriesTypes(option);
      const promises: Promise<void>[] = getRequiredLoaders(types);
      // [M5-Patch] 检测到 'map' type → await ensureMap(mapType) (Vite dynamic import)
      if (types.includes("map")) promises.push(ensureMap(mapType));

      if (promises.length === 0) {
        setIsLoading(false);
        return;
      }

      Promise.all(promises)
        .then(() => setIsLoading(false))
        .catch((err) => {
          const e = err instanceof Error ? err : new Error(String(err));
          setLoadError(e);
          setIsLoading(false);
          onError?.(e);
        });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [option, mapType]);

    // ─── 2.5 [M12] 前端兜底: 只 rewrite map3D (map 已有 china GeoJSON)
    rewriteMap3DToBar(option);

    // ─── 2.6 [M5-Patch] ResizeObserver — 监听容器尺寸变化,触发 instance.resize() ───
    useEffect(() => {
      if (!enableResize) return;
      const el = containerRef.current;
      if (!el) return;
      const obs = new ResizeObserver(() => {
        const inst = echartsInstanceRef.current as
          | { resize?: () => void }
          | null;
        inst?.resize?.();
      });
      obs.observe(el);
      return () => obs.disconnect();
    }, [enableResize, isLoading]);

    // ─── 3. 暴露 exportPng() 给父组件 (M5 / GUARD-5b) ───
    useImperativeHandle(
      ref,
      (): DynamicChartHandle => ({
        exportPng() {
          const inst = echartsInstanceRef.current as
            | { getDataURL?: (opts: object) => string }
            | null;
          if (!inst || typeof inst.getDataURL !== "function") return null;
          // GUARD-5b: pixelRatio:2 高清 + backgroundColor:'#fff' 防 WebGL 黑底
          // type:'png' 触发 PNG 编码
          return inst.getDataURL({
            type: "png",
            pixelRatio: 2,
            backgroundColor: "#fff",
          });
        },
        getEchartsInstance() {
          return echartsInstanceRef.current;
        },
      }),
      [],
    );

    // ─── 4. 空 option 兜底 ───
    if (!option || Object.keys(option).length === 0) {
      return (
        <div
          className="flex items-center justify-center rounded-xl border p-6 text-sm"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            background: "var(--bg-primary)",
            minHeight: height,
          }}
        >
          图表数据为空
        </div>
      );
    }

    // ─── 5. 加载失败兜底 (ErrorBoundary 兜底渲染失败) ───
    if (loadError) {
      console.warn("[DynamicChart] extension/map load failed:", loadError);
    }

    // ─── 5.5 [M5-Patch] 加载态 UI (扩展包/地图资源加载期间显示) ───
    if (isLoading) {
      return (
        <div
          ref={containerRef}
          className="flex items-center justify-center rounded-xl border p-6 text-sm"
          style={{
            height: finalHeight,
            minHeight: CHART_HEIGHT,
            borderColor: "var(--border)",
            color: "var(--text-muted)",
            background: "var(--bg-primary)",
          }}
        >
          {loadingMessage ?? "正在加载图表资源..."}
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border p-2"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-primary)",
        }}
      >
        <ReactECharts
          key={rebuildKey}
          option={option}
          notMerge={true}
          lazyUpdate={true}
          theme={isDark ? "dark" : "light"}
          style={{ height: finalHeight, minHeight: CHART_HEIGHT, width: "100%", ...style }}
          opts={{ renderer: "canvas" }}
          onChartReady={(inst) => {
            echartsInstanceRef.current = inst;
            // [M13-V2] GUARD-V2-3: Canvas 像素探针 — 500ms 后检查是否渲染出非空内容
            setTimeout(() => {
              try {
                const dom = (inst as { getDom?: () => HTMLElement | null }).getDom?.();
                const canvas = dom?.querySelector("canvas") as HTMLCanvasElement | null;
                if (!canvas) return;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                const w = canvas.width;
                const h = canvas.height;
                if (w === 0 || h === 0) {
                  onError?.(new Error(`[GUARD-V2-3] Canvas 尺寸为 0 (${w}x${h})`));
                  return;
                }
                const data = ctx.getImageData(0, 0, w, h).data;
                let nonTransparent = 0;
                const total = data.length / 4;
                // 抽样: 每 100 像素检测 alpha > 0
                for (let i = 3; i < data.length; i += 400) {
                  if (data[i] > 0) nonTransparent++;
                }
                const sampleSize = Math.max(1, Math.ceil(total / 100));
                const ratio = nonTransparent / sampleSize;
                if (ratio < 0.05) {
                  const blankPct = ((1 - ratio) * 100).toFixed(1);
                  onError?.(
                    new Error(
                      `[GUARD-V2-3] Canvas 空白率 ${blankPct}% ≥ 95%,图表渲染失败`,
                    ),
                  );
                }
              } catch (e) {
                // 探针自身异常不抛出,只 warn
                console.warn("[GUARD-V2-3] pixel probe failed:", e);
              }
            }, 500);
          }}
        />
      </div>
    );
  },
);

export default DynamicChart;
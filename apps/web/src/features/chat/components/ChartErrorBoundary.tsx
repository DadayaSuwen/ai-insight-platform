import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { CollapsibleTable } from "./CollapsibleTable";

interface ChartErrorBoundaryProps {
  children: ReactNode;
  /** 错误时回调,可用于上报 / toast */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** 切换为表格视图的回调 (兼容保留, V2 不再使用) */
  onSwitchToTable?: () => void;
  /** [M13-V2] GUARD-V2-3: 直接渲染表格(无需点击切换) */
  fallbackRows?: Array<Record<string, unknown>>;
  /** [Sprint 5.7] 物理名 → 中文名映射表,透传给 fallback 表格 */
  fieldMapping?: Record<string, string>;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ChartErrorBoundary — DynamicChart 的 React Error Boundary
 *
 * [GUARD-2a] 包裹 DynamicChart 防止 ECharts 渲染异常导致整聊天页面白屏
 * [GUARD-2b] 捕获到异常时,显示友好 UI:
 *   - 错误标题 + 简短描述
 *   - 重试按钮 (重置 error 状态,DynamicChart 重新挂载)
 *   - 切换为表格视图按钮 (调 onSwitchToTable)
 * [M13-V2] GUARD-V2-3: 若传 fallbackRows,直接渲染表格兜底(不再需要用户点击)
 *
 * 注意: ErrorBoundary 必须用 class 组件实现 (React 18 限制,hook 不能 catch render error)
 */
export class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  state: ChartErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // GUARD-2a: 阻止异常继续冒泡导致聊天页面白屏
    console.error("[GUARD-2a] ChartErrorBoundary caught:", error, info);
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // [M13-V2] GUARD-V2-3: 有 fallbackRows 时直接渲染表格 (Canvas 像素探针触发后)
      if (this.props.fallbackRows && this.props.fallbackRows.length > 0) {
        return <CollapsibleTable rows={this.props.fallbackRows} fieldMapping={this.props.fieldMapping} />;
      }
      // GUARD-2b: 友好兜底 UI,严禁白屏
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border p-6 text-sm border-default text-muted bg-surface"
          style={{ minHeight: 200 }}
        >
          <div className="text-base font-medium text-default">
            {/* [M6-L4] 文案微调: 更明确指出数据问题,引导用户切表格 */}
            当前图表数据异常,渲染失败
          </div>
          <div className="text-xs">
            {this.state.error?.message ?? "未知错误"}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={this.reset}
            >
              重试
            </Button>
            {this.props.onSwitchToTable && (
              <Button
                size="sm"
                variant="outline"
                onClick={this.props.onSwitchToTable}
              >
                切换为表格视图
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChartErrorBoundary;
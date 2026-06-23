// apps/server/src/modules/ai/tools/sales-query.helper.ts

export function buildSalesWhereClause(params: {
  region?: string | null;
  category?: string | null;
  timeRange?: string | null;
}): Record<string, any> {
  // 如果是 null，统一转成 undefined 方便处理
  const region = params.region ?? undefined;
  const category = params.category ?? undefined;
  const timeRange = params.timeRange ?? undefined;

  const where: any = {};

  if (region && region !== "全部") where.region = region;
  if (category && category !== "全部") where.category = category;

  const now = new Date();
  if (timeRange === "今天") {
    where.saleDate = { gte: new Date(now.setHours(0, 0, 0, 0)) };
  } else if (timeRange === "本月") {
    where.saleDate = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
  } else if (timeRange === "上月") {
    where.saleDate = {
      gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      lt: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  } else if (timeRange === "今年") {
    where.saleDate = { gte: new Date(now.getFullYear(), 0, 1) };
  }

  return where;
}

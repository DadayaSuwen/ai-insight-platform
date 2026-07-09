/**
 * shims.d.ts — M4 扩展包无类型声明,补 declare module
 *
 * echarts-gl / echarts-liquidfill / echarts-wordcloud 都没有官方 @types 包
 * (它们都通过 side-effect import 修改全局 echarts)。
 *
 * 这里用宽松 any 类型即可,因为我们只用 dynamic import + optional chaining 访问 install 等。
 */
declare module "echarts-gl";
declare module "echarts-liquidfill";
declare module "echarts-wordcloud";
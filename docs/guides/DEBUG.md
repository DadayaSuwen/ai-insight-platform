# 调试指南

## 常见问题

### 数据库连接失败

**问题**: `ECONNREFUSED` 或 `Authentication failed`

**解决**:
```bash
# 检查数据库是否运行
docker ps | grep postgres

# 重新启动
docker-compose restart postgres

# 检查连接字符串
docker exec ai-insight-platform-postgres-1 psql -U app -d ai_insight -c "SELECT 1"
```

### Prisma Client 生成失败

**问题**: `Cannot find module '@prisma/client'`

**解决**:
```bash
cd apps/server
pnpm prisma generate
```

### 前端构建失败

**问题**: TypeScript 错误

**解决**:
```bash
cd apps/web
npx tsc --noEmit  # 查看具体错误
```

### Ollama 连接失败

**问题**: `ECONNREFUSED` on port 11434

**解决**:
```bash
# 启动 Ollama
docker-compose up -d ollama

# 拉取模型
docker exec ai-insight-platform-ollama-1 ollama pull qwen3:8b
```

## 日志查看

### 后端日志

```bash
# 查看容器日志
docker logs ai-insight-platform-server-1

# 实时日志
docker logs -f ai-insight-platform-server-1
```

### 前端日志

浏览器控制台 (F12) 查看

## 调试技巧

### VS Code 调试

1. 安装 Debugger for Chrome 扩展
2. 添加 launch.json 配置
3. 设置断点
4. 按 F5 启动调试

### NestJS 调试

```bash
# 使用 NestJS CLI
cd apps/server
pnpm dev:debug
```

## 性能优化

### 数据库查询慢

```sql
-- 分析查询计划
EXPLAIN ANALYZE SELECT * FROM "Sales" WHERE ...
```

### 前端性能

- 使用 React DevTools Profiler
- 检查网络请求瀑布图
- 启用生产构建进行测试
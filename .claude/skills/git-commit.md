---
name: git-commit
description: 使用中文提交代码到 Git，不包含 Claude 作为作者
metadata:
  type: user
---

# Git 提交技能

## 使用方式

当用户说"提交代码"、"git commit"、"推送"时，执行以下步骤：

## 提交流程

### 1. 检查状态
```bash
git status
```

### 2. 添加所有更改
```bash
git add .
```

### 3. 创建提交（使用中文，不包含 Co-Authored-By: Claude）
```bash
git commit -m "<提交消息>"
```

提交消息格式：
- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 样式调整
- `refactor:` 代码重构
- `chore:` 构建/工具更新

示例：
```
feat: 修复后端 TypeScript 配置问题

- 修改 moduleResolution 为 node 解决兼容性问题
- 添加 rootDir 配置
- 修复前端 Tailwind CSS 警告
```

### 4. 推送到远程
```bash
git push
```

## 注意事项

- 提交消息使用中文
- 不添加 Co-Authored-By: Claude
- 确保提交前代码可以正常构建
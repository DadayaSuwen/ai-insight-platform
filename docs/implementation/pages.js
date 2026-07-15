// ============================================================
// AI Insight · 自主 Schema 探索 Agent · 页面集 v2
// 新增：登录/注册/首次引导/CSV上传/模型配置/用户管理/角色权限
// ============================================================

const PAGES = {};
const PAGE_INIT = {};

// ============================================================
// 1. 首次引导页 onboarding (未配置数据源时的首页)
// ============================================================
PAGES.onboarding = `
<div class="onboarding-page">
  <div class="onboarding-card">
    <div class="onboarding-logo">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>
    </div>
    <h1 class="onboarding-title">欢迎，${STATE.user.name}</h1>
    <p class="onboarding-subtitle">
      你还没有配置任何数据源。<br>
      Agent 需要连接你的数据才能开始自主探索与分析。<br>
      选择一种方式开始：
    </p>

    <div class="mode-grid">
      <div class="mode-card" onclick="navigate('datasource-new')">
        <div class="mode-card-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        </div>
        <div class="mode-card-title">连接数据库</div>
        <div class="mode-card-desc">PostgreSQL / MySQL / SQLite<br>Agent 会自主探索 Schema</div>
        <div class="mode-card-arrow">开始连接 →</div>
      </div>

      <div class="mode-card amber" onclick="navigate('datasource-csv')">
        <div class="mode-card-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="mode-card-title">上传 CSV 文件</div>
        <div class="mode-card-desc">支持单个或多个 CSV<br>自动推断字段类型</div>
        <div class="mode-card-arrow">上传文件 →</div>
      </div>
    </div>

    <div style="padding: 14px 16px; background: var(--info-light); border-radius: 8px; font-size: 12px; color: var(--info); text-align: left; line-height: 1.6;">
      💡 <strong>首次使用建议：</strong>
      <br>• 如果你有数据库，先用「连接数据库」体验完整流程
      <br>• 如果只想快速试用，上传任意 CSV 即可（如销售记录、成绩单）
      <br>• 配置完成后，Agent 会用 30-60 秒探索数据结构
    </div>

    <div style="margin-top: 20px; font-size: 11px; color: var(--text-muted);">
      🔒 所有数据只读访问 · 不会修改你的任何数据 · 连接信息加密存储
    </div>
  </div>
</div>
`;
PAGE_INIT.onboarding = function() {};


// ============================================================
// 2. 数据源列表页 datasource-list
// ============================================================
PAGES['datasource-list'] = `
<div class="page-header">
  <div>
    <h1 class="page-title">数据源管理</h1>
    <p class="page-subtitle">管理所有已连接的数据源 · 支持数据库与 CSV 文件</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm" onclick="navigate('datasource-csv')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      上传 CSV
    </button>
    <button class="btn btn-primary btn-sm" onclick="navigate('datasource-new')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      连接数据库
    </button>
  </div>
</div>

<div class="grid grid-4" style="margin-bottom: 24px;">
  <div class="card" style="padding: 16px;">
    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">数据源总数</div>
    <div class="num" style="font-size:22px; font-weight:700;">${STATE.datasourceConfigured ? '1' : '0'}<span style="font-size:13px; color:var(--text-muted);"> 个</span></div>
  </div>
  <div class="card" style="padding: 16px;">
    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">数据库</div>
    <div class="num" style="font-size:22px; font-weight:700;">${STATE.currentDatasource && STATE.currentDatasource.type !== 'csv' ? '1' : '0'}<span style="font-size:13px; color:var(--text-muted);"> 个</span></div>
  </div>
  <div class="card" style="padding: 16px;">
    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">CSV 文件</div>
    <div class="num" style="font-size:22px; font-weight:700;">${STATE.currentDatasource && STATE.currentDatasource.type === 'csv' ? '1' : '0'}<span style="font-size:13px; color:var(--text-muted);"> 个</span></div>
  </div>
  <div class="card" style="padding: 16px;">
    <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">表总数</div>
    <div class="num" style="font-size:22px; font-weight:700;">${STATE.currentDatasource ? STATE.currentDatasource.tables : '0'}<span style="font-size:13px; color:var(--text-muted);"> 张</span></div>
  </div>
</div>

<div class="card">
  <table class="table">
    <thead>
      <tr><th>数据源名称</th><th>类型</th><th>连接信息</th><th>表数</th><th>状态</th><th>最近探索</th><th>操作</th></tr>
    </thead>
    <tbody>
      ${STATE.datasourceConfigured ? `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:28px; height:28px; border-radius:6px; background:var(--green-lighter); color:var(--green-dark); display:flex; align-items:center; justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            </div>
            <div><div style="font-weight:600;">${STATE.currentDatasource.name}</div><div style="font-size:11px; color:var(--text-muted);">${STATE.currentDatasource.type === 'csv' ? 'CSV 文件' : '数据库连接'}</div></div>
          </div>
        </td>
        <td><span class="chip">${STATE.currentDatasource.type}</span></td>
        <td class="num" style="font-size:12px;">${STATE.currentDatasource.type === 'csv' ? '本地文件' : '192.168.1.100:5432'}</td>
        <td class="num">${STATE.currentDatasource.tables}</td>
        <td><span class="status-dot">在线</span></td>
        <td class="num" style="font-size:12px;">2026-07-14 14:32</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="navigate('dashboard')">查看</button>
          <button class="btn btn-ghost btn-sm" onclick="navigate('schema')">修订</button>
        </td>
      </tr>
      ` : `
      <tr><td colspan="7" style="text-align: center; padding: 48px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
        <div style="font-size: 14px; margin-bottom: 4px;">还没有配置数据源</div>
        <div style="font-size: 12px; margin-bottom: 16px;">连接数据库或上传 CSV 开始使用</div>
        <button class="btn btn-primary btn-sm" onclick="navigate('datasource-new')">连接第一个数据源</button>
      </td></tr>
      `}
    </tbody>
  </table>
</div>
`;
PAGE_INIT['datasource-list'] = function() {};


// ============================================================
// 3. 新建数据库连接 datasource-new
// ============================================================
PAGES['datasource-new'] = `
<div class="page-header">
  <div>
    <h1 class="page-title">连接数据库</h1>
    <p class="page-subtitle">Agent 会自主探索 Schema · 不确定的地方会向你提问</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm" onclick="navigate('datasource-csv')">改用 CSV 上传</button>
  </div>
</div>

<div class="card" style="max-width: 720px; margin: 0 auto;">
  <div class="card-body" style="padding: 32px;">
    <div style="margin-bottom: 20px;">
      <label class="input-label">选择数据库类型</label>
      <div class="db-type-grid">
        <div class="db-type-card active" onclick="selectDbType(this)">
          <div class="db-type-icon">🐘</div>
          <div class="db-type-name">PostgreSQL</div>
        </div>
        <div class="db-type-card" onclick="selectDbType(this)">
          <div class="db-type-icon">🐬</div>
          <div class="db-type-name">MySQL</div>
        </div>
        <div class="db-type-card" onclick="selectDbType(this)">
          <div class="db-type-icon">📦</div>
          <div class="db-type-name">SQLite</div>
        </div>
        <div class="db-type-card" onclick="selectDbType(this)">
          <div class="db-type-icon">🪣</div>
          <div class="db-type-name">SQL Server</div>
        </div>
      </div>
    </div>

    <div class="form-row">
      <div>
        <label class="input-label">主机地址</label>
        <input class="input input-lg" value="192.168.1.100">
      </div>
      <div>
        <label class="input-label">端口</label>
        <input class="input input-lg" value="5432">
      </div>
    </div>
    <div class="form-row">
      <div>
        <label class="input-label">数据库名</label>
        <input class="input input-lg" value="ecommerce_db">
      </div>
      <div>
        <label class="input-label">Schema（可选）</label>
        <input class="input input-lg" value="public">
      </div>
    </div>
    <div class="form-row">
      <div>
        <label class="input-label">用户名</label>
        <input class="input input-lg" value="readonly_user">
      </div>
      <div>
        <label class="input-label">密码</label>
        <input class="input input-lg" type="password" value="••••••••••">
      </div>
    </div>

    <div style="margin-top: 8px;">
      <label class="input-label">数据源名称（用于展示）</label>
      <input class="input input-lg" value="电商订单库">
    </div>

    <div style="margin-top: 20px; padding: 14px 16px; background: var(--green-lighter); border-radius: 8px; border-left: 3px solid var(--green); font-size: 12px; color: var(--green-darker); display: flex; gap: 10px; align-items: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      <div>
        <strong>只读模式</strong>：Agent 只会执行 SELECT 查询，不会修改您的任何数据。所有 SQL 会经过权限校验，敏感字段会被自动识别并脱敏。
      </div>
    </div>

    <div style="display: flex; gap: 10px; margin-top: 24px;">
      <button class="btn btn-secondary btn-lg" style="flex: 1;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-9 9c-2.39 0-4.68-.94-6.4-2.6L3 16M3 12a9 9 0 0 1 9-9c2.39 0 4.68.94 6.4 2.6L21 8"/></svg>
        测试连接
      </button>
      <button class="btn btn-primary btn-lg" style="flex: 1;" onclick="startExplore()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        开始探索
      </button>
    </div>
  </div>
</div>
`;
PAGE_INIT['datasource-new'] = function() {};

function selectDbType(el) {
  document.querySelectorAll('.db-type-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}


// ============================================================
// 4. CSV 上传页 datasource-csv
// ============================================================
PAGES['datasource-csv'] = `
<div class="page-header">
  <div>
    <h1 class="page-title">上传 CSV 文件</h1>
    <p class="page-subtitle">支持多个 CSV · Agent 会自动推断字段类型与表关系</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm" onclick="navigate('datasource-new')">改用数据库连接</button>
  </div>
</div>

<div class="card" style="max-width: 720px; margin: 0 auto;">
  <div class="card-body" style="padding: 32px;">

    <!-- 上传区 -->
    <div class="csv-upload-zone" id="csv-dropzone" onclick="document.getElementById('csv-file-input').click()">
      <div class="csv-upload-icon">📄</div>
      <div class="csv-upload-text">点击或拖拽 CSV 文件到此处</div>
      <div class="csv-upload-hint">支持 .csv 格式 · 单文件最大 50MB · 可多选</div>
      <input type="file" id="csv-file-input" accept=".csv" multiple style="display:none;" onchange="handleCsvUpload(this)">
    </div>

    <!-- 已上传文件列表（模拟） -->
    <div style="margin-top: 24px;" id="csv-file-list">
      <div style="font-size:13px; font-weight:600; margin-bottom: 12px;">已上传文件</div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border);">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: var(--green-lighter); color: var(--green-dark); display: flex; align-items: center; justify-content: center; font-size: 18px;">📊</div>
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:600;">orders.csv</div>
            <div style="font-size:11px; color:var(--text-muted);">48,237 行 · 12 列 · 2.4 MB · 推断为「订单表」</div>
          </div>
          <span class="badge badge-success">已解析</span>
          <button class="btn btn-ghost btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border);">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: var(--warning-light); color: var(--warning); display: flex; align-items: center; justify-content: center; font-size: 18px;">👥</div>
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:600;">customers.csv</div>
            <div style="font-size:11px; color:var(--text-muted);">3,248 行 · 9 列 · 0.8 MB · 推断为「客户表」</div>
          </div>
          <span class="badge badge-success">已解析</span>
          <button class="btn btn-ghost btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border);">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: var(--info-light); color: var(--info); display: flex; align-items: center; justify-content: center; font-size: 18px;">🛍️</div>
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:600;">products.csv</div>
            <div style="font-size:11px; color:var(--text-muted);">486 行 · 11 列 · 0.2 MB · 推断为「商品表」</div>
          </div>
          <span class="badge badge-success">已解析</span>
          <button class="btn btn-ghost btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>

      <div style="margin-top: 16px; padding: 12px 14px; background: var(--info-light); border-radius: 8px; font-size: 12px; color: var(--info);">
        💡 <strong>Agent 推断：</strong>这 3 个 CSV 的文件名与字段有相似性（如 orders.csv 的 <code>cust_id</code> 与 customers.csv 的 <code>id</code>），Agent 会推断它们可能存在关联关系，并在 Schema 确认环节向你核实。
      </div>
    </div>

    <!-- 表关系预推断 -->
    <div style="margin-top: 24px;">
      <div style="font-size:13px; font-weight:600; margin-bottom: 12px;">Agent 预推断的表关系</div>
      <div style="padding: 14px 16px; background: var(--bg-secondary); border-radius: 10px; font-family: 'SF Mono', Menlo, monospace; font-size: 12px; line-height: 1.8; color: var(--text-secondary);">
        <span style="color: var(--green-dark);">orders.cust_id</span> → <span style="color: var(--amber);">customers.id</span> （命名相似 · 值匹配 100%）<br>
        <span style="color: var(--green-dark);">orders.prod_id</span> → <span style="color: var(--amber);">products.id</span> （命名相似 · 值匹配 98%）
      </div>
    </div>

    <div style="margin-top: 24px; padding: 14px 16px; background: var(--green-lighter); border-radius: 8px; border-left: 3px solid var(--green); font-size: 12px; color: var(--green-darker);">
      🔒 <strong>数据安全：</strong>CSV 文件上传后存储在本地 SQLite，不会上传到任何第三方服务。LLM 只看到字段名与抽样数据（每字段 1000 条），不看到完整数据。
    </div>

    <div style="display: flex; gap: 10px; margin-top: 24px;">
      <button class="btn btn-secondary btn-lg" style="flex: 1;" onclick="navigate('datasource-csv')">继续添加</button>
      <button class="btn btn-primary btn-lg" style="flex: 1;" onclick="startExplore()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        开始探索 3 个 CSV
      </button>
    </div>

  </div>
</div>
`;
PAGE_INIT['datasource-csv'] = function() {
  const dz = document.getElementById('csv-dropzone');
  if (dz) {
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragging'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('dragging'); });
  }
};

function handleCsvUpload(input) {
  alert('已选择 ' + input.files.length + ' 个文件（原型演示）');
}


// ============================================================
// 5. 探索进度页 explore
// ============================================================
PAGES.explore = `
<div style="max-width: 800px; margin: 0 auto; padding: 20px 0;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 8px;">Agent 正在自主探索</h1>
    <p style="font-size: 13px; color: var(--text-muted);">ecommerce_db @ 192.168.1.100:5432 · 预计 30-60 秒</p>
  </div>

  <div style="background: var(--bg-primary); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-size: 13px; font-weight: 600;">总进度</span>
      <span class="num" style="font-size: 13px; color: var(--green-dark); font-weight: 600;">60% · 第 3/5 步</span>
    </div>
    <div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
      <div style="height: 100%; width: 60%; background: linear-gradient(90deg, var(--green), var(--green-dark)); border-radius: 4px; transition: width 0.5s;"></div>
    </div>
  </div>

  <div class="card" style="padding: 0 24px;">
    <div class="explore-step done">
      <div class="explore-step-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div style="flex: 1;">
        <div class="explore-step-title">连接数据源</div>
        <div class="explore-step-desc">已成功连接到 PostgreSQL 16.2 · 时区 Asia/Shanghai</div>
      </div>
      <span class="num" style="font-size: 11px; color: var(--text-muted);">0.8s</span>
    </div>

    <div class="explore-step done">
      <div class="explore-step-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div style="flex: 1;">
        <div class="explore-step-title">发现表与统计信息</div>
        <div class="explore-step-desc">共发现 12 张表，过滤 4 张系统表，识别 8 张业务表</div>
        <div class="explore-step-detail">
▸ orders (48,237 行) · 12 列 · 最近更新 2 分钟前<br>
▸ customers (3,248 行) · 9 列<br>
▸ products (486 行) · 11 列<br>
▸ order_items (98,432 行) · 7 列<br>
▸ categories (24 行) · 4 列 · 字典表<br>
▸ payments (45,821 行) · 8 列<br>
▸ shipping (12,847 行) · 10 列<br>
▸ reviews (8,234 行) · 6 列
        </div>
      </div>
      <span class="num" style="font-size: 11px; color: var(--text-muted);">2.1s</span>
    </div>

    <div class="explore-step active">
      <div class="explore-step-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>
      <div style="flex: 1;">
        <div class="explore-step-title">分析字段语义（LLM 推断中）</div>
        <div class="explore-step-desc">正在用 LLM 推断每个字段的业务含义、识别时间字段/维度字段/指标字段</div>
        <div class="explore-step-detail">
✓ orders.id → 订单唯一标识 (PK)<br>
✓ orders.cust_id → 客户 ID (FK → customers.id)<br>
✓ orders.total_amt → 订单总金额 (指标字段, 单位: 元)<br>
✓ orders.created_at → 下单时间 (时间字段)<br>
<span style="color: var(--amber);">⏳ orders.status → 状态字段 (含义待确认: pending/paid/shipped?)</span><br>
<span style="color: var(--text-muted);">⏳ orders.coupon_code → 优惠券代码 (是否敏感?)</span>
        </div>
      </div>
      <span class="num" style="font-size: 11px; color: var(--green-dark);">进行中...</span>
    </div>

    <div class="explore-step pending">
      <div class="explore-step-icon">4</div>
      <div style="flex: 1;">
        <div class="explore-step-title">推断表关系与外键</div>
        <div class="explore-step-desc">基于字段命名相似性与值匹配，推断表之间的关联关系</div>
      </div>
    </div>

    <div class="explore-step pending">
      <div class="explore-step-icon">5</div>
      <div style="flex: 1;">
        <div class="explore-step-title">生成 Schema 理解报告 · 等待您确认</div>
        <div class="explore-step-desc">对于置信度低的字段，Agent 会向您提问确认，敲定后才开始分析</div>
      </div>
    </div>
  </div>

  <div style="margin-top: 20px; background: #1e293b; border-radius: 12px; padding: 16px 20px; font-family: 'SF Mono', Menlo, monospace; font-size: 11px; line-height: 1.8; color: #94a3b8; max-height: 200px; overflow-y: auto;">
    <div style="color: #6B95B8;">[14:32:08]</div> <span style="color: #5BA888;">✓</span> Connecting to postgresql://192.168.1.100:5432/ecommerce_db<br>
    <div style="color: #6B95B8;">[14:32:09]</div> <span style="color: #5BA888;">✓</span> Connection established · pg_version=16.2<br>
    <div style="color: #6B95B8;">[14:32:10]</div> <span style="color: #5BA888;">✓</span> Found 12 tables (8 business + 4 system)<br>
    <div style="color: #6B95B8;">[14:32:11]</div> <span style="color: #5BA888;">✓</span> Collected 67 columns across 8 tables<br>
    <div style="color: #6B95B8;">[14:32:14]</div> <span style="color: #D4A06D;">⏳</span> LLM analyzing orders.status ... (confidence: 0.62)<br>
    <div style="color: #6B95B8;">[14:32:15]</div> <span style="color: #D4A06D;">⏳</span> LLM analyzing orders.coupon_code ... (confidence: 0.58)<br>
    <div style="color: #6B95B8;">[14:32:16]</div> <span style="color: #D4A06D;">⏳</span> Marked 4 fields as "needs user confirmation"<br>
    <div style="color: #6B95B8;">[14:32:17]</div> <span style="color: #5BA888;">→</span> Preparing schema review session ...
  </div>

  <div style="text-align: center; margin-top: 24px;">
    <button class="btn btn-primary btn-lg" onclick="navigate('schema-review')">
      查看探索结果，开始确认
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </button>
    <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Agent 发现 4 个不确定字段，需要您确认</p>
  </div>
</div>
`;
PAGE_INIT.explore = function() {};


// ============================================================
// 6. Schema 纠错对话页 schema-review (核心创新)
// ============================================================
PAGES['schema-review'] = `
<div class="page-header" style="margin-bottom: 16px;">
  <div>
    <h1 class="page-title">Schema 确认 · 帮 Agent 搞懂您的数据</h1>
    <p class="page-subtitle">Agent 已自主探索完成 · 4 个字段不确定 · 请回答提问，敲定后开始分析</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm" onclick="navigate('explore')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.39 0 4.68.94 6.4 2.6L21 8"/></svg>
      重新探索
    </button>
    <button class="btn btn-primary btn-sm" onclick="navigate('confirm')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      全部确认，生成工作台
    </button>
  </div>
</div>

<div class="schema-review-layout">
  <div class="schema-tree">
    <div class="schema-tree-header">
      <span>数据库结构 (8 张表)</span>
      <span class="badge badge-warning">4 待确认</span>
    </div>
    <div class="schema-tree-body">
      <div class="schema-table-item confirmed">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>customers</div>
        <div class="schema-table-meta">客户表 · 3,248 行 · 9 列 · 已确认</div>
      </div>
      <div class="schema-table-item active has-issue">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>orders</div>
        <div class="schema-table-meta">订单表 · 48,237 行 · 12 列 · 3 处疑问</div>
      </div>
      <div class="schema-table-item confirmed">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>order_items</div>
        <div class="schema-table-meta">订单明细 · 98,432 行 · 7 列 · 已确认</div>
      </div>
      <div class="schema-table-item confirmed">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>products</div>
        <div class="schema-table-meta">商品表 · 486 行 · 11 列 · 已确认</div>
      </div>
      <div class="schema-table-item confirmed">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>categories</div>
        <div class="schema-table-meta">分类字典 · 24 行 · 4 列 · 已确认</div>
      </div>
      <div class="schema-table-item has-issue">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>payments</div>
        <div class="schema-table-meta">支付记录 · 45,821 行 · 1 处疑问</div>
      </div>
      <div class="schema-table-item confirmed">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>shipping</div>
        <div class="schema-table-meta">物流 · 12,847 行 · 10 列 · 已确认</div>
      </div>
      <div class="schema-table-item confirmed">
        <div class="schema-table-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>reviews</div>
        <div class="schema-table-meta">评论 · 8,234 行 · 6 列 · 已确认</div>
      </div>
    </div>
    <div style="padding: 12px 16px; border-top: 1px solid var(--border-light); font-size: 11px; color: var(--text-muted);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>✓ 已确认</span><span class="num">6 表 / 60 字段</span></div>
      <div style="display: flex; justify-content: space-between;"><span style="color: var(--amber);">⏳ 待确认</span><span class="num" style="color: var(--amber);">2 表 / 4 字段</span></div>
    </div>
  </div>

  <div class="review-chat">
    <div class="review-chat-header">
      <div>
        <div style="font-size: 14px; font-weight: 600;">与 Agent 对话 · 确认 Schema 理解</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">当前聚焦：orders 表 · 已回答 1/4 个问题</div>
      </div>
      <span class="badge badge-info">LLM 驱动</span>
    </div>

    <div class="review-chat-messages">
      <div class="review-message ai">
        <div class="review-avatar ai">AI</div>
        <div style="flex: 1; min-width: 0;">
          <div class="review-bubble">
            我已探索完 <code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; font-size: 12px;">orders</code> 表，整体理解是一张<strong>订单主表</strong>，48,237 条记录。但有 3 个字段不太确定，需要您确认。
          </div>
          <div class="schema-field-card">
            <div class="schema-field-row header"><span>字段名</span><span>类型</span><span>Agent 理解</span><span>状态</span></div>
            <div class="schema-field-row"><span class="schema-field-name">id</span><span class="schema-field-type">bigint</span><span class="schema-field-meaning">订单唯一标识 (PK)</span><span class="schema-field-status"><span class="badge badge-success">✓ 已知</span></span></div>
            <div class="schema-field-row"><span class="schema-field-name">cust_id</span><span class="schema-field-type">bigint</span><span class="schema-field-meaning">客户 ID (FK)</span><span class="schema-field-status"><span class="badge badge-success">✓ 已知</span></span></div>
            <div class="schema-field-row"><span class="schema-field-name">total_amt</span><span class="schema-field-type">decimal</span><span class="schema-field-meaning">订单总金额（元）</span><span class="schema-field-status"><span class="badge badge-success">✓ 已知</span></span></div>
            <div class="schema-field-row" style="background: var(--warning-light);"><span class="schema-field-name">status</span><span class="schema-field-type">varchar</span><span class="schema-field-meaning guessed">状态枚举 · pending/paid/shipped?</span><span class="schema-field-status"><span class="badge badge-warning">⚠ 待确认</span></span></div>
            <div class="schema-field-row" style="background: var(--warning-light);"><span class="schema-field-name">coupon_code</span><span class="schema-field-type">varchar</span><span class="schema-field-meaning guessed">优惠券代码 · 敏感?</span><span class="schema-field-status"><span class="badge badge-warning">⚠ 待确认</span></span></div>
            <div class="schema-field-row" style="background: var(--warning-light);"><span class="schema-field-name">channel</span><span class="schema-field-type">varchar</span><span class="schema-field-meaning guessed">下单渠道 · web/app/wap?</span><span class="schema-field-status"><span class="badge badge-warning">⚠ 待确认</span></span></div>
            <div class="schema-field-row"><span class="schema-field-name">created_at</span><span class="schema-field-type">timestamp</span><span class="schema-field-meaning">下单时间</span><span class="schema-field-status"><span class="badge badge-success">✓ 已知</span></span></div>
          </div>
        </div>
      </div>

      <div class="review-message ai">
        <div class="review-avatar ai">AI</div>
        <div style="flex: 1; min-width: 0;">
          <div class="review-bubble">
            <strong>问题 1/4：</strong>关于 <code>orders.status</code>，抽样 1000 条数据，取值有 <code>pending</code> · <code>paid</code> · <code>shipped</code> · <code>delivered</code> · <code>cancelled</code> · <code>refunded</code>。<br><br>
            请确认：<br>• <code>pending</code> 是「待付款」还是「待发货」？<br>• <code>delivered</code> 是终态吗？
          </div>
          <div class="quick-reply">
            <button class="quick-reply-btn" onclick="quickReply(this, 'pending 是待付款，shipped 是已发货未签收，delivered 是已签收即终态')">pending=待付款, delivered=终态</button>
            <button class="quick-reply-btn" onclick="quickReply(this, 'pending 是待发货（已付款），shipped 已发货，delivered 已签收即完成')">pending=待发货, delivered=完成</button>
            <button class="quick-reply-btn" onclick="quickReply(this, '我的理解基本正确，按你说的就行')">按你的理解</button>
            <button class="quick-reply-btn" onclick="quickReply(this, '这个字段不重要，跳过就行')">跳过此字段</button>
          </div>
        </div>
      </div>

      <div class="review-message user">
        <div class="review-avatar user">李</div>
        <div style="flex: 1; min-width: 0;">
          <div class="review-bubble">pending 是待发货（已付款），shipped 已发货，delivered 已签收即完成。cancelled 是用户取消，refunded 是已退款。</div>
        </div>
      </div>

      <div class="review-message ai">
        <div class="review-avatar ai">AI</div>
        <div style="flex: 1; min-width: 0;">
          <div class="review-bubble">
            <span style="color: var(--green-dark); font-weight: 600;">✓ 收到。</span>已记录 <code>orders.status</code> 完整业务含义。<br>
            • 「已完成」= status='delivered'<br>
            • 「在途」= status IN ('shipped','pending')<br>
            • 「流失」= status IN ('cancelled','refunded')<br><br>
            <strong>问题 2/4：</strong>关于 <code>orders.coupon_code</code>，约 23% 订单有值，格式像 <code>NEW2024</code> · <code>FLASH50</code>。是优惠券代码还是活动代码？是否敏感？
          </div>
          <div class="quick-reply">
            <button class="quick-reply-btn" onclick="quickReply(this, '是优惠券代码，不敏感，可以正常分析展示')">优惠券代码 · 不敏感</button>
            <button class="quick-reply-btn" onclick="quickReply(this, '是优惠券代码，敏感，分析时不要展示具体值只做聚合')">优惠券代码 · 敏感脱敏</button>
            <button class="quick-reply-btn" onclick="quickReply(this, '是活动代码，不敏感')">活动代码 · 不敏感</button>
          </div>
        </div>
      </div>
    </div>

    <div class="review-input-area">
      <button class="btn btn-ghost btn-sm"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
      <textarea class="review-input" placeholder="直接打字回答 Agent，或点击上方快捷回复..."></textarea>
      <button class="btn btn-primary btn-sm">发送 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>
  </div>
</div>
`;
PAGE_INIT['schema-review'] = function() {
  setTimeout(() => {
    const msgs = document.querySelector('.review-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 100);
};

function quickReply(btn, text) {
  const messages = document.querySelector('.review-chat-messages');
  if (!messages) return;
  const userMsg = document.createElement('div');
  userMsg.className = 'review-message user';
  userMsg.innerHTML = `<div class="review-avatar user">李</div><div style="flex: 1; min-width: 0;"><div class="review-bubble">${text}</div></div>`;
  messages.appendChild(userMsg);
  btn.parentElement.style.display = 'none';
  setTimeout(() => {
    const aiMsg = document.createElement('div');
    aiMsg.className = 'review-message ai';
    aiMsg.innerHTML = `<div class="review-avatar ai">AI</div><div style="flex: 1; min-width: 0;"><div class="review-bubble"><span style="color: var(--green-dark); font-weight: 600;">✓ 收到。</span>已记录该字段语义。<br><br><strong>问题 3/4：</strong>关于 <code>orders.channel</code>，取值有 <code>web</code> · <code>app</code> · <code>wap</code> · <code>mini</code>。<code>wap</code> 是 H5 手机网页，<code>mini</code> 是微信小程序吗？</div><div class="quick-reply"><button class="quick-reply-btn" onclick="quickReply(this, 'wap 是 H5 手机网页，mini 是微信小程序，没有其他渠道了')">wap=H5, mini=小程序</button><button class="quick-reply-btn" onclick="quickReply(this, '基本正确，mini 还包含支付宝小程序')">mini 含支付宝小程序</button><button class="quick-reply-btn" onclick="quickReply(this, '按你的理解就行')">按你的理解</button></div></div>`;
    messages.appendChild(aiMsg);
    messages.scrollTop = messages.scrollHeight;
  }, 800);
}


// ============================================================
// 7. Schema 敲定页 confirm
// ============================================================
PAGES.confirm = `
<div class="page-header">
  <div>
    <h1 class="page-title">Schema 敲定 · 准备生成工作台</h1>
    <p class="page-subtitle">所有疑问已澄清 · 8 张表 · 67 字段 · 7 条表关系</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm" onclick="navigate('schema-review')">返回修改</button>
    <button class="btn btn-primary btn-sm" onclick="finalizeSchema()">确认，生成工作台</button>
  </div>
</div>

<div class="grid grid-4" style="margin-bottom: 24px;">
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">业务表</div><div class="num" style="font-size:22px; font-weight:700;">8<span style="font-size:13px; color:var(--text-muted);"> 张</span></div><div style="font-size:11px; color:var(--text-muted); margin-top:4px;">含 1 张字典表</div></div>
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">字段总数</div><div class="num" style="font-size:22px; font-weight:700;">67<span style="font-size:13px; color:var(--text-muted);"> 个</span></div><div style="font-size:11px; color:var(--green-dark); margin-top:4px;">63 已确认 · 4 用户标注</div></div>
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">识别关系</div><div class="num" style="font-size:22px; font-weight:700;">7<span style="font-size:13px; color:var(--text-muted);"> 条</span></div><div style="font-size:11px; color:var(--text-muted); margin-top:4px;">5 外键 + 2 推断</div></div>
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">敏感字段</div><div class="num" style="font-size:22px; font-weight:700; color: var(--warning);">2<span style="font-size:13px; color:var(--text-muted);"> 个</span></div><div style="font-size:11px; color:var(--text-muted); margin-top:4px;">已标记脱敏规则</div></div>
</div>

<div class="card" style="margin-bottom: 16px;">
  <div class="card-header"><div class="card-title">Agent 识别的表关系（ER 简图）</div><span class="chip green">7 条关系</span></div>
  <div class="card-body" style="padding: 24px;">
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: center;">
      <div style="text-align: center; padding: 16px; background: var(--green-lighter); border-radius: 10px; border: 1px solid var(--green-light);">
        <div style="font-size: 24px; margin-bottom: 6px;">👥</div>
        <div style="font-size: 14px; font-weight: 700;">customers</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">3,248 行</div>
        <div style="font-size: 11px; color: var(--green-dark); margin-top: 4px;">核心实体</div>
      </div>
      <div style="text-align: center; color: var(--green-dark);">
        <svg width="60" height="20" viewBox="0 0 60 20" style="margin: 0 auto;"><line x1="0" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="1.5"/><polygon points="50,5 60,10 50,15" fill="currentColor"/></svg>
        <div style="font-size: 10px; margin-top: 4px; font-family: monospace;">1 : N</div>
        <div style="font-size: 10px; color: var(--text-muted);">cust_id</div>
      </div>
      <div style="text-align: center; padding: 16px; background: var(--green-lighter); border-radius: 10px; border: 1px solid var(--green-light);">
        <div style="font-size: 24px; margin-bottom: 6px;">📦</div>
        <div style="font-size: 14px; font-weight: 700;">orders</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">48,237 行</div>
        <div style="font-size: 11px; color: var(--green-dark); margin-top: 4px;">核心实体</div>
      </div>
      <div style="text-align: center; color: var(--green-dark);">
        <svg width="60" height="20" viewBox="0 0 60 20" style="margin: 0 auto;"><line x1="0" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="1.5"/><polygon points="50,5 60,10 50,15" fill="currentColor"/></svg>
        <div style="font-size: 10px; margin-top: 4px; font-family: monospace;">1 : N</div>
        <div style="font-size: 10px; color: var(--text-muted);">order_id</div>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: center; margin-top: 16px;">
      <div></div><div></div>
      <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border);">
        <div style="font-size: 24px; margin-bottom: 6px;">📋</div>
        <div style="font-size: 14px; font-weight: 700;">order_items</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">98,432 行</div>
      </div>
      <div style="text-align: center; color: var(--green-dark);">
        <svg width="60" height="20" viewBox="0 0 60 20" style="margin: 0 auto;"><line x1="0" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="1.5"/><polygon points="50,5 60,10 50,15" fill="currentColor"/></svg>
        <div style="font-size: 10px; margin-top: 4px; font-family: monospace;">N : 1</div>
        <div style="font-size: 10px; color: var(--text-muted);">product_id</div>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: center; margin-top: 16px;">
      <div></div><div></div><div></div>
      <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: 10px; border: 1px solid var(--border);">
        <div style="font-size: 24px; margin-bottom: 6px;">🛍️</div>
        <div style="font-size: 14px; font-weight: 700;">products</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">486 行</div>
      </div>
    </div>
    <div style="margin-top: 20px; padding: 12px 16px; background: var(--info-light); border-radius: 8px; font-size: 12px; color: var(--info);">
      <strong>Agent 判断：</strong>核心业务链路为 <code>customers → orders → order_items → products</code>，工作台将围绕这条链路设计 KPI 与图表。
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><div class="card-title">字段语义汇总（关键表）</div><button class="btn btn-ghost btn-sm">导出 JSON</button></div>
  <table class="table">
    <thead><tr><th>表</th><th>字段</th><th>类型</th><th>Agent 理解</th><th>角色</th><th>用户确认</th><th>敏感</th></tr></thead>
    <tbody>
      <tr><td rowspan="4" style="vertical-align: top; font-weight: 600;">orders</td><td class="num" style="font-family: monospace;">id</td><td>bigint</td><td>订单唯一标识</td><td><span class="chip">主键</span></td><td><span class="status-dot">已知</span></td><td>—</td></tr>
      <tr><td class="num" style="font-family: monospace;">cust_id</td><td>bigint</td><td>客户 ID</td><td><span class="chip green">外键</span></td><td><span class="status-dot">已知</span></td><td>—</td></tr>
      <tr><td class="num" style="font-family: monospace;">total_amt</td><td>decimal</td><td>订单总金额（元）</td><td><span class="chip amber">指标</span></td><td><span class="status-dot">已知</span></td><td>—</td></tr>
      <tr style="background: var(--warning-light);"><td class="num" style="font-family: monospace;">status</td><td>varchar</td><td>订单状态枚举</td><td><span class="chip">维度</span></td><td><span style="color: var(--warning); font-weight: 600;">用户标注</span></td><td>—</td></tr>
      <tr><td rowspan="3" style="vertical-align: top; font-weight: 600;">customers</td><td class="num" style="font-family: monospace;">id</td><td>bigint</td><td>客户唯一标识</td><td><span class="chip">主键</span></td><td><span class="status-dot">已知</span></td><td>—</td></tr>
      <tr><td class="num" style="font-family: monospace;">phone</td><td>varchar</td><td>手机号</td><td><span class="chip">标识</span></td><td><span class="status-dot">已知</span></td><td><span class="badge badge-warning">脱敏</span></td></tr>
      <tr><td class="num" style="font-family: monospace;">level</td><td>int</td><td>会员等级 1-5</td><td><span class="chip">维度</span></td><td><span class="status-dot">已知</span></td><td>—</td></tr>
    </tbody>
  </table>
  <div class="card-footer">共 67 个字段，其中 4 个由用户在对话中确认 · 2 个标记为敏感需脱敏 · 完整 JSON 已生成</div>
</div>

<div style="margin-top: 24px; padding: 16px 20px; background: var(--green-lighter); border-left: 3px solid var(--green); border-radius: 8px;">
  <div style="font-size: 13px; font-weight: 600; color: var(--green-darker); margin-bottom: 6px;">✓ 准备就绪</div>
  <div style="font-size: 12px; color: var(--text-primary); line-height: 1.7;">
    Agent 已完整理解您的数据库结构。点击「确认，生成工作台」后，Agent 会基于敲定的 Schema 自主生成：5 个 KPI · 4 张图表 · 3 条主动洞察 · 1 个对话追问入口
  </div>
</div>
`;
PAGE_INIT.confirm = function() {};

function finalizeSchema() {
  markDatasourceConfigured('ecommerce_db', 'postgresql', 8);
  navigate('dashboard');
}


// ============================================================
// 8. 工作台 dashboard (Agent 自动生成)
// ============================================================
PAGES.dashboard = `
<div class="page-header">
  <div>
    <h1 class="page-title">工作台 · ecommerce_db</h1>
    <p class="page-subtitle">Agent 基于 Schema 理解自动生成 · 最近更新 14:38 · 数据源在线</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>刷新数据</button>
    <button class="btn btn-secondary btn-sm" onclick="navigate('schema')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>修订 Schema</button>
    <button class="btn btn-primary btn-sm" onclick="navigate('chat')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>问 Agent</button>
  </div>
</div>

<div style="margin-bottom: 16px; padding: 10px 14px; background: var(--green-lighter); border-left: 3px solid var(--green); border-radius: 6px; font-size: 12px; color: var(--green-darker);">
  <strong>🤖 Agent 自主生成：</strong>基于敲定的 Schema，Agent 选择了 <code>orders.total_amt</code> 作为核心指标、<code>orders.created_at</code> 作为时间字段、<code>customers.level</code> 和 <code>orders.channel</code> 作为分析维度。如需调整，点击右上角「修订 Schema」。
</div>

<div class="grid grid-5" style="margin-bottom: 24px;">
  <div class="kpi-card"><div class="kpi-label">📦 总订单数</div><div class="kpi-value num">48,237<span class="kpi-unit">单</span></div><div class="kpi-delta up">↑ 较上月 +12.4%</div></div>
  <div class="kpi-card amber"><div class="kpi-label">💰 总销售额</div><div class="kpi-value num">¥8.42<span class="kpi-unit">M</span></div><div class="kpi-delta up">↑ 较上月 +18.6%</div></div>
  <div class="kpi-card info"><div class="kpi-label">👥 客户总数</div><div class="kpi-value num">3,248<span class="kpi-unit">人</span></div><div class="kpi-delta up">↑ 新增 142</div></div>
  <div class="kpi-card orange"><div class="kpi-label">📊 客单价</div><div class="kpi-value num">¥174<span class="kpi-unit">.5</span></div><div class="kpi-delta down">↓ 较上月 -5.2%</div></div>
  <div class="kpi-card"><div class="kpi-label">✅ 完成率</div><div class="kpi-value num">68.4<span class="kpi-unit">%</span></div><div class="kpi-delta up">↑ +2.1pp</div></div>
</div>

<div class="grid grid-3" style="margin-bottom: 24px;">
  <div class="card" style="grid-column: span 2;">
    <div class="card-header">
      <div><div class="card-title">订单量与销售额趋势</div><div style="font-size:11px; color: var(--text-muted); margin-top:2px;">Agent 自动选择 created_at 按月聚合 · 近 12 个月</div></div>
      <div style="display:flex; gap:6px;"><span class="chip green">● 订单量</span><span class="chip amber">● 销售额</span></div>
    </div>
    <div class="card-body"><div id="dash-chart-1" class="chart-container"></div></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">订单渠道分布</div><span class="chip">channel 字段</span></div>
    <div class="card-body"><div id="dash-chart-2" class="chart-container"></div></div>
  </div>
</div>

<div class="grid grid-3" style="margin-bottom: 24px;">
  <div class="card">
    <div class="card-header"><div class="card-title">客户等级分布</div><span class="chip">customers.level</span></div>
    <div class="card-body"><div id="dash-chart-3" class="chart-container"></div></div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">订单状态流转</div><span class="chip green">status 字段</span></div>
    <div class="card-body" style="padding: 16px;">
      <div style="display:flex; flex-direction:column; gap: 10px;">
        <div><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>pending · 待发货</span><span class="num" style="color: var(--warning);">3,847 (8.0%)</span></div><div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px;"><div style="height:100%; width:8%; background: var(--warning); border-radius: 4px;"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>shipped · 已发货</span><span class="num" style="color: var(--info);">8,234 (17.1%)</span></div><div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px;"><div style="height:100%; width:17%; background: var(--info); border-radius: 4px;"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>delivered · 已签收</span><span class="num" style="color: var(--green-dark);">33,008 (68.4%)</span></div><div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px;"><div style="height:100%; width:68%; background: var(--green); border-radius: 4px;"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>cancelled · 已取消</span><span class="num" style="color: var(--error);">2,128 (4.4%)</span></div><div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px;"><div style="height:100%; width:4.4%; background: var(--error); border-radius: 4px;"></div></div></div>
        <div><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>refunded · 已退款</span><span class="num" style="color: var(--orange);">1,020 (2.1%)</span></div><div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px;"><div style="height:100%; width:2.1%; background: var(--orange); border-radius: 4px;"></div></div></div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">🤖 Agent 主动洞察</div><span class="badge badge-warning">3 条</span></div>
    <div class="card-body" style="padding: 12px;">
      <div style="padding:10px 12px; border-radius:6px; background: var(--error-light); border-left: 3px solid var(--error); margin-bottom: 8px;">
        <div style="font-size:12px; font-weight:600; color: var(--error); margin-bottom:4px;">🔴 客单价连续 2 月下降</div>
        <div style="font-size:11px; color: var(--text-secondary);">从 5 月 ¥184 降至 7 月 ¥174</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px; padding: 2px 6px;" onclick="navigate('insights')">详细 →</button>
      </div>
      <div style="padding:10px 12px; border-radius:6px; background: var(--warning-light); border-left: 3px solid var(--warning); margin-bottom: 8px;">
        <div style="font-size:12px; font-weight:600; color: var(--warning); margin-bottom:4px;">⚠️ app 渠道取消率上升</div>
        <div style="font-size:11px; color: var(--text-secondary);">4.4% 高于均值 3.2%</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px; padding: 2px 6px;" onclick="navigate('insights')">详细 →</button>
      </div>
      <div style="padding:10px 12px; border-radius:6px; background: var(--green-lighter); border-left: 3px solid var(--green);">
        <div style="font-size:12px; font-weight:600; color: var(--green-dark); margin-bottom:4px;">💡 VIP 复购率提升</div>
        <div style="font-size:11px; color: var(--text-secondary);">7 月复购率 38%，环比 +6pp</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px; padding: 2px 6px;" onclick="navigate('insights')">详细 →</button>
      </div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><div class="card-title">数据库结构概览（点击表名可对话分析）</div><span class="chip">8 张表 · 7 条关系</span></div>
  <div class="card-body" style="padding: 16px;">
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--green-lighter); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--green-light);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">👥</span><span style="font-size:13px; font-weight:700;">customers</span></div>
        <div style="font-size:11px; color: var(--text-muted);">3,248 行 · 9 字段</div>
        <div style="font-size:11px; color: var(--green-dark); margin-top: 4px;">核心实体</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--green-lighter); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--green-light);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">📦</span><span style="font-size:13px; font-weight:700;">orders</span></div>
        <div style="font-size:11px; color: var(--text-muted);">48,237 行 · 12 字段</div>
        <div style="font-size:11px; color: var(--green-dark); margin-top: 4px;">核心实体</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">📋</span><span style="font-size:13px; font-weight:700;">order_items</span></div>
        <div style="font-size:11px; color: var(--text-muted);">98,432 行 · 7 字段</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">🛍️</span><span style="font-size:13px; font-weight:700;">products</span></div>
        <div style="font-size:11px; color: var(--text-muted);">486 行 · 11 字段</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">🏷️</span><span style="font-size:13px; font-weight:700;">categories</span></div>
        <div style="font-size:11px; color: var(--text-muted);">24 行 · 字典表</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">💳</span><span style="font-size:13px; font-weight:700;">payments</span></div>
        <div style="font-size:11px; color: var(--text-muted);">45,821 行 · 8 字段</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">🚚</span><span style="font-size:13px; font-weight:700;">shipping</span></div>
        <div style="font-size:11px; color: var(--text-muted);">12,847 行 · 10 字段</div>
      </div>
      <div onclick="navigate('chat')" style="padding: 14px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><span style="font-size: 18px;">⭐</span><span style="font-size:13px; font-weight:700;">reviews</span></div>
        <div style="font-size:11px; color: var(--text-muted);">8,234 行 · 6 字段</div>
      </div>
    </div>
  </div>
</div>
`;
PAGE_INIT.dashboard = function() {
  const c1 = echarts.init(document.getElementById('dash-chart-1'));
  const months = ['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07'];
  c1.setOption({
    tooltip: { trigger: 'axis' }, legend: { show: false },
    grid: { left: 50, right: 60, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: months, axisLine: { lineStyle: { color: '#E5DFD2' } }, axisLabel: { color: '#9C968A', fontSize: 10 } },
    yAxis: [
      { type: 'value', name: '订单量', nameTextStyle: { color: '#9C968A', fontSize: 11 }, axisLine: { show: false }, splitLine: { lineStyle: { color: '#F4F2EC' } }, axisLabel: { color: '#9C968A', fontSize: 11 } },
      { type: 'value', name: '销售额(万)', nameTextStyle: { color: '#9C968A', fontSize: 11 }, axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: '#9C968A', fontSize: 11 } }
    ],
    series: [
      { name: '订单量', type: 'bar', data: [2840,3120,3580,3940,4280,3820,3240,3680,4120,4480,4290,4823], itemStyle: { color: '#5BA888', borderRadius: [3,3,0,0] }, barWidth: 14 },
      { name: '销售额', type: 'line', smooth: true, yAxisIndex: 1, data: [52,58,67,72,78,68,58,65,72,82,71,84], itemStyle: { color: '#D4A06D' }, lineStyle: { width: 2.5 } }
    ]
  });
  const c2 = echarts.init(document.getElementById('dash-chart-2'));
  c2.setOption({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: 10, top: 'center', textStyle: { color: '#6B665C', fontSize: 11 } },
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['40%', '50%'], data: [{value:52,name:'app',itemStyle:{color:'#5BA888'}},{value:28,name:'web',itemStyle:{color:'#D4A06D'}},{value:14,name:'wap',itemStyle:{color:'#6B95B8'}},{value:6,name:'mini',itemStyle:{color:'#C6866A'}}], label: { color: '#2D2A24', fontSize: 11 }, itemStyle: { borderColor: '#FAFAF7', borderWidth: 2 } }]
  });
  const c3 = echarts.init(document.getElementById('dash-chart-3'));
  c3.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 50, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: ['L1','L2','L3','L4','L5'], axisLine: { lineStyle: { color: '#E5DFD2' } }, axisLabel: { color: '#6B665C', fontSize: 11 } },
    yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: '#F4F2EC' } }, axisLabel: { color: '#9C968A', fontSize: 11 } },
    series: [{ type: 'bar', data: [{value:1248,itemStyle:{color:'#9C968A'}},{value:892,itemStyle:{color:'#6B95B8'}},{value:684,itemStyle:{color:'#D4A06D'}},{value:312,itemStyle:{color:'#5BA888'}},{value:112,itemStyle:{color:'#2D6B53'}}], barWidth: 28, label: { show: true, position: 'top', color: '#2D2A24', fontSize: 11 }, itemStyle: { borderRadius: [4,4,0,0] } }]
  });
  window.addEventListener('resize', () => { c1.resize(); c2.resize(); c3.resize(); });
};


// ============================================================
// 9. 对话追问页 chat
// ============================================================
PAGES.chat = `
<div class="page-header" style="margin-bottom: 16px;">
  <div><h1 class="page-title">对话追问 · 基于已确认的 Schema</h1><p class="page-subtitle">Agent 已完整理解数据库 · 可问任何问题 · SQL 自动生成</p></div>
</div>

<div style="display: flex; gap: 16px; height: calc(100vh - 56px - 48px - 60px);">
  <div style="width: 240px; display: flex; flex-direction: column; gap: 12px;">
    <div class="card" style="padding: 14px;">
      <div style="font-size:12px; font-weight:600; margin-bottom: 10px; color: var(--text-secondary);">💡 推荐提问</div>
      <div style="display:flex; flex-direction:column; gap: 6px;">
        <button class="btn btn-secondary btn-sm" style="justify-content: flex-start; text-align: left; white-space: normal;">📦 本月销售额 Top 5 商品</button>
        <button class="btn btn-secondary btn-sm" style="justify-content: flex-start; text-align: left; white-space: normal;">👥 哪些客户 3 个月没下单了</button>
        <button class="btn btn-secondary btn-sm" style="justify-content: flex-start; text-align: left; white-space: normal;">📈 各渠道转化率对比</button>
        <button class="btn btn-secondary btn-sm" style="justify-content: flex-start; text-align: left; white-space: normal;">💸 退款率最高的商品类目</button>
        <button class="btn btn-secondary btn-sm" style="justify-content: flex-start; text-align: left; white-space: normal;">🎯 VIP 客户的复购周期</button>
      </div>
    </div>
    <div class="card" style="padding: 14px; flex: 1; overflow-y: auto;">
      <div style="font-size:12px; font-weight:600; margin-bottom: 10px; color: var(--text-secondary);">🗂️ 可用表</div>
      <div style="font-size: 11px; color: var(--text-muted); line-height: 1.8;">
        <div style="color: var(--green-dark); font-weight: 600;">👥 customers</div><div style="padding-left: 8px;">客户表 · 9 字段</div>
        <div style="color: var(--green-dark); font-weight: 600; margin-top: 6px;">📦 orders</div><div style="padding-left: 8px;">订单表 · 12 字段</div>
        <div style="color: var(--text-secondary); font-weight: 600; margin-top: 6px;">📋 order_items</div><div style="padding-left: 8px;">明细 · 7 字段</div>
        <div style="color: var(--text-secondary); font-weight: 600; margin-top: 6px;">🛍️ products</div><div style="padding-left: 8px;">商品 · 11 字段</div>
        <div style="color: var(--text-secondary); margin-top: 6px;">+ 4 张其他表</div>
      </div>
    </div>
  </div>

  <div class="card" style="flex: 1; display: flex; flex-direction: column; min-width: 0;">
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 8px;">
      <span class="badge badge-success">● Schema 已确认</span>
      <span style="font-size: 12px; color: var(--text-muted);">基于 8 张表 · 67 字段 · 7 关系</span>
    </div>
    <div style="flex: 1; overflow-y: auto; padding: 20px 24px;">
      <div class="review-message"><div class="review-avatar user">李</div><div style="flex: 1; min-width: 0;"><div class="review-bubble" style="background: var(--green-lighter); border-top-right-radius: 4px;">本月销售额 Top 5 商品是哪些？顺便告诉我它们的退货率</div></div></div>
      <div class="review-message"><div class="review-avatar ai">AI</div><div style="flex: 1; min-width: 0;">
        <div class="review-bubble">好的，我会从 <code>order_items</code> 关联 <code>products</code> 和 <code>orders</code> 表查询本月销售额 Top 5 商品，并计算各自的退货率。</div>
        <div class="schema-field-card" style="margin-top: 10px;">
          <div class="schema-field-row" style="background: var(--bg-tertiary); font-weight: 600; color: var(--text-secondary); font-size: 11px;"><span style="grid-column: span 4;">🔧 调用工具：query_data · 执行 SQL</span></div>
          <div style="padding: 10px 12px; font-family: 'SF Mono', Menlo, monospace; font-size: 11px; line-height: 1.7; color: var(--text-secondary); background: var(--bg-primary);">
SELECT p.name, p.category_id,<br>
&nbsp;&nbsp;SUM(oi.qty * oi.unit_price) AS sales,<br>
&nbsp;&nbsp;COUNT(DISTINCT o.id) AS orders,<br>
&nbsp;&nbsp;SUM(CASE WHEN o.status='refunded' THEN 1 ELSE 0 END)::float / COUNT(*) AS refund_rate<br>
FROM order_items oi<br>
JOIN orders o ON oi.order_id = o.id<br>
JOIN products p ON oi.product_id = p.id<br>
WHERE o.created_at >= '2026-07-01'<br>
GROUP BY p.id, p.name, p.category_id<br>
ORDER BY sales DESC<br>
LIMIT 5;<br>
<span style="color: var(--green-dark);">→ 返回 5 行 · 耗时 286ms</span>
          </div>
        </div>
        <div class="schema-field-card" style="margin-top: 10px;">
          <div class="schema-field-row" style="background: var(--bg-tertiary); font-weight: 600; color: var(--text-secondary); font-size: 11px;"><span style="grid-column: span 4;">📊 查询结果</span></div>
          <table class="table" style="font-size: 12px;">
            <thead><tr><th>商品名</th><th>销售额</th><th>订单数</th><th>退货率</th></tr></thead>
            <tbody>
              <tr><td>无线蓝牙耳机 Pro</td><td class="num">¥184,320</td><td class="num">1,247</td><td class="num" style="color: var(--green-dark);">2.1%</td></tr>
              <tr><td>智能手表 Series 6</td><td class="num">¥156,840</td><td class="num">892</td><td class="num" style="color: var(--warning);">4.8%</td></tr>
              <tr><td>便携充电宝 20000mAh</td><td class="num">¥98,720</td><td class="num">2,148</td><td class="num" style="color: var(--green-dark);">1.2%</td></tr>
              <tr><td>机械键盘 RGB</td><td class="num">¥87,460</td><td class="num">684</td><td class="num" style="color: var(--error);">7.4%</td></tr>
              <tr><td>USB-C 集线器</td><td class="num">¥72,180</td><td class="num">1,832</td><td class="num" style="color: var(--green-dark);">0.8%</td></tr>
            </tbody>
          </table>
        </div>
        <div class="review-bubble" style="margin-top: 12px;">
          <strong>📊 Top 5 商品分析：</strong><br>
          • 销售额冠军「无线蓝牙耳机 Pro」¥18.4 万，退货率仅 2.1%<br>
          • <span style="color: var(--error); font-weight: 600;">⚠️「机械键盘 RGB」退货率高达 7.4%</span>，建议排查质量问题<br>
          • 「USB-C 集线器」走量为主，退货率 0.8%<br><br>
          需要我深入分析「机械键盘 RGB」的退货原因吗？
        </div>
      </div></div>
    </div>
    <div style="border-top: 1px solid var(--border-light); padding: 12px 16px; display: flex; gap: 8px; align-items: flex-end;">
      <textarea class="review-input" placeholder="基于已确认的 Schema，问任何问题..." style="flex: 1;">深入分析「机械键盘 RGB」的退货原因</textarea>
      <button class="btn btn-primary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>发送</button>
    </div>
  </div>
</div>
`;
PAGE_INIT.chat = function() {};


// ============================================================
// 10. 主动洞察页 insights
// ============================================================
PAGES.insights = `
<div class="page-header">
  <div><h1 class="page-title">主动洞察 · Agent 自主发现</h1><p class="page-subtitle">Agent 每日定时巡检 · 共 3 条今日洞察</p></div>
  <div class="page-actions">
    <select class="input"><option>今日</option><option>本周</option><option>本月</option></select>
    <button class="btn btn-secondary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><circle cx="5" cy="12" r="3"/></svg>配置巡检</button>
  </div>
</div>

<div class="card" style="margin-bottom: 16px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between;">
  <div style="display: flex; align-items: center; gap: 12px;">
    <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--green-lighter); color: var(--green-dark); display: flex; align-items: center; justify-content: center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
    <div><div style="font-size: 13px; font-weight: 600;">今日巡检已完成</div><div style="font-size: 11px; color: var(--text-muted);">14:00 触发 · 耗时 47s · 检查 12 项指标</div></div>
  </div>
  <div style="display: flex; gap: 6px;"><span class="badge badge-error">1 风险</span><span class="badge badge-warning">1 异常</span><span class="badge badge-success">1 机会</span></div>
</div>

<div style="display: flex; flex-direction: column; gap: 16px;">
  <div class="card">
    <div class="card-header" style="background: var(--error-light);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">🔴</span>
        <div><div class="card-title" style="color: var(--error);">客单价连续 2 月下降</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">风险 · 严重度 高 · 置信度 92%</div></div>
      </div>
      <div style="display: flex; gap: 6px;"><button class="btn btn-ghost btn-sm">标记已处理</button><button class="btn btn-ghost btn-sm">屏蔽此类</button></div>
    </div>
    <div class="card-body">
      <p style="font-size: 13px; color: var(--text-primary); line-height: 1.7; margin: 0 0 12px;">Agent 在分析 <code>orders.total_amt</code> 时序数据时发现：客单价从 2026-05 的 ¥184.2 持续下降至 2026-07 的 ¥174.5，下降 5.2%。进一步关联 <code>customers.level</code> 发现，下降主因是 <strong>L1 新客户占比从 38% 上升至 52%</strong>。</p>
      <div style="background: var(--bg-secondary); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">🔍 Agent 探索过程</div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.7; font-family: 'SF Mono', Menlo, monospace;">
1. 检测 total_amt 时序异常 → 发现连续下降<br>
2. 假设 1：季节性？→ 对比去年同期，排除<br>
3. 假设 2：品类结构变化？→ 各品类占比稳定，排除<br>
4. 假设 3：客户结构变化？→ 关联 customers.level，命中！<br>
5. 验证：L1 占比上升 14pp，符合降幅
        </div>
      </div>
      <div style="background: var(--green-lighter); border-left: 3px solid var(--green); border-radius: 6px; padding: 10px 14px; font-size: 12px;">
        <strong style="color: var(--green-darker);">💡 Agent 建议：</strong>
        <span style="color: var(--text-primary);">1) 排查 5-6 月是否有大规模拉新活动；2) 评估 L1 → L2 转化路径；3) 监控 8 月客单价是否企稳。</span>
      </div>
    </div>
    <div class="card-footer" style="display: flex; justify-content: space-between;">
      <span>发现时间：2026-07-14 14:00 · 涉及表：orders, customers</span>
      <button class="btn btn-ghost btn-sm" onclick="navigate('chat')">深入对话分析 →</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header" style="background: var(--warning-light);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">⚠️</span>
        <div><div class="card-title" style="color: var(--warning);">app 渠道取消率异常上升</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">异常 · 严重度 中 · 置信度 87%</div></div>
      </div>
      <div style="display: flex; gap: 6px;"><button class="btn btn-ghost btn-sm">标记已处理</button><button class="btn btn-ghost btn-sm">屏蔽此类</button></div>
    </div>
    <div class="card-body">
      <p style="font-size: 13px; color: var(--text-primary); line-height: 1.7; margin: 0 0 12px;">Agent 在分析 <code>orders</code> 表 <code>status='cancelled'</code> 分布时发现：app 渠道本月取消率 6.8%，远高于历史均值 3.2%（2.3σ 异常）。其他渠道正常。</p>
      <div style="background: var(--green-lighter); border-left: 3px solid var(--green); border-radius: 6px; padding: 10px 14px; font-size: 12px;">
        <strong style="color: var(--green-darker);">💡 Agent 建议：</strong>
        <span style="color: var(--text-primary);">1) 核查 app 7.10 版本下单流程日志；2) 临时给「机械键盘 RGB」加风险提示；3) 联系取消订单客户了解原因。</span>
      </div>
    </div>
    <div class="card-footer" style="display: flex; justify-content: space-between;">
      <span>发现时间：2026-07-14 14:00 · 涉及表：orders</span>
      <button class="btn btn-ghost btn-sm" onclick="navigate('chat')">深入对话分析 →</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header" style="background: var(--green-lighter);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">💡</span>
        <div><div class="card-title" style="color: var(--green-dark);">VIP 客户复购率显著提升</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">机会 · 严重度 低 · 置信度 95%</div></div>
      </div>
      <div style="display: flex; gap: 6px;"><button class="btn btn-ghost btn-sm">标记已处理</button><button class="btn btn-ghost btn-sm">屏蔽此类</button></div>
    </div>
    <div class="card-body">
      <p style="font-size: 13px; color: var(--text-primary); line-height: 1.7; margin: 0 0 12px;">Agent 在分析 <code>customers.level IN (4,5)</code> 客户复购行为时发现：7 月 VIP 客户复购率达 38%，较上月 32% 提升 6 个百分点。可能与 6 月底推出的「会员专享日」活动相关。</p>
      <div style="background: var(--green-lighter); border-left: 3px solid var(--green); border-radius: 6px; padding: 10px 14px; font-size: 12px;">
        <strong style="color: var(--green-darker);">💡 Agent 建议：</strong>
        <span style="color: var(--text-primary);">1) 复盘活动 ROI；2) 提取复购 VIP 偏好品类；3) 考虑下沉到 L3 做 A/B 测试。</span>
      </div>
    </div>
    <div class="card-footer" style="display: flex; justify-content: space-between;">
      <span>发现时间：2026-07-14 14:00 · 涉及表：orders, customers</span>
      <button class="btn btn-ghost btn-sm" onclick="navigate('chat')">深入对话分析 →</button>
    </div>
  </div>
</div>
`;
PAGE_INIT.insights = function() {};


// ============================================================
// 11. Schema 修订入口 schema
// ============================================================
PAGES.schema = `
<div class="page-header">
  <div><h1 class="page-title">Schema 修订 · 重新进入对话</h1><p class="page-subtitle">数据库结构变化或 Agent 理解有误时，可重新进入纠错对话</p></div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>导出 JSON</button>
    <button class="btn btn-primary btn-sm" onclick="navigate('schema-review')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>进入纠错对话</button>
  </div>
</div>

<div class="card" style="margin-bottom: 16px;">
  <div class="card-header"><div class="card-title">当前 Schema 理解（2026-07-14 14:32 敲定）</div><span class="badge badge-success">已确认</span></div>
  <div class="card-body" style="padding: 16px;">
    <div class="grid grid-4">
      <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: 10px;"><div class="num" style="font-size: 28px; font-weight: 700; color: var(--green-dark);">8</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">业务表</div></div>
      <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: 10px;"><div class="num" style="font-size: 28px; font-weight: 700; color: var(--green-dark);">67</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">字段总数</div></div>
      <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: 10px;"><div class="num" style="font-size: 28px; font-weight: 700; color: var(--green-dark);">7</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">表关系</div></div>
      <div style="text-align: center; padding: 16px; background: var(--bg-secondary); border-radius: 10px;"><div class="num" style="font-size: 28px; font-weight: 700; color: var(--warning);">2</div><div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">敏感字段</div></div>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header"><div class="card-title">修订入口</div></div>
  <div class="card-body" style="padding: 20px;">
    <div class="grid grid-3">
      <div onclick="navigate('schema-review')" style="padding: 20px; background: var(--green-lighter); border-radius: 10px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--green-light);">
        <div style="font-size: 24px; margin-bottom: 8px;">💬</div>
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">进入纠错对话</div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.6;">与 Agent 对话，修正字段理解或补充业务上下文。保留已有探索结果，只修正有问题的部分。</div>
      </div>
      <div style="padding: 20px; background: var(--bg-secondary); border-radius: 10px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="font-size: 24px; margin-bottom: 8px;">🔄</div>
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">完全重新探索</div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.6;">清空已有理解，从零开始探索。适用于数据库结构大规模重构后的场景。</div>
      </div>
      <div style="padding: 20px; background: var(--bg-secondary); border-radius: 10px; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border);">
        <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">手动编辑 JSON</div>
        <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.6;">直接编辑 Schema 理解的 JSON 配置，适用于高级用户或批量修改。</div>
      </div>
    </div>
  </div>
</div>
`;
PAGE_INIT.schema = function() {};


// ============================================================
// 12. 探索历史 history
// ============================================================
PAGES.history = `
<div class="page-header"><div><h1 class="page-title">探索历史</h1><p class="page-subtitle">所有数据源接入与 Schema 修订记录</p></div></div>
<div class="card">
  <table class="table">
    <thead><tr><th>时间</th><th>事件</th><th>数据源</th><th>详情</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      <tr><td class="num" style="font-size:12px;">2026-07-14 14:32</td><td><span class="badge badge-success">首次接入</span></td><td>ecommerce_db</td><td>发现 8 张表 · 67 字段 · 用户确认 4 字段</td><td><span class="status-dot">完成</span></td><td><button class="btn btn-ghost btn-sm">查看</button></td></tr>
      <tr><td class="num" style="font-size:12px;">2026-07-14 14:30</td><td><span class="chip">连接测试</span></td><td>ecommerce_db</td><td>postgresql://192.168.1.100:5432 · 延迟 18ms</td><td><span class="status-dot">成功</span></td><td>—</td></tr>
      <tr><td class="num" style="font-size:12px;">2026-07-12 10:15</td><td><span class="badge badge-warning">Schema 修订</span></td><td>test_db (已删除)</td><td>用户修正 2 个字段含义</td><td><span class="status-dot">完成</span></td><td><button class="btn btn-ghost btn-sm">查看</button></td></tr>
      <tr><td class="num" style="font-size:12px;">2026-07-10 09:48</td><td><span class="badge badge-success">首次接入</span></td><td>test_db (已删除)</td><td>发现 3 张表 · 18 字段</td><td><span class="status-dot">完成</span></td><td><button class="btn btn-ghost btn-sm">查看</button></td></tr>
    </tbody>
  </table>
</div>
`;
PAGE_INIT.history = function() {};


// ============================================================
// 13. 模型配置 llm-config (管理员可见)
// ============================================================
PAGES['llm-config'] = `
<div class="page-header">
  <div><h1 class="page-title">模型配置</h1><p class="page-subtitle">配置 LLM API Key 与模型选择 · 仅管理员可见</p></div>
  <div class="page-actions"><span class="badge badge-warning">管理员专属</span></div>
</div>

<div class="tabs">
  <div class="tab active">Provider 配置</div>
  <div class="tab">默认模型</div>
  <div class="tab">Token 配额</div>
  <div class="tab">调用日志</div>
</div>

<!-- Provider 列表 -->
<div class="grid grid-3" style="margin-bottom: 24px;">
  <div class="card">
    <div class="card-header">
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px; height:28px; border-radius:6px; background:var(--info-light); color:var(--info); display:flex; align-items:center; justify-content:center; font-size:14px;">🤖</div>
        <div><div class="card-title">OpenAI</div><div style="font-size:11px; color:var(--text-muted);">gpt-4o / gpt-4o-mini</div></div>
      </div>
      <span class="badge badge-success">已配置</span>
    </div>
    <div class="card-body" style="padding: 16px;">
      <div style="margin-bottom: 12px;">
        <label class="input-label">API Key</label>
        <input class="input" type="password" value="sk-proj-xxxxxxxxxxxxxxxxxxxx">
      </div>
      <div style="margin-bottom: 12px;">
        <label class="input-label">Base URL（可选）</label>
        <input class="input" placeholder="https://api.openai.com/v1" value="https://api.openai.com/v1">
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-secondary btn-sm" style="flex:1;">测试连接</button>
        <button class="btn btn-primary btn-sm" style="flex:1;">保存</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px; height:28px; border-radius:6px; background:var(--warning-light); color:var(--warning); display:flex; align-items:center; justify-content:center; font-size:14px;">🧠</div>
        <div><div class="card-title">Anthropic</div><div style="font-size:11px; color:var(--text-muted);">claude-3-5-sonnet / haiku</div></div>
      </div>
      <span class="badge">未配置</span>
    </div>
    <div class="card-body" style="padding: 16px;">
      <div style="margin-bottom: 12px;">
        <label class="input-label">API Key</label>
        <input class="input" type="password" placeholder="sk-ant-xxxxxxxxxxxx">
      </div>
      <div style="margin-bottom: 12px;">
        <label class="input-label">Base URL（可选）</label>
        <input class="input" placeholder="https://api.anthropic.com">
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-secondary btn-sm" style="flex:1;" disabled>测试连接</button>
        <button class="btn btn-primary btn-sm" style="flex:1;">保存</button>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:28px; height:28px; border-radius:6px; background:var(--green-lighter); color:var(--green-dark); display:flex; align-items:center; justify-content:center; font-size:14px;">🏠</div>
        <div><div class="card-title">本地 LLM</div><div style="font-size:11px; color:var(--text-muted);">Qwen / Llama (私有部署)</div></div>
      </div>
      <span class="badge">未配置</span>
    </div>
    <div class="card-body" style="padding: 16px;">
      <div style="margin-bottom: 12px;">
        <label class="input-label">服务地址</label>
        <input class="input" placeholder="http://localhost:11434/v1">
      </div>
      <div style="margin-bottom: 12px;">
        <label class="input-label">模型名</label>
        <input class="input" placeholder="qwen2.5-72b-instruct">
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-secondary btn-sm" style="flex:1;">测试连接</button>
        <button class="btn btn-primary btn-sm" style="flex:1;">保存</button>
      </div>
    </div>
  </div>
</div>

<!-- 默认模型选择 -->
<div class="card" style="margin-bottom: 16px;">
  <div class="card-header"><div class="card-title">默认模型选择</div></div>
  <div class="card-body" style="padding: 20px;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div>
        <label class="input-label">Schema 理解模型（消耗较多 Token）</label>
        <select class="input">
          <option>gpt-4o (推荐 · 准确率高)</option>
          <option>gpt-4o-mini (省钱)</option>
          <option>claude-3-5-sonnet</option>
          <option>qwen2.5-72b (本地)</option>
        </select>
        <div style="font-size:11px; color: var(--text-muted); margin-top: 4px;">用于：字段语义推断 · 表关系识别 · 提问生成</div>
      </div>
      <div>
        <label class="input-label">对话分析模型（高频调用）</label>
        <select class="input">
          <option>gpt-4o-mini (推荐 · 性价比高)</option>
          <option>gpt-4o</option>
          <option>claude-3-5-haiku</option>
          <option>qwen2.5-72b (本地)</option>
        </select>
        <div style="font-size:11px; color: var(--text-muted); margin-top: 4px;">用于：NL2SQL · 对话追问 · 洞察生成</div>
      </div>
    </div>

    <div style="margin-top: 20px; padding: 14px 16px; background: var(--bg-secondary); border-radius: 8px;">
      <div style="font-size: 12px; font-weight: 600; margin-bottom: 10px;">高级参数</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
        <div>
          <label class="input-label">Temperature</label>
          <input class="input" value="0.3" type="number" step="0.1" min="0" max="2">
        </div>
        <div>
          <label class="input-label">Max Tokens</label>
          <input class="input" value="4096" type="number">
        </div>
        <div>
          <label class="input-label">Timeout (秒)</label>
          <input class="input" value="60" type="number">
        </div>
      </div>
    </div>
  </div>
</div>

<!-- 安全提示 -->
<div style="padding: 14px 16px; background: var(--error-light); border-left: 3px solid var(--error); border-radius: 8px; font-size: 12px; color: var(--error);">
  🔒 <strong>API Key 安全：</strong>所有 API Key 加密存储于本地数据库，不会上传到任何第三方服务。建议使用只读 API Key，并设置月度消费上限（OpenAI 后台可配置）。
</div>
`;
PAGE_INIT['llm-config'] = function() {};


// ============================================================
// 14. 用户管理 users (管理员可见)
// ============================================================
PAGES.users = `
<div class="page-header">
  <div><h1 class="page-title">用户管理</h1><p class="page-subtitle">管理平台用户 · 仅管理员可见</p></div>
  <div class="page-actions">
    <input class="input" placeholder="搜索用户..." style="width: 200px;">
    <button class="btn btn-primary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>添加用户</button>
  </div>
</div>

<div class="grid grid-4" style="margin-bottom: 24px;">
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">用户总数</div><div class="num" style="font-size:22px; font-weight:700;">5</div></div>
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">管理员</div><div class="num" style="font-size:22px; font-weight:700;">1</div></div>
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">分析师</div><div class="num" style="font-size:22px; font-weight:700;">3</div></div>
  <div class="card" style="padding: 16px;"><div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">查看者</div><div class="num" style="font-size:22px; font-weight:700;">1</div></div>
</div>

<div class="card">
  <table class="table">
    <thead><tr><th>用户</th><th>角色</th><th>数据源权限</th><th>最近登录</th><th>状态</th><th>操作</th></tr></thead>
    <tbody>
      <tr>
        <td><div style="display:flex; align-items:center; gap:10px;"><div class="user-avatar" style="width:32px; height:32px;">李</div><div><div style="font-weight:600;">李伟明</div><div style="font-size:11px; color:var(--text-muted);">li.weiming@example.com</div></div></div></td>
        <td><span class="badge badge-success">管理员</span></td>
        <td><span class="chip">全部数据源</span></td>
        <td class="num" style="font-size:12px;">2 分钟前</td>
        <td><span class="status-dot">已激活</span></td>
        <td><button class="btn btn-ghost btn-sm">编辑</button></td>
      </tr>
      <tr>
        <td><div style="display:flex; align-items:center; gap:10px;"><div class="user-avatar" style="width:32px; height:32px; background: linear-gradient(135deg, var(--info), #4A7BA3);">陈</div><div><div style="font-weight:600;">陈军</div><div style="font-size:11px; color:var(--text-muted);">chen.jun@example.com</div></div></div></td>
        <td><span class="badge badge-info">分析师</span></td>
        <td><span class="chip">ecommerce_db</span></td>
        <td class="num" style="font-size:12px;">1 小时前</td>
        <td><span class="status-dot">已激活</span></td>
        <td><button class="btn btn-ghost btn-sm">编辑</button></td>
      </tr>
      <tr>
        <td><div style="display:flex; align-items:center; gap:10px;"><div class="user-avatar" style="width:32px; height:32px; background: linear-gradient(135deg, var(--amber), var(--orange));">王</div><div><div style="font-weight:600;">王芳</div><div style="font-size:11px; color:var(--text-muted);">wang.fang@example.com</div></div></div></td>
        <td><span class="badge badge-info">分析师</span></td>
        <td><span class="chip">ecommerce_db</span></td>
        <td class="num" style="font-size:12px;">3 小时前</td>
        <td><span class="status-dot">已激活</span></td>
        <td><button class="btn btn-ghost btn-sm">编辑</button></td>
      </tr>
      <tr>
        <td><div style="display:flex; align-items:center; gap:10px;"><div class="user-avatar" style="width:32px; height:32px; background: linear-gradient(135deg, var(--green), var(--green-dark));">张</div><div><div style="font-weight:600;">张涛</div><div style="font-size:11px; color:var(--text-muted);">zhang.tao@example.com</div></div></div></td>
        <td><span class="badge badge-info">分析师</span></td>
        <td><span class="chip">ecommerce_db</span></td>
        <td class="num" style="font-size:12px;">昨天</td>
        <td><span class="status-dot">已激活</span></td>
        <td><button class="btn btn-ghost btn-sm">编辑</button></td>
      </tr>
      <tr>
        <td><div style="display:flex; align-items:center; gap:10px;"><div class="user-avatar" style="width:32px; height:32px; background: linear-gradient(135deg, var(--text-muted), var(--text-secondary));">周</div><div><div style="font-weight:600;">周明</div><div style="font-size:11px; color:var(--text-muted);">zhou.ming@example.com</div></div></div></td>
        <td><span class="badge badge-warning">查看者</span></td>
        <td><span class="chip">ecommerce_db (只读)</span></td>
        <td class="num" style="font-size:12px;">7 月 10 日</td>
        <td><span class="status-dot muted">已停用</span></td>
        <td><button class="btn btn-ghost btn-sm">编辑</button></td>
      </tr>
    </tbody>
  </table>
</div>
`;
PAGE_INIT.users = function() {};


// ============================================================
// 15. 角色权限 roles (管理员可见)
// ============================================================
PAGES.roles = `
<div class="page-header">
  <div><h1 class="page-title">角色权限</h1><p class="page-subtitle">3 个预置角色 · 权限点矩阵 · 仅管理员可见</p></div>
  <div class="page-actions"><button class="btn btn-primary btn-sm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>创建自定义角色</button></div>
</div>

<div class="grid grid-3" style="margin-bottom: 24px;">
  <div class="card">
    <div class="card-header"><div style="display:flex; align-items:center; gap:8px;"><span class="card-title">管理员</span><span class="badge badge-success">系统</span></div><span class="chip">1 人</span></div>
    <div class="card-body">
      <p style="font-size:12px; color:var(--text-secondary); margin:0 0 12px;">平台最高权限，可管理数据源、用户、模型配置。首个注册用户自动成为管理员。</p>
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        <span class="chip green">全部权限</span><span class="chip green">用户管理</span><span class="chip green">模型配置</span><span class="chip green">数据源管理</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div style="display:flex; align-items:center; gap:8px;"><span class="card-title">分析师</span><span class="badge badge-info">系统</span></div><span class="chip">3 人</span></div>
    <div class="card-body">
      <p style="font-size:12px; color:var(--text-secondary); margin:0 0 12px;">可连接数据源、对话分析、查看洞察。不能管理用户或配置模型。</p>
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        <span class="chip green">对话分析</span><span class="chip green">工作台</span><span class="chip green">主动洞察</span><span class="chip">数据源(指定)</span><span class="chip amber">无管理权限</span>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div style="display:flex; align-items:center; gap:8px;"><span class="card-title">查看者</span><span class="badge badge-warning">系统</span></div><span class="chip">1 人</span></div>
    <div class="card-body">
      <p style="font-size:12px; color:var(--text-secondary); margin:0 0 12px;">只读权限，只能查看已生成的工作台与洞察，不能对话或修改。</p>
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        <span class="chip">工作台(只读)</span><span class="chip">洞察(只读)</span><span class="chip amber">无对话权限</span><span class="chip amber">无导出权限</span>
      </div>
    </div>
  </div>
</div>

<!-- 权限点矩阵 -->
<div class="card">
  <div class="card-header"><div class="card-title">权限点矩阵</div><button class="btn btn-ghost btn-sm">导出配置</button></div>
  <table class="perm-matrix">
    <thead>
      <tr><th>权限点</th><th>管理员</th><th>分析师</th><th>查看者</th></tr>
    </thead>
    <tbody>
      <tr><td>查看工作台</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox" checked></td></tr>
      <tr><td>对话追问</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>查看主动洞察</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox" checked></td></tr>
      <tr><td>标记/屏蔽洞察</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>连接数据源</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>Schema 修订</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>导出报告</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox" checked></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>用户管理</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox"></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>角色权限管理</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox"></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>模型配置</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox"></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
      <tr><td>查看审计日志</td><td><input type="checkbox" class="perm-checkbox" checked disabled></td><td><input type="checkbox" class="perm-checkbox"></td><td><input type="checkbox" class="perm-checkbox"></td></tr>
    </tbody>
  </table>
  <div class="card-footer">
    <button class="btn btn-primary btn-sm">保存权限配置</button>
    <span style="margin-left: 12px;">修改权限后会立即生效，影响所有该角色用户</span>
  </div>
</div>
`;
PAGE_INIT.roles = function() {};


// ============================================================
// 16. 个人设置 profile
// ============================================================
PAGES.profile = `
<div class="page-header"><div><h1 class="page-title">个人设置</h1><p class="page-subtitle">管理你的账号信息</p></div></div>

<div class="grid grid-2">
  <div class="card">
    <div class="card-header"><div class="card-title">基本信息</div></div>
    <div class="card-body" style="padding: 20px;">
      <div style="display:flex; align-items:center; gap:16px; margin-bottom: 20px;">
        <div class="user-avatar" style="width: 64px; height: 64px; font-size: 24px;">李</div>
        <div>
          <button class="btn btn-secondary btn-sm">更换头像</button>
          <div style="font-size:11px; color: var(--text-muted); margin-top: 6px;">JPG/PNG · 最大 2MB</div>
        </div>
      </div>
      <div style="margin-bottom: 14px;">
        <label class="input-label">姓名</label>
        <input class="input" value="李伟明">
      </div>
      <div style="margin-bottom: 14px;">
        <label class="input-label">邮箱</label>
        <input class="input" value="li.weiming@example.com" disabled>
        <div style="font-size:11px; color: var(--text-muted); margin-top: 4px;">邮箱不可修改</div>
      </div>
      <div style="margin-bottom: 14px;">
        <label class="input-label">角色</label>
        <input class="input" value="管理员" disabled>
      </div>
      <button class="btn btn-primary btn-sm">保存修改</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><div class="card-title">修改密码</div></div>
    <div class="card-body" style="padding: 20px;">
      <div style="margin-bottom: 14px;">
        <label class="input-label">当前密码</label>
        <input class="input" type="password" placeholder="••••••••">
      </div>
      <div style="margin-bottom: 14px;">
        <label class="input-label">新密码</label>
        <input class="input" type="password" placeholder="至少 8 位，含大小写字母和数字">
      </div>
      <div style="margin-bottom: 14px;">
        <label class="input-label">确认新密码</label>
        <input class="input" type="password" placeholder="再次输入新密码">
      </div>
      <button class="btn btn-primary btn-sm">修改密码</button>
    </div>
  </div>

  <div class="card" style="grid-column: span 2;">
    <div class="card-header"><div class="card-title">会话与安全</div></div>
    <div class="card-body" style="padding: 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid var(--border-light);">
        <div><div style="font-size:13px; font-weight:600;">双因素认证</div><div style="font-size:11px; color:var(--text-muted); margin-top:2px;">使用 TOTP 应用增强账号安全</div></div>
        <div class="switch"><div class="switch-track"><div class="switch-thumb"></div></div></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0; border-bottom: 1px solid var(--border-light);">
        <div><div style="font-size:13px; font-weight:600;">登录通知</div><div style="font-size:11px; color:var(--text-muted); margin-top:2px;">异地登录时邮件通知</div></div>
        <div class="switch"><div class="switch-track on"><div class="switch-thumb"></div></div></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px 0;">
        <div><div style="font-size:13px; font-weight:600; color: var(--error);">退出所有会话</div><div style="font-size:11px; color:var(--text-muted); margin-top:2px;">强制下线所有设备</div></div>
        <button class="btn btn-danger btn-sm">退出</button>
      </div>
    </div>
  </div>
</div>
`;
PAGE_INIT.profile = function() {
  // 开关交互
  document.querySelectorAll('.switch-track').forEach(t => {
    t.onclick = () => t.classList.toggle('on');
  });
};

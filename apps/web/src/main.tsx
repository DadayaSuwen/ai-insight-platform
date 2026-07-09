import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// M4: 同步注册 ECharts dark theme
// import 'echarts/theme/dark' 是 echarts 内置 dark 主题,副作用即 registerTheme('dark', ...)
// 这样 DynamicChart 的 theme={isDark ? 'dark' : 'light'} 就能正常切换
import 'echarts/theme/dark';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
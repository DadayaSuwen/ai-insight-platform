import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ChatWindow from './features/chat/components/ChatWindow';
import SettingsPage from './features/settings/SettingsPage';
import { useChatStore } from './features/chat/store';

function App() {
  const theme = useChatStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatWindow />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

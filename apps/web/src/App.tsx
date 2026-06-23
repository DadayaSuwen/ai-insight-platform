import { useEffect } from 'react';
import ChatWindow from './features/chat/components/ChatWindow';
import { useChatStore } from './features/chat/store';

function App() {
  const theme = useChatStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="h-screen w-screen">
      <ChatWindow />
    </div>
  );
}

export default App;

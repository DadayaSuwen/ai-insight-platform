import { useState, useCallback } from 'react';
import { axiosInstance } from '@/core/api';
import type { SSEMessage, SSEEventType } from '@workspace/types';

interface UseSSEChatOptions {
  onToken?: (token: string) => void;
  onSQL?: (sql: string) => void;
  onChart?: (chart: object) => void;
  onAnalysis?: (analysis: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

interface UseSSEChatReturn {
  sendMessage: (message: string) => void;
  isLoading: boolean;
  error: string | null;
}

export function useSSEChat(options: UseSSEChatOptions = {}): UseSSEChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback((message: string) => {
    setIsLoading(true);
    setError(null);
    // TODO: Implement SSE connection
  }, []);

  return { sendMessage, isLoading, error };
}
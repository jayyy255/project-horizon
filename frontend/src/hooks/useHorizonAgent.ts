import { useState, useEffect, useCallback } from 'react';
import { agentClient, ReActSessionState } from '../services/agentClient';

export function useHorizonAgent() {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionState, setSessionState] = useState<ReActSessionState | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    // Initial health check
    agentClient
      .checkHealth()
      .then(() => setIsConnected(true))
      .catch(() => setIsConnected(false));

    // Subscribe to WebSocket updates
    agentClient.connect(
      (newState) => {
        setSessionState(newState);
      },
      (connected) => {
        setIsConnected(connected);
      }
    );

    return () => {
      agentClient.disconnect();
    };
  }, []);

  const dispatchTask = useCallback(async (prompt: string, images?: string[], history?: Array<{role: 'user' | 'assistant'; text: string}>) => {
    setIsExecuting(true);
    setLastError(null);
    try {
      const state = await agentClient.executeTask(prompt, undefined, images, history);
      setSessionState(state);
      return state;
    } catch (err: any) {
      setLastError(err.message || 'Task dispatch error');
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const submitTier2Decision = useCallback(async (actionId: string, authorized: boolean) => {
    setIsExecuting(true);
    setLastError(null);
    try {
      const state = await agentClient.resolveTier2(actionId, authorized);
      setSessionState(state);
      return state;
    } catch (err: any) {
      setLastError(err.message || 'Tier 2 decision error');
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const searchFiles = useCallback(async (query: string) => {
    try {
      return await agentClient.searchIndexer(query);
    } catch {
      return [];
    }
  }, []);

  return {
    isConnected,
    sessionState,
    isExecuting,
    lastError,
    dispatchTask,
    submitTier2Decision,
    searchFiles,
  };
}

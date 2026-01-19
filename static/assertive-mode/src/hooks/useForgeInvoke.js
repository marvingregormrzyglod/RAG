import { invokeBridge } from '../utils/forgeBridge';

export function useForgeInvoke() {
  const analyzeIssue = async (payload) => invokeBridge('analyze-issue', payload);
  const generateResponse = async (payload) => invokeBridge('gen-response', payload);

  return {
    analyzeIssue,
    generateResponse,
  };
}

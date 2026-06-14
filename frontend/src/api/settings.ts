import client from './client';

export interface Settings {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  llmProvider: string;
  maxForkDepth: number;
}

export async function getSettings(): Promise<Settings> {
  return client.get('/api/settings');
}

export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  return client.put('/api/settings', data);
}

export interface TestResult {
  success: boolean;
  message: string;
}

export async function testConnection(data: { openaiApiKey?: string; openaiBaseUrl?: string; openaiModel?: string }): Promise<TestResult> {
  return client.post('/api/settings/test', data);
}

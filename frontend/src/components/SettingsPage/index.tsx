import React, { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, Check } from 'lucide-react';
import { getSettings, updateSettings, type Settings } from '../../api/settings';

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('openai');
  const [maxDepth, setMaxDepth] = useState(2);

  useEffect(() => {
    setLoading(true);
    getSettings()
      .then((s) => {
        setSettings(s);
        setApiKey(s.openaiApiKey);
        setBaseUrl(s.openaiBaseUrl);
        setModel(s.openaiModel);
        setProvider(s.llmProvider);
        setMaxDepth(s.maxForkDepth);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateSettings({
        openaiApiKey: apiKey,
        openaiBaseUrl: baseUrl,
        openaiModel: model,
        llmProvider: provider,
        maxForkDepth: maxDepth,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, model, provider, maxDepth]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* LLM Configuration */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">LLM Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
                placeholder="https://api.openai.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
                placeholder="gpt-4"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea] bg-white"
              >
                <option value="openai">OpenAI (compatible)</option>
                <option value="mock">Mock (for testing)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Product Settings */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Product Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">Max Fork Depth</label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
              />
              <p className="text-xs text-gray-400 mt-1">Maximum nesting depth for conversation branches (1-10)</p>
            </div>
          </div>
        </section>

        {/* Error / Success */}
        {error && (
          <div className="px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}
        {saved && (
          <div className="px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-600 flex items-center gap-2">
            <Check className="w-4 h-4" />
            Settings saved
          </div>
        )}

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;

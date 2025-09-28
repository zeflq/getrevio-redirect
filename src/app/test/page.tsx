'use client';

import { useState } from 'react';

interface TestResult {
  type: 'check' | 'redirect';
  success: boolean;
  data?: any;
  error?: string;
}

export default function TestPage() {
  const [shortlink, setShortlink] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleCheck = async () => {
    if (!shortlink.trim()) {
      setResult({
        type: 'check',
        success: false,
        error: 'Please enter a shortlink'
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/test/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shortlink: shortlink.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          type: 'check',
          success: true,
          data: {
            result: data.result,
            message: data.message,
            details: data.data
          }
        });
      } else {
        setResult({
          type: 'check',
          success: false,
          error: data.error || 'Failed to check shortlink'
        });
      }
    } catch (error) {
      setResult({
        type: 'check',
        success: false,
        error: 'Network error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGetRedirectUrl = async () => {
    if (!shortlink.trim()) {
      setResult({
        type: 'redirect',
        success: false,
        error: 'Please enter a shortlink'
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/test/redirect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shortlink: shortlink.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          type: 'redirect',
          success: true,
          data: {
            redirectUrl: data.redirectUrl,
            details: data.data
          }
        });
      } else {
        setResult({
          type: 'redirect',
          success: false,
          error: data.error || 'Failed to get redirect URL'
        });
      }
    } catch (error) {
      setResult({
        type: 'redirect',
        success: false,
        error: 'Network error occurred'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Shortlink Tester
          </h1>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="shortlink" className="block text-sm font-medium text-gray-700 mb-2">
                Enter Shortlink
              </label>
              <input
                type="text"
                id="shortlink"
                value={shortlink}
                onChange={(e) => setShortlink(e.target.value)}
                placeholder="e.g., bella-pizza-sept-2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCheck}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Testing...' : 'Test Active (1/0)'}
              </button>
              
              <button
                onClick={handleGetRedirectUrl}
                disabled={loading}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Getting...' : 'Get Redirect URL'}
              </button>
            </div>
          </div>

          {result && (
            <div className="mt-6 p-4 rounded-md border">
              <h3 className="text-lg font-medium mb-2">
                {result.type === 'check' ? 'Active Test Result' : 'Redirect URL Result'}
              </h3>
              
              {result.success ? (
                <div className="text-green-800 bg-green-50 p-3 rounded">
                  {result.type === 'check' ? (
                    <div>
                      <p className="font-semibold">
                        Result: {result.data.result} ({result.data.result === 1 ? 'Active' : 'Inactive'})
                      </p>
                      <p className="text-sm mt-1">{result.data.message}</p>
                      {result.data.details && (
                        <div className="mt-2 text-xs">
                          <p><strong>Slug:</strong> {result.data.details.slug}</p>
                          <p><strong>Status:</strong> {result.data.details.status}</p>
                          <p><strong>Merchant ID:</strong> {result.data.details.merchantId}</p>
                          <p><strong>Campaign ID:</strong> {result.data.details.campaignId}</p>
                          <p><strong>Updated:</strong> {new Date(result.data.details.updatedAt).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold">Redirect URL:</p>
                      <a 
                        href={result.data.redirectUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline break-all"
                      >
                        {result.data.redirectUrl}
                      </a>
                      {result.data.details && (
                        <div className="mt-2 text-xs">
                          <p><strong>Slug:</strong> {result.data.details.slug}</p>
                          <p><strong>Status:</strong> {result.data.details.status}</p>
                          <p><strong>Merchant ID:</strong> {result.data.details.merchantId}</p>
                          <p><strong>Campaign ID:</strong> {result.data.details.campaignId}</p>
                          <p><strong>Updated:</strong> {new Date(result.data.details.updatedAt).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-red-800 bg-red-50 p-3 rounded">
                  <p className="font-semibold">Error:</p>
                  <p>{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
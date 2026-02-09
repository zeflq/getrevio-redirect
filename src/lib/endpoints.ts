/**
 * API Endpoints Configuration
 *
 * Centralizes all API endpoint paths to avoid hardcoding throughout the app.
 */

const API_BASE_URL = process.env.ANALYTICS_API_URL || 'https://api.getrevio.app';

export const API_ENDPOINTS = {
  analytics: {
    track: `${API_BASE_URL}/api/v1/analytics/track`,
  },
} as const;

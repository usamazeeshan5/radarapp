// API Configuration
export const API_CONFIG = {
  // Use relative path in dev (Vite proxy) and production (same origin)
  BASE_URL: import.meta.env.VITE_API_URL || '',
  ENDPOINTS: {
    PRODUCTS: '/api/products',
    RADAR_LATEST: '/api/radar/latest',
    RADAR_IMAGE: '/api/radar/image',
  },
};

// Refresh Configuration
export const REFRESH_CONFIG = {
  INTERVAL_MS: 2 * 60 * 1000, // 2 minutes
};

// Map Configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER: [39.8283, -98.5795], // Approximate center of CONUS
  DEFAULT_ZOOM: 5,
  TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

// Default Values
export const DEFAULTS = {
  OPACITY: 0.7,
  PRODUCT: 'rala',
};

// Reflectivity Color Scale (dBZ to RGBA)
export const REFLECTIVITY_LEGEND = [
  { range: '5-10 dBZ', color: 'rgb(4, 233, 231)', description: 'Light precipitation' },
  { range: '10-15 dBZ', color: 'rgb(1, 159, 244)', description: 'Light rain/snow' },
  { range: '15-20 dBZ', color: 'rgb(3, 0, 244)', description: 'Light to moderate rain' },
  { range: '20-25 dBZ', color: 'rgb(2, 253, 2)', description: 'Moderate rain' },
  { range: '25-30 dBZ', color: 'rgb(1, 197, 1)', description: 'Moderate to heavy rain' },
  { range: '30-35 dBZ', color: 'rgb(0, 142, 0)', description: 'Heavy rain' },
  { range: '35-40 dBZ', color: 'rgb(253, 248, 2)', description: 'Heavy rain' },
  { range: '40-45 dBZ', color: 'rgb(229, 188, 0)', description: 'Very heavy rain' },
  { range: '45-50 dBZ', color: 'rgb(253, 139, 0)', description: 'Intense rain' },
  { range: '50-55 dBZ', color: 'rgb(212, 0, 0)', description: 'Extreme rain/hail' },
  { range: '55-60 dBZ', color: 'rgb(188, 0, 0)', description: 'Severe weather' },
  { range: '60-65 dBZ', color: 'rgb(248, 0, 253)', description: 'Severe weather' },
  { range: '65+ dBZ', color: 'rgb(153, 85, 201)', description: 'Extreme severe weather' },
];

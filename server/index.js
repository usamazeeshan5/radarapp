import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { gunzipSync } from 'zlib';
import sharp from 'sharp';
import { parseMRMSGrib2 } from './mrmsParser.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'", 'https://mrms.ncep.noaa.gov'],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow loading tiles from OSM
}));

// Enable CORS
app.use(cors());

// Enable response compression
app.use(compression());

// Parse JSON bodies
app.use(express.json());

// Serve static files from the dist directory in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist')));
}

// MRMS product definitions
const MRMS_PRODUCTS = {
  'rala': {
    name: 'Reflectivity at Lowest Altitude',
    url: 'https://mrms.ncep.noaa.gov/data/2D/ReflectivityAtLowestAltitude/MRMS_ReflectivityAtLowestAltitude.latest.grib2.gz',
    description: 'Radar reflectivity closest to ground level'
  },
  'composite': {
    name: 'Composite Reflectivity',
    url: 'https://mrms.ncep.noaa.gov/data/2D/MergedReflectivityQCComposite/MRMS_MergedReflectivityQCComposite.latest.grib2.gz',
    description: 'Maximum reflectivity across all altitudes'
  },
  'precip_rate': {
    name: 'Precipitation Rate',
    url: 'https://mrms.ncep.noaa.gov/data/2D/PrecipRate/MRMS_PrecipRate.latest.grib2.gz',
    description: 'Current precipitation rate (mm/hr)'
  },
  'echo_tops': {
    name: 'Echo Tops',
    url: 'https://mrms.ncep.noaa.gov/data/2D/EchoTop_18/MRMS_EchoTop_18.latest.grib2.gz',
    description: 'Height of storm tops (18 dBZ threshold)'
  }
};

// Cache for radar data (keyed by product)
const dataCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Color scale for radar reflectivity (dBZ)
const getColorForReflectivity = (dbz) => {
  if (dbz < 5) return [0, 0, 0, 0]; // Transparent
  if (dbz < 10) return [4, 233, 231, 180]; // Light cyan
  if (dbz < 15) return [1, 159, 244, 200]; // Cyan
  if (dbz < 20) return [3, 0, 244, 220]; // Blue
  if (dbz < 25) return [2, 253, 2, 230]; // Green
  if (dbz < 30) return [1, 197, 1, 240]; // Dark green
  if (dbz < 35) return [0, 142, 0, 250]; // Darker green
  if (dbz < 40) return [253, 248, 2, 255]; // Yellow
  if (dbz < 45) return [229, 188, 0, 255]; // Dark yellow
  if (dbz < 50) return [253, 139, 0, 255]; // Orange
  if (dbz < 55) return [212, 0, 0, 255]; // Red
  if (dbz < 60) return [188, 0, 0, 255]; // Dark red
  if (dbz < 65) return [248, 0, 253, 255]; // Magenta
  return [153, 85, 201, 255]; // Purple
};

// Fetch and process MRMS data
async function fetchRadarData(productId = 'rala') {
  try {
    const product = MRMS_PRODUCTS[productId];
    if (!product) {
      throw new Error(`Unknown product: ${productId}`);
    }

    console.log(`[${new Date().toISOString()}] Fetching MRMS ${product.name} from:`, product.url);
    const response = await fetch(product.url);

    if (!response.ok) {
      const errorMsg = `Failed to fetch MRMS data: ${response.status} ${response.statusText}`;
      console.error(`[ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const gzippedData = await response.arrayBuffer();
    console.log('[INFO] Downloaded data size:', gzippedData.byteLength, 'bytes');

    // Decompress gzip
    console.log('[INFO] Decompressing gzip data...');
    const decompressed = gunzipSync(Buffer.from(gzippedData));
    console.log('[INFO] Decompressed data size:', decompressed.length, 'bytes');

    // Parse GRIB2 using custom MRMS parser
    console.log('[INFO] Parsing GRIB2 data...');
    const gribData = parseMRMSGrib2(decompressed);
    console.log('[SUCCESS] GRIB2 parsed successfully');
    console.log('[INFO] Grid info:', {
      nx: gribData.nx,
      ny: gribData.ny,
      la1: gribData.la1,
      lo1: gribData.lo1,
      la2: gribData.la2,
      lo2: gribData.lo2,
      numberOfPoints: gribData.values.length
    });

    return {
      // Store full data for image generation
      _fullData: gribData,
      timestamp: gribData.timestamp.toISOString(),
      metadata: {
        nx: gribData.nx,
        ny: gribData.ny,
        la1: gribData.la1,
        lo1: gribData.lo1,
        la2: gribData.la2,
        lo2: gribData.lo2
      }
    };
  } catch (error) {
    console.error('[ERROR] Error in fetchRadarData:', error.message);
    console.error('[ERROR] Stack trace:', error.stack);
    throw error;
  }
}

// Generate radar image from GRIB data
async function generateRadarImage(gribMessage) {
  const { nx, ny, values } = gribMessage;

  if (!nx || !ny || !values) {
    throw new Error('Invalid GRIB message structure');
  }

  console.log(`Generating image: ${nx}x${ny} pixels, ${values.length} values`);

  // Create RGBA buffer
  const imageData = Buffer.alloc(nx * ny * 4);

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const color = getColorForReflectivity(value);

    const offset = i * 4;
    imageData[offset] = color[0];     // R
    imageData[offset + 1] = color[1]; // G
    imageData[offset + 2] = color[2]; // B
    imageData[offset + 3] = color[3]; // A
  }

  // Convert to PNG using sharp
  const pngBuffer = await sharp(imageData, {
    raw: {
      width: nx,
      height: ny,
      channels: 4
    }
  })
  .png()
  .toBuffer();

  return pngBuffer;
}

// API endpoint to list available products
app.get('/api/products', (req, res) => {
  console.log('[API] GET /api/products');
  const products = Object.entries(MRMS_PRODUCTS).map(([id, info]) => ({
    id,
    name: info.name,
    description: info.description
  }));
  console.log(`[SUCCESS] Returning ${products.length} products`);
  res.json({ products });
});

// API endpoint to get latest radar data metadata only
app.get('/api/radar/latest', async (req, res) => {
  try {
    const productId = req.query.product || 'rala';
    console.log(`[API] GET /api/radar/latest - Product: ${productId}`);
    const cacheKey = productId;
    const cached = dataCache.get(cacheKey);
    const now = Date.now();

    // Check cache
    if (cached && (now - cached.time < CACHE_DURATION)) {
      console.log(`[CACHE HIT] Returning cached ${productId} data`);
      return res.json({
        timestamp: cached.data.timestamp,
        metadata: cached.data.metadata,
        product: productId
      });
    }

    // Fetch fresh data
    console.log(`[CACHE MISS] Fetching fresh ${productId} radar data...`);
    const radarData = await fetchRadarData(productId);

    // Update cache
    dataCache.set(cacheKey, { data: radarData, time: now });

    // Only return metadata, not full data with values
    console.log(`[SUCCESS] Sending radar metadata for ${productId}`);
    res.json({
      timestamp: radarData.timestamp,
      metadata: radarData.metadata,
      product: productId
    });
  } catch (error) {
    console.error('[ERROR] Error in /api/radar/latest:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch radar data',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// API endpoint to get radar image
app.get('/api/radar/image', async (req, res) => {
  try {
    const productId = req.query.product || 'rala';
    const cacheKey = productId;
    const cached = dataCache.get(cacheKey);
    const now = Date.now();

    // Check cache
    if (!cached || (now - cached.time >= CACHE_DURATION)) {
      console.log(`Fetching fresh ${productId} radar data for image...`);
      const radarData = await fetchRadarData(productId);
      dataCache.set(cacheKey, { data: radarData, time: now });
    }

    // Generate image
    const currentCached = dataCache.get(cacheKey);
    console.log(`Generating ${productId} radar image...`);
    const imageBuffer = await generateRadarImage(currentCached.data._fullData);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=120'); // 2 minutes
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error in /api/radar/image:', error);
    res.status(500).json({
      error: 'Failed to generate radar image',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all route to serve the frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log('\n==============================================');
  console.log('🚀 MRMS Weather Radar Server Started');
  console.log('==============================================');
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\nAvailable Endpoints:');
  console.log(`  - GET  http://localhost:${PORT}/api/products`);
  console.log(`  - GET  http://localhost:${PORT}/api/radar/latest`);
  console.log(`  - GET  http://localhost:${PORT}/api/radar/image`);
  console.log(`  - GET  http://localhost:${PORT}/health`);
  console.log('==============================================\n');
});

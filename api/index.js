import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { gunzipSync } from 'zlib';
import sharp from 'sharp';
import { parseMRMSGrib2 } from '../server/mrmsParser.js';

const app = express();

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
  crossOriginEmbedderPolicy: false,
}));

// Enable CORS
app.use(cors());

// Enable response compression
app.use(compression());

// Parse JSON bodies
app.use(express.json());

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

// Note: Cache won't persist between serverless function invocations
// Consider using Vercel KV or other external cache for production
const dataCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Color scale for radar reflectivity (dBZ)
const getColorForReflectivity = (dbz) => {
  if (dbz < 5) return [0, 0, 0, 0];
  if (dbz < 10) return [4, 233, 231, 180];
  if (dbz < 15) return [1, 159, 244, 200];
  if (dbz < 20) return [3, 0, 244, 220];
  if (dbz < 25) return [2, 253, 2, 230];
  if (dbz < 30) return [1, 197, 1, 240];
  if (dbz < 35) return [0, 142, 0, 250];
  if (dbz < 40) return [253, 248, 2, 255];
  if (dbz < 45) return [229, 188, 0, 255];
  if (dbz < 50) return [253, 139, 0, 255];
  if (dbz < 55) return [212, 0, 0, 255];
  if (dbz < 60) return [188, 0, 0, 255];
  if (dbz < 65) return [248, 0, 253, 255];
  return [153, 85, 201, 255];
};

// Fetch and process MRMS data
async function fetchRadarData(productId = 'rala') {
  try {
    const product = MRMS_PRODUCTS[productId];
    if (!product) {
      throw new Error(`Unknown product: ${productId}`);
    }

    console.log(`[${new Date().toISOString()}] Fetching MRMS ${product.name}`);
    const response = await fetch(product.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch MRMS data: ${response.status}`);
    }

    const gzippedData = await response.arrayBuffer();
    const decompressed = gunzipSync(Buffer.from(gzippedData));
    const gribData = parseMRMSGrib2(decompressed);

    return {
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
    console.error('Error in fetchRadarData:', error.message);
    throw error;
  }
}

// Generate radar image from GRIB data
async function generateRadarImage(gribMessage) {
  const { nx, ny, values } = gribMessage;

  if (!nx || !ny || !values) {
    throw new Error('Invalid GRIB message structure');
  }

  const imageData = Buffer.alloc(nx * ny * 4);

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const color = getColorForReflectivity(value);
    const offset = i * 4;
    imageData[offset] = color[0];
    imageData[offset + 1] = color[1];
    imageData[offset + 2] = color[2];
    imageData[offset + 3] = color[3];
  }

  const pngBuffer = await sharp(imageData, {
    raw: { width: nx, height: ny, channels: 4 }
  }).png().toBuffer();

  return pngBuffer;
}

// API Routes
app.get('/api/products', (req, res) => {
  const products = Object.entries(MRMS_PRODUCTS).map(([id, info]) => ({
    id,
    name: info.name,
    description: info.description
  }));
  res.json({ products });
});

app.get('/api/radar/latest', async (req, res) => {
  try {
    const productId = req.query.product || 'rala';
    const cacheKey = productId;
    const cached = dataCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.time < CACHE_DURATION)) {
      return res.json({
        timestamp: cached.data.timestamp,
        metadata: cached.data.metadata,
        product: productId
      });
    }

    const radarData = await fetchRadarData(productId);
    dataCache.set(cacheKey, { data: radarData, time: now });

    res.json({
      timestamp: radarData.timestamp,
      metadata: radarData.metadata,
      product: productId
    });
  } catch (error) {
    console.error('Error in /api/radar/latest:', error.message);
    res.status(500).json({
      error: 'Failed to fetch radar data',
      message: error.message
    });
  }
});

app.get('/api/radar/image', async (req, res) => {
  try {
    const productId = req.query.product || 'rala';
    const cacheKey = productId;
    const cached = dataCache.get(cacheKey);
    const now = Date.now();

    if (!cached || (now - cached.time >= CACHE_DURATION)) {
      const radarData = await fetchRadarData(productId);
      dataCache.set(cacheKey, { data: radarData, time: now });
    }

    const currentCached = dataCache.get(cacheKey);
    const imageBuffer = await generateRadarImage(currentCached.data._fullData);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=120');
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the Express app as a Vercel serverless function
export default app;

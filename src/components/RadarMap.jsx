import { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, ImageOverlay, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './RadarMap.css';
import { API_CONFIG, REFRESH_CONFIG, MAP_CONFIG, DEFAULTS, REFLECTIVITY_LEGEND } from '../constants';

// Component to update the image overlay
const RadarOverlay = memo(function RadarOverlay({ bounds, imageUrl, opacity }) {
  if (!bounds || !imageUrl) return null;
  return <ImageOverlay url={imageUrl} bounds={bounds} opacity={opacity} />;
});

RadarOverlay.propTypes = {
  bounds: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)),
  imageUrl: PropTypes.string,
  opacity: PropTypes.number.isRequired,
};

// Component to handle map auto-refresh
const MapUpdater = memo(function MapUpdater({ radarData }) {
  const map = useMap();

  useEffect(() => {
    if (radarData?.metadata) {
      const { la1, lo1, la2, lo2 } = radarData.metadata;
      // Convert longitude from 0-360 range to -180 to 180 range
      const convertLon = (lon) => lon > 180 ? lon - 360 : lon;
      const bounds = [
        [la2, convertLon(lo1)], // Southwest corner
        [la1, convertLon(lo2)]  // Northeast corner
      ];
      // Fit the map to the radar data bounds
      map.fitBounds(bounds);
    }
  }, [radarData, map]);

  return null;
});

MapUpdater.propTypes = {
  radarData: PropTypes.shape({
    metadata: PropTypes.shape({
      nx: PropTypes.number,
      ny: PropTypes.number,
      la1: PropTypes.number,
      lo1: PropTypes.number,
      la2: PropTypes.number,
      lo2: PropTypes.number,
    }),
    timestamp: PropTypes.string,
  }),
};

function RadarMap() {
  const [radarData, setRadarData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [opacity, setOpacity] = useState(DEFAULTS.OPACITY);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(DEFAULTS.PRODUCT);
  const refreshIntervalRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PRODUCTS}`);
      if (response.ok) {
        const data = await response.json();
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }, []);

  const fetchRadarData = useCallback(async (product = selectedProduct) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.RADAR_LATEST}?product=${product}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch radar data: ${response.status}`);
      }

      const data = await response.json();
      setRadarData(data);
      setLastUpdate(new Date(data.timestamp));
      setLoading(false);
    } catch (err) {
      console.error('Error fetching radar data:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [selectedProduct]);

  useEffect(() => {
    // Fetch products list
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    // Initial fetch
    fetchRadarData(selectedProduct);

    // Set up auto-refresh
    refreshIntervalRef.current = setInterval(() => {
      fetchRadarData(selectedProduct);
    }, REFRESH_CONFIG.INTERVAL_MS);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [selectedProduct, fetchRadarData]);

  const handleRefresh = () => {
    fetchRadarData();
  };

  // Calculate bounds for the image overlay (memoized to avoid recalculation)
  const bounds = useMemo(() => {
    if (!radarData?.metadata) return null;

    const { la1, lo1, la2, lo2 } = radarData.metadata;

    // Convert longitude from 0-360 range to -180 to 180 range
    const convertLon = (lon) => lon > 180 ? lon - 360 : lon;

    return [
      [la2, convertLon(lo1)], // Southwest corner
      [la1, convertLon(lo2)]  // Northeast corner
    ];
  }, [radarData]);

  const imageUrl = useMemo(
    () => radarData ? `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.RADAR_IMAGE}?product=${selectedProduct}&t=${radarData.timestamp}` : null,
    [radarData, selectedProduct]
  );

  return (
    <div className="radar-container">
      <div className="radar-header">
        <h1>MRMS Weather Radar</h1>
        <div className="radar-controls">
          <div className="control-group">
            <label htmlFor="product-select">
              Product:
              <select
                id="product-select"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="product-select"
                aria-label="Select radar product type"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="control-group">
            <label htmlFor="opacity-slider">
              Opacity:
              <input
                id="opacity-slider"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                aria-label="Adjust radar overlay opacity"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(opacity * 100)}
                aria-valuetext={`${Math.round(opacity * 100)} percent`}
              />
              <span aria-live="polite">{Math.round(opacity * 100)}%</span>
            </label>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="refresh-btn"
            aria-label="Refresh radar data"
          >
            {loading ? 'Loading...' : 'Refresh Now'}
          </button>
          {lastUpdate && (
            <span className="last-update" aria-live="polite" aria-atomic="true">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert" aria-live="assertive">
          Error: {error}
        </div>
      )}

      <div className="map-wrapper" role="application" aria-label="Interactive weather radar map">
        <MapContainer
          center={MAP_CONFIG.DEFAULT_CENTER}
          zoom={MAP_CONFIG.DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          aria-label="Weather radar map"
        >
          <TileLayer
            attribution={MAP_CONFIG.TILE_ATTRIBUTION}
            url={MAP_CONFIG.TILE_URL}
          />
          {radarData && <MapUpdater radarData={radarData} />}
          {bounds && imageUrl && (
            <RadarOverlay bounds={bounds} imageUrl={imageUrl} opacity={opacity} />
          )}
        </MapContainer>
      </div>

      <div className="radar-legend" role="region" aria-label="Radar reflectivity legend">
        <h3>Reflectivity (dBZ)</h3>
        <div className="legend-items" role="list">
          {REFLECTIVITY_LEGEND.map((item, index) => (
            <div key={index} className="legend-item" title={item.description} role="listitem">
              <span className="legend-color" style={{ background: item.color }} aria-hidden="true"></span>
              <span>{item.range}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="radar-info" role="contentinfo">
        <p>
          <strong>Data Source:</strong> NOAA Multi-Radar Multi-Sensor (MRMS) System<br />
          <strong>Product:</strong> Reflectivity at Lowest Altitude (RALA)<br />
          <strong>Updates:</strong> Automatically every 2 minutes
        </p>
      </div>
    </div>
  );
}

export default RadarMap;

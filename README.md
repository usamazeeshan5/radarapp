# MRMS Weather Radar Display

A full-stack weather radar application that displays real-time NOAA Multi-Radar Multi-Sensor (MRMS) Reflectivity at Lowest Altitude (RALA) data on an interactive map.

## Live Demo

[Deployed on Render.com] - *Add your deployment URL here after deploying*

## Features

- ✅ Direct processing of MRMS GRIB2 data (no pre-processed tiles)
- ✅ Real-time radar data that updates every 2 minutes
- ✅ Interactive map with zoom and pan
- ✅ Adjustable radar overlay opacity
- ✅ Responsive design
- ✅ Automatic data refresh
- ✅ Manual refresh button

## Tech Stack

### Frontend
- **React 19** - UI framework
- **Leaflet** - Interactive mapping library
- **React Leaflet** - React bindings for Leaflet
- **Vite** - Build tool and dev server

Justification for Leaflet: Leaflet is a lightweight, well-documented mapping library that provides the core functionality needed for displaying map tiles and custom overlays. While I could have implemented a basic tile renderer, Leaflet provides battle-tested zoom, pan, and projection handling that would take significant time to implement correctly. React Leaflet provides clean React integration.

### Backend
- **Node.js with Express** - API server
- **Sharp** - High-performance image processing for generating radar PNG overlays
- **Custom GRIB2 Parser** - Built specifically for MRMS data

Justification for Sharp: Converting raw radar data to PNG images requires efficient image encoding. Sharp is a high-performance image library that can handle the 7000x3500 pixel radar grid efficiently. Implementing PNG encoding from scratch would be complex and error-prone.

**Note on GRIB2 Parsing**: I initially tried using `grib2-simple`, but it only supports DWD (German Weather Service) GRIB2 templates. MRMS uses a custom product definition template (55072) not supported by existing Node.js libraries. Therefore, I implemented a custom GRIB2 parser specifically for MRMS RALA data, following the official GRIB2 specification.

## Architecture

### Data Flow

1. **Backend** fetches compressed GRIB2 data from MRMS servers every 2 minutes (with caching)
2. **Custom Parser** decodes the GRIB2 binary format to extract:
   - Grid dimensions (7000x3500 covering CONUS)
   - Geographic bounds (lat/lon)
   - Reflectivity values in dBZ
3. **Color Mapping** converts dBZ values to RGBA colors
4. **Image Generation** creates PNG overlay using Sharp
5. **Frontend** displays the image on Leaflet map with geographic bounds

### API Endpoints

- `GET /health` - Health check
- `GET /api/radar/latest` - Get latest radar data metadata
- `GET /api/radar/image` - Get radar overlay as PNG image

## Local Development

### Prerequisites

- Node.js 18+ (tested with v22.18.0)
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd my-radar-app
```

2. Install dependencies:
```bash
npm install
```

3. Run backend and frontend concurrently:

**Backend** (Terminal 1):
```bash
npm run server
```

**Frontend** (Terminal 2):
```bash
npm run dev
```

4. Open http://localhost:5173 in your browser

The frontend will proxy API requests to the backend running on port 3001.

## Deployment on Render.com

### Option 1: Using render.yaml (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Create a new Web Service on Render.com:
   - Connect your repository
   - Render will automatically detect the `render.yaml` file
   - Click "Apply"

3. Your app will be deployed automatically!

### Option 2: Manual Setup

1. Create a new **Web Service** on Render.com

2. Configure the service:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
   - **Plan**: Free (or paid for better performance)

3. Add environment variables:
   - `NODE_ENV`: `production`

4. Deploy!

### Important Notes for Deployment

- The free tier on Render may spin down after inactivity. The first request after spindown may take 30-60 seconds.
- MRMS data files are ~1.4MB compressed. The parsing takes 1-2 seconds on initial load.
- Radar data is cached for 2 minutes to reduce load on NOAA servers.

## Project Structure

```
my-radar-app/
├── server/
│   ├── index.js          # Express server
│   └── mrmsParser.js     # Custom GRIB2 parser for MRMS
├── src/
│   ├── components/
│   │   ├── RadarMap.jsx  # Main radar map component
│   │   └── RadarMap.css  # Radar map styles
│   ├── App.jsx           # Root component
│   ├── App.css           # App styles
│   ├── index.css         # Global styles
│   └── main.jsx          # Entry point
├── public/               # Static assets
├── dist/                 # Built frontend (generated)
├── package.json
├── vite.config.js
├── render.yaml          # Render.com configuration
└── README.md
```

## Data Source

**NOAA Multi-Radar Multi-Sensor (MRMS)**
- Product: Reflectivity at Lowest Altitude (RALA)
- Update Frequency: Every 2 minutes
- Coverage: Continental United States (CONUS)
- Resolution: ~1km spatial resolution
- Format: GRIB2
- URL: https://mrms.ncep.noaa.gov/

## How It Works

### GRIB2 Parsing

GRIB2 (GRIdded Binary, Edition 2) is a binary format used by meteorological agencies worldwide. The format consists of:

1. **Section 0**: Indicator (GRIB magic number, edition)
2. **Section 1**: Identification (timestamp, originating center)
3. **Section 2**: Local use (optional)
4. **Section 3**: Grid definition (lat/lon grid, dimensions)
5. **Section 4**: Product definition (parameter type, forecast time)
6. **Section 5**: Data representation (packing method, scale factors)
7. **Section 6**: Bit map (missing value indicators)
8. **Section 7**: Data (packed values)

Our custom parser extracts the grid geometry and applies the formula:
```
Y = (R + X × 2^E) × 10^(-D)
```
Where:
- Y = final reflectivity value (dBZ)
- R = reference value
- X = packed integer value
- E = binary scale factor
- D = decimal scale factor

### Reflectivity Color Scale

The color mapping follows standard weather radar conventions:

| dBZ Range | Color | Weather Type |
|-----------|-------|--------------|
| < 5 | Transparent | No precipitation |
| 5-20 | Cyan/Blue | Light rain/snow |
| 20-35 | Green | Moderate rain |
| 35-50 | Yellow/Orange | Heavy rain |
| 50-65 | Red/Magenta | Very heavy rain/hail |
| > 65 | Purple | Severe weather |

## Performance Optimizations

- **Caching**: Radar data cached for 2 minutes to avoid redundant downloads
- **Lazy Loading**: Map tiles loaded on-demand
- **Image Compression**: PNG compression for efficient data transfer
- **Background Processing**: GRIB2 parsing done server-side

## Known Limitations

- No mobile touch gesture optimization (Leaflet handles basic touch, but could be improved)
- No historical data view (only latest data)
- No radar animation/loop
- Server restart clears cache
- Cold starts on free Render tier may be slow

## Future Enhancements

Potential improvements if time permitted:

- [ ] Add radar animation (last 1-2 hours)
- [ ] Multiple MRMS products (precipitation rate, echo tops, etc.)
- [ ] Location search
- [ ] Weather alerts overlay
- [ ] Mobile app (React Native)
- [ ] WebSocket for real-time updates
- [ ] Database for historical data

## License

MIT

## Acknowledgments

- NOAA National Severe Storms Laboratory for MRMS data
- OpenStreetMap contributors for base map tiles
- Leaflet.js for the mapping library

## Contact

For questions or issues, please open an issue on the GitHub repository.

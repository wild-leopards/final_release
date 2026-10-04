# NASA POWER API Documentation for "Energy Around Us" Project

## Overview

This documentation provides comprehensive information about satellite APIs available for the "Energy Around Us" hackathon project. The focus is on NASA's POWER (Prediction Of Worldwide Energy Resources) API, which is ideal for energy-related applications.

## NASA POWER API - Primary Recommendation

### What is NASA POWER?

**POWER (Prediction Of Worldwide Energy Resources)** is a project that provides free solar radiation and meteorological data from NASA satellites. It's perfect for your energy-focused hackathon project.

### Key Features:
- ✅ **Completely Free** - No API key required
- ✅ **Perfect for Energy Applications** - Solar radiation data included
- ✅ **Easy Integration** - Simple REST API
- ✅ **Global Coverage** - Available worldwide
- ✅ **Multiple Time Scales** - Hourly, daily, monthly, climatology
- ✅ **No Rate Limits** (for reasonable use)
- ✅ **Well Documented** - Comprehensive API documentation

## API Endpoints

### Base URL
```
https://power.larc.nasa.gov/api/
```

### Available Services

#### 1. **Temporal APIs** (Primary Focus)
Returns Analysis Ready Data (ARD) products:

| Service | Description | Time Scale |
|---------|-------------|------------|
| **Hourly** | Hourly data with average values | 2001-Current (NRT) |
| **Daily** | Daily data with avg/max/min values | 1981-Current (NRT) |
| **Monthly** | Monthly data with avg/max/min values | 1981-Current (NRT) |
| **Climatology** | Climatological averages for predefined periods | 1981-Current |

#### 2. **Application APIs**
Specialized reports and validation products:
- **Climate Indicators** - ASHRAE Climate Indicators report
- **Windrose** - Wind direction and speed visualization
- **Zones** - Thermal and thermal moisture zones

#### 3. **System APIs**
Configuration information across all services

## Available Parameters

### Key Parameters for Energy Applications:

#### Solar Energy Parameters:
- `ALLSKY_SFC_SW_DWN` - Downward short-wave radiation at surface (W/m²)
- `ALLSKY_SFC_SW_DWN_TOA` - Downward short-wave radiation at TOA (W/m²)
- `ALLSKY_SFC_UV_INDEX` - UV index
- `ALLSKY_SFC_UV_INDEX_CLEAR` - Clear sky UV index

#### Temperature Parameters:
- `T2M` - 2m air temperature (°C)
- `T2M_MAX` - Max 2m air temperature (°C)
- `T2M_MIN` - Min 2m air temperature (°C)

#### Precipitation:
- `PRECTOTCORR` - Precipitation correction (mm/day)

#### Wind:
- `WS10M` - 10m wind speed (m/s)
- `WD10M` - 10m wind direction (degrees)
- `U10M` - 10m u-component of wind (m/s)
- `V10M` - 10m v-component of wind (m/s)

#### Humidity:
- `RH2M` - Relative humidity at 2m (%)

#### Pressure:
- `PS` - Surface pressure (Pa)

### Other Parameters:
- `CLRSKY_SFC_SW_DWN` - Clear sky short-wave radiation
- `ALLSKY_SFC_LW_DWN` - Downward long-wave radiation
- `ALLSKY_SFC_UV_INDEX` - UV index

## API Request Structure

### Point Location (Single Coordinate)
```
/api/temporal/{service}/point?parameters={PARAM1,PARAM2,...}&community={COMMUNITY}&longitude={LONGITUDE}&latitude={LATITUDE}&start={START_DATE}&end={END_DATE}&format={FORMAT}
```

### Regional Location (Bounding Box)
```
/api/temporal/{service}/regional?latitude-min={MIN_LAT}&latitude-max={MAX_LAT}&longitude-min={MIN_LON}&longitude-max={MAX_LON}&parameters={PARAM1,PARAM2,...}&community={COMMUNITY}&start={START_DATE}&end={END_DATE}&format={FORMAT}
```

### Required Parameters:
- `parameters` - Comma-separated list of parameters (max 20 for point, 1 for regional)
- `community` - SB (SB = Solar/Bio-mass) or AG (AG = Agriculture)
- `longitude` - Longitude coordinate (for point)
- `latitude` - Latitude coordinate (for point)
- `start` - Start date (YYYYMMDD)
- `end` - End date (YYYYMMDD)
- `format` - Output format (JSON, CSV, NetCDF, ASCII)

### Optional Parameters:
- `time-standard` - UTC or LST (Local Solar Time)
- `site-elevation` - Site elevation in meters (for point)
- `wind-elevation` - Wind elevation in meters (10-300m range)
- `wind-surface` - Surface type alias

## Output Formats

| Format | Description | Best For |
|--------|-------------|----------|
| **JSON** | JavaScript Object Notation | Easy parsing in web applications |
| **CSV** | Comma Separated Values | Excel, data analysis |
| **NetCDF** | Network Common Data Form | Scientific processing |
| **ASCII** | Plain text format | Custom parsing |
| **EPW** | EnergyPlus Weather File | Building energy simulation |

## Example API Requests

### 1. Daily Solar Radiation (JSON)
```
https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=SB&longitude=52.5200&latitude=13.4050&start=20240101&end=20240131&format=JSON
```

### 2. Hourly Weather Data (CSV)
```
https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=T2M,WS10M,RH2M,PS&community=SB&longitude=52.5200&latitude=13.4050&start=20240101&end=20240102&format=CSV
```

### 3. Monthly Climate Data (JSON)
```
https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_MAX,T2M_MIN,ALLSKY_SFC_SW_DWN&community=SB&longitude=52.5200&latitude=13.4050&start=20240101&end=20241231&format=JSON
```

### 4. Regional Data (CSV)
```
https://power.larc.nasa.gov/api/temporal/daily/regional?latitude-min=50&latitude-max=55&longitude-min=50&longitude-max=55&parameters=T2M&community=SB&start=20240101&end=20240131&format=CSV
```

## Response Structure (JSON Format)

```json
{
  "parameter": {
    "ALLSKY_SFC_SW_DWN": {
      "20170101": 7.50,
      "20170102": 7.60,
      ...
    }
  },
  "parameters": "ALLSKY_SFC_SW_DWN",
  "description": "Downward short-wave radiation at surface (W/m²)",
  "start_date": "2017-01-01",
  "end_date": "2017-01-31",
  "lat": 13.4050,
  "lon": 52.5200
}
```

## Time Standards

### UTC (Universal Time Coordinated)
- Most commonly accepted worldwide
- Standard for international coordination

### LST (Local Solar Time)
- Based on longitude
- Represents solar noon at the middle longitude
- Default for Daily API
- Hourly API defaults to LST

## Limitations and Best Practices

### Rate Limits:
- Maximum 20 parameters per request (point location)
- Maximum 1 parameter per request (regional)
- No explicit rate limits, but reasonable usage expected

### Data Availability:
- Hourly: 2001-Current (NRT)
- Daily: 1981-Current (NRT)
- Monthly: 1981-Current (NRT)
- Climatology: 1981-Current

### Special Considerations:
1. **For regional requests**, use one parameter at a time
2. **For global data**, submit one request per grid cell (0.5° x 0.5°)
3. **Time zone** - LST is based on longitude, may not match government time zones
4. **Wind elevation** - Required for wind data (10-300m range)

## Alternative APIs

### 1. NASA Open APIs (api.nasa.gov)
- Requires API key registration
- Multiple endpoints available
- More general NASA data access
- URL: https://api.nasa.gov/

### 2. Google Earth Engine
- Massive geospatial processing platform
- Requires registration
- Powerful but more complex
- URL: https://developers.google.com/earth-engine/

### 3. ESA (European Space Agency)
- Sentinel satellite data
- Various Earth observation services
- URL: https://www.esa.int/

### 4. NOAA APIs
- Weather and climate data
- May have rate limits
- URL: https://www.noaa.gov/

## Integration Recommendations for "Energy Around Us"

### Primary Integration: NASA POWER API
**Why it's perfect for your project:**
1. **Solar Radiation Data** - Directly relevant to energy applications
2. **Free and Easy** - No API key needed
3. **Global Coverage** - Can analyze any location
4. **Multiple Time Scales** - Hourly to monthly data
5. **Easy to Use** - Simple REST API

### Implementation Strategy:
1. **Start with Daily API** - Easier to implement and understand
2. **Focus on Solar Parameters** - `ALLSKY_SFC_SW_DWN` (downward short-wave radiation)
3. **Use JSON format** - Easier to parse in Java
4. **Implement rate limiting** - Respect NASA's usage policies
5. **Cache responses** - Store frequently requested data

### Example Use Cases:
- **Solar Energy Potential** - Analyze solar radiation patterns
- **Climate Impact** - Study temperature changes over time
- **Weather Integration** - Combine with other meteorological data
- **Regional Analysis** - Compare different locations
- **Historical Data** - Analyze long-term trends

## Getting Started

### Step 1: Test the API
Visit the [POWER API Pages](https://power.larc.nasa.gov/api/pages/) to test requests interactively.

### Step 2: Try a Simple Request
```bash
curl "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=SB&longitude=52.5200&latitude=13.4050&start=20240101&end=20240131&format=JSON"
```

### Step 3: Implement in Java
See the `PowerApiService.java` example in your project.

## Resources

- **Official Documentation**: https://power.larc.nasa.gov/docs/
- **API Pages**: https://power.larc.nasa.gov/api/pages/
- **Data Access Viewer**: https://power.larc.nasa.gov/data-access-viewer/
- **API Tutorial**: https://power.larc.nasa.gov/docs/tutorials/api-getting-started/
- **NASA Earthdata**: https://earthdata.nasa.gov/

## Support

For questions or issues:
- **POWER Project Team**: larc-power-project@mail.nasa.gov
- **NASA Earthdata Forum**: https://forum.earthdata.nasa.gov/

---

**Last Updated**: 2025-06-23
**Project**: "Energy Around Us" Hackathon
**Primary API**: NASA POWER API

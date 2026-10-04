package com.example;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * NASA POWER API client.
 *
 * Fetches solar radiation and meteorological data from NASA's POWER
 * (Prediction Of Worldwide Energy Resources) API and parses the daily
 * point responses into simple date -> value maps.
 *
 * The API needs no key. Docs: https://power.larc.nasa.gov/docs/
 */
public class PowerApiService {

    private static final String BASE_URL = "https://power.larc.nasa.gov/api/";
    private static final String ENDPOINT = "temporal/daily/point";
    /** POWER's fill value for missing measurements. */
    private static final double FILL_VALUE = -999.0;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String community;
    private final String format;

    /** Default settings: Solar/Bio-mass community, JSON output. */
    public PowerApiService() {
        this("SB", "JSON");
    }

    public PowerApiService(String community, String format) {
        this.community = community;
        this.format = format;
    }

    /** Daily all-sky surface shortwave downward radiation (kWh/m²/day). */
    public String fetchSolarRadiationData(double longitude, double latitude,
                                          String startDate, String endDate) throws Exception {
        return fetchData(longitude, latitude, "ALLSKY_SFC_SW_DWN", startDate, endDate);
    }

    /** Any comma-separated list of POWER parameters, e.g. "T2M,WS2M". */
    public String fetchWeatherData(double longitude, double latitude,
                                   String parameters, String startDate, String endDate) throws Exception {
        return fetchData(longitude, latitude, parameters, startDate, endDate);
    }

    public String fetchData(double longitude, double latitude,
                            String parameters, String startDate, String endDate) throws Exception {
        // Parameters are URL-encoded so comma-separated lists (and any
        // stray characters from the query string) survive the trip.
        String urlString = String.format(java.util.Locale.ROOT,
                "%s%s?parameters=%s&community=%s&longitude=%.4f&latitude=%.4f&start=%s&end=%s&format=%s",
                BASE_URL, ENDPOINT, URLEncoder.encode(parameters, StandardCharsets.UTF_8), community,
                longitude, latitude, startDate, endDate, format);
        return get(urlString);
    }

    /** Long-term monthly climatology (JAN..DEC + ANN) for a point —
     *  POWER's 30+ year averages, no date range. */
    public String fetchClimatology(double longitude, double latitude,
                                   String parameters) throws Exception {
        String urlString = String.format(java.util.Locale.ROOT,
                "%stemporal/climatology/point?parameters=%s&community=%s&longitude=%.4f&latitude=%.4f&format=%s",
                BASE_URL, URLEncoder.encode(parameters, StandardCharsets.UTF_8), community,
                longitude, latitude, format);
        return get(urlString);
    }

    /** Twelve monthly values (JAN..DEC) plus the annual mean of one
     *  climatology parameter; null when the parameter is missing or
     *  any month is a fill value. Index 12 is ANN. */
    public double[] parseClimatology(String jsonResponse, String parameter) throws Exception {
        JsonNode values = objectMapper.readTree(jsonResponse)
                .path("properties").path("parameter").path(parameter);
        if (!values.isObject()) return null;
        String[] keys = {"JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "ANN"};
        double[] out = new double[keys.length];
        for (int i = 0; i < keys.length; i++) {
            JsonNode v = values.path(keys[i]);
            if (!v.isNumber() || v.asDouble() == FILL_VALUE) return null;
            out[i] = v.asDouble();
        }
        return out;
    }

    private String get(String urlString) throws Exception {

        HttpURLConnection connection = (HttpURLConnection) new URL(urlString).openConnection();
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(60_000);

        try {
            int responseCode = connection.getResponseCode();
            if (responseCode != 200) {
                throw new IllegalStateException(
                        "NASA POWER request failed with response code: " + responseCode);
            }
            StringBuilder response = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
            }
            return response.toString();
        } finally {
            connection.disconnect();
        }
    }

    /**
     * Parse one parameter out of a daily point response into a
     * date (YYYYMMDD) -> value map, sorted by date. Fill values
     * (-999) are skipped.
     */
    public Map<String, Double> parseDailyValues(String jsonResponse, String parameter)
            throws Exception {
        // Response shape: { ..., "properties": { "parameter": { "<NAME>": { "20240101": 1.5, ... } } } }
        JsonNode values = objectMapper.readTree(jsonResponse)
                .path("properties")
                .path("parameter")
                .path(parameter);

        Map<String, Double> daily = new TreeMap<>();
        if (!values.isObject()) {
            return daily;
        }
        values.fields().forEachRemaining(entry -> {
            // Missing measurements arrive as JSON null (or strings); only
            // real numbers are data — coercing them via asDouble() would
            // turn a null cell into a fake 0.0 sample.
            if (!entry.getValue().isNumber()) {
                return;
            }
            double value = entry.getValue().asDouble();
            if (value != FILL_VALUE) {
                daily.put(entry.getKey(), value);
            }
        });
        return daily;
    }

    /** Units string POWER reports for a parameter, e.g. "W m-2" or
     *  "kW-hr/m^2/day" — null when the response does not say. POWER
     *  switched ALLSKY_SFC_SW_DWN to source-native daily-mean W/m² for
     *  the "Source Native Resolution" release, so the units must be
     *  checked per response, not assumed. */
    public String parseUnits(String jsonResponse, String parameter) throws Exception {
        JsonNode node = objectMapper.readTree(jsonResponse)
                .path("parameters")
                .path(parameter)
                .path("units");
        return node.isTextual() ? node.asText() : null;
    }

    /** Elevation of the requested point in meters, read from the z value
     *  of the GeoJSON geometry coordinates. POWER has no ELEV parameter
     *  (any community returns 422 for it), but every point response
     *  carries the grid-cell elevation there. null when absent. */
    public Double parseElevation(String jsonResponse) throws Exception {
        JsonNode coords = objectMapper.readTree(jsonResponse)
                .path("geometry")
                .path("coordinates");
        if (coords.isArray() && coords.size() >= 3 && coords.get(2).isNumber()) {
            return coords.get(2).asDouble();
        }
        return null;
    }

    /** Simple per-day record for callers that prefer a list. */
    public List<SolarRadiationData> parseSolarRadiationData(String jsonResponse)
            throws Exception {
        Map<String, Double> daily = parseDailyValues(jsonResponse, "ALLSKY_SFC_SW_DWN");
        List<SolarRadiationData> points = new ArrayList<>();
        for (Map.Entry<String, Double> entry : daily.entrySet()) {
            SolarRadiationData point = new SolarRadiationData();
            point.setDate(entry.getKey());
            point.setRadiation(entry.getValue());
            points.add(point);
        }
        return points;
    }

    /** Daily value record (ALLSKY_SFC_SW_DWN, kWh/m²/day). */
    public static class SolarRadiationData {
        private String date;
        private double radiation;

        public String getDate() { return date; }
        public void setDate(String date) { this.date = date; }
        public double getRadiation() { return radiation; }
        public void setRadiation(double radiation) { this.radiation = radiation; }

        @Override
        public String toString() {
            return "SolarRadiationData{date='" + date + "', radiation=" + radiation + "}";
        }
    }
}

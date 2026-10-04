package com.example;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;

/**
 * Small HTTP API exposing the NASA POWER service to the frontend.
 *
 * Endpoints (all GET, all JSON):
 *   /api/health                     -> liveness probe
 *   /api/solar?lat&lon&start&end    -> daily ALLSKY_SFC_SW_DWN + stats
 *   /api/weather?lat&lon&parameters&start&end -> arbitrary parameters
 *   /api/climatology?lat&lon         -> monthly climatology T2M/solar/wind
 *   POST /api/explain (JSON snapshot) -> Gemini plain-language explanation
 *
 * start/end are YYYYMMDD; both default to the last 30 days.
 * Binds 0.0.0.0:PORT (default 8080) so LAN clients can reach it.
 *
 * Response contract notes:
 *   - Solar values are always returned in kWh/m²/day. POWER's current
 *     "Source Native Resolution" responses report daily-mean W/m², which
 *     this server converts (x 0.024: W/m² x 24 h -> kWh/m²/day).
 *   - The pseudo-parameter ELEV is served from the response geometry
 *     (POWER rejects a real ELEV parameter with 422).
 *   - Known parameters are sanity-clamped to physical ranges.
 */
public class PowerApiServer {

    /** Sanity clamp ranges per parameter; values outside are clamped to
     *  the nearest bound so a corrupt upstream cell can't poison stats. */
    private static final Map<String, double[]> SANITY_RANGES = new LinkedHashMap<>();
    /** Physical daily insolation max (kWh/m²/day) — anything above is a
     *  units bug upstream, not a measurement. */
    private static final double SOLAR_MAX_KWH_M2_DAY = 8.0;
    /** W/m² (daily mean) -> kWh/m²/day. */
    private static final double W_M2_TO_KWH_M2_DAY = 0.024;
    /** Parameters POWER reports as energy fluxes. Their contract unit
     *  here is kWh/m²/day, but POWER varies the units per response, so
     *  each series is converted per the units string it carries. */
    private static final Set<String> SOLAR_FLUX_PARAMETERS = Set.of(
            "ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "ALLSKY_SFC_SW_DIFF");

    static {
        SANITY_RANGES.put("T2M", new double[]{-50, 50});
        SANITY_RANGES.put("ELEV", new double[]{-400, 9000});
        SANITY_RANGES.put("WS2M", new double[]{0, 40});
        SANITY_RANGES.put("RH2M", new double[]{0, 100});
        SANITY_RANGES.put("PRECTOTCORR", new double[]{0, 200});
    }

    private static final DateTimeFormatter POWER_DATE = DateTimeFormatter.ofPattern("uuuuMMdd")
            .withResolverStyle(java.time.format.ResolverStyle.STRICT);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final PowerApiService SERVICE = new PowerApiService();
    private static final ExplainService EXPLAIN = ExplainService.fromEnv();
    /** Climatology parameters served by /api/climatology. */
    static final String[] CLIMATOLOGY_PARAMETERS = {"T2M", "ALLSKY_SFC_SW_DWN", "WS2M"};

    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);

        server.createContext("/api/health", exchange ->
                respond(exchange, 200, MAPPER.createObjectNode().put("status", "ok")));
        server.createContext("/api/solar", PowerApiServer::handleSolar);
        server.createContext("/api/weather", PowerApiServer::handleWeather);
        server.createContext("/api/climatology", PowerApiServer::handleClimatology);
        server.createContext("/api/explain", PowerApiServer::handleExplain);

        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("PowerApiServer listening on 0.0.0.0:" + port);
    }

    private static void handleSolar(HttpExchange exchange) throws IOException {
        try {
            Map<String, String> params = query(exchange);
            double lat = requireCoordinate(params, "lat", -90, 90);
            double lon = requireCoordinate(params, "lon", -180, 180);
            String start = optionalDate(params, "start");
            String end = optionalDate(params, "end");
            if (start == null) start = defaultStart();
            if (end == null) end = defaultEnd();
            requireDateOrder(start, end);

            String json = SERVICE.fetchSolarRadiationData(lon, lat, start, end);
            Map<String, Double> daily = SERVICE.parseDailyValues(json, "ALLSKY_SFC_SW_DWN");
            if (daily.isEmpty()) {
                respondError(exchange, 502, "NASA POWER returned no usable data");
                return;
            }
            normalizeSolarValues(json, "ALLSKY_SFC_SW_DWN", daily);

            ObjectNode response = MAPPER.createObjectNode();
            ObjectNode request = response.putObject("request");
            request.put("lat", lat).put("lon", lon).put("start", start).put("end", end);
            ObjectNode dailyNode = response.putObject("daily");
            daily.forEach(dailyNode::put);
            response.set("stats", stats(daily));
            respond(exchange, 200, response);
        } catch (IllegalArgumentException e) {
            respondError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            respondError(exchange, 502, "NASA POWER request failed: " + e.getMessage());
        }
    }

    private static void handleWeather(HttpExchange exchange) throws IOException {
        try {
            Map<String, String> params = query(exchange);
            double lat = requireCoordinate(params, "lat", -90, 90);
            double lon = requireCoordinate(params, "lon", -180, 180);
            String parameters = params.getOrDefault("parameters", "T2M");
            String start = optionalDate(params, "start");
            String end = optionalDate(params, "end");
            if (start == null) start = defaultStart();
            if (end == null) end = defaultEnd();
            requireDateOrder(start, end);

            // ELEV is not a POWER parameter (the upstream 422s on it), so
            // it is served from the response geometry instead. Everything
            // else is passed through as one comma-separated request.
            boolean wantElev = false;
            StringBuilder powerParams = new StringBuilder();
            for (String name : parameters.split(",")) {
                String trimmed = name.trim().toUpperCase();
                if (trimmed.isEmpty()) continue;
                if (trimmed.equals("ELEV")) {
                    wantElev = true;
                    continue;
                }
                if (powerParams.length() > 0) powerParams.append(',');
                powerParams.append(trimmed);
            }
            if (powerParams.length() == 0 && !wantElev) {
                respondError(exchange, 400, "No valid parameters requested");
                return;
            }
            // An ELEV-only request still needs a POWER response to read
            // the geometry from: piggyback on T2M and drop its values.
            String requested = powerParams.length() > 0 ? powerParams.toString() : "T2M";

            String json = SERVICE.fetchWeatherData(lon, lat, requested, start, end);
            ObjectNode response = MAPPER.createObjectNode();
            ObjectNode request = response.putObject("request");
            request.put("lat", lat).put("lon", lon).put("parameters", parameters)
                   .put("start", start).put("end", end);

            ObjectNode parametersNode = response.putObject("parameters");
            if (powerParams.length() > 0) {
                for (String name : requested.split(",")) {
                    Map<String, Double> daily = SERVICE.parseDailyValues(json, name);
                    if (SOLAR_FLUX_PARAMETERS.contains(name)) {
                        // Radiation parameters go through the same units
                        // conversion + physical clamp as /api/solar — a raw
                        // W/m² series must never leak out of this endpoint.
                        normalizeSolarValues(json, name, daily);
                    } else {
                        applySanityClamp(name, daily);
                    }
                    ObjectNode dailyNode = parametersNode.putObject(name);
                    daily.forEach(dailyNode::put);
                }
            }
            if (wantElev) {
                Double elevation = SERVICE.parseElevation(json);
                ObjectNode dailyNode = parametersNode.putObject("ELEV");
                if (elevation != null && elevation >= -400 && elevation <= 9000) {
                    // Constant series on the last date: same date->value
                    // shape as every other parameter, one real measurement.
                    dailyNode.put(end, Math.round(elevation * 100.0) / 100.0);
                }
            }
            respond(exchange, 200, response);
        } catch (IllegalArgumentException e) {
            respondError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            respondError(exchange, 502, "NASA POWER request failed: " + e.getMessage());
        }
    }

    private static void handleClimatology(HttpExchange exchange) throws IOException {
        try {
            Map<String, String> params = query(exchange);
            double lat = requireCoordinate(params, "lat", -90, 90);
            double lon = requireCoordinate(params, "lon", -180, 180);
            String json = SERVICE.fetchClimatology(lon, lat, String.join(",", CLIMATOLOGY_PARAMETERS));
            ObjectNode response = MAPPER.createObjectNode();
            response.putObject("request").put("lat", lat).put("lon", lon);
            ObjectNode out = response.putObject("parameters");
            for (String name : CLIMATOLOGY_PARAMETERS) {
                double[] values = SERVICE.parseClimatology(json, name);
                if (values == null) continue;
                double factor = SOLAR_FLUX_PARAMETERS.contains(name)
                        ? solarUnitsToKwhFactor(SERVICE.parseUnits(json, name)) : 1.0;
                double[] range = SOLAR_FLUX_PARAMETERS.contains(name)
                        ? new double[]{0, SOLAR_MAX_KWH_M2_DAY} : SANITY_RANGES.get(name);
                ObjectNode node = out.putObject(name);
                com.fasterxml.jackson.databind.node.ArrayNode monthly = node.putArray("monthly");
                for (int i = 0; i < 13; i++) {
                    double v = values[i] * factor;
                    if (range != null) v = Math.max(range[0], Math.min(range[1], v));
                    if (i < 12) monthly.add(round(v));
                    else node.put("annual", round(v));
                }
            }
            if (out.isEmpty()) {
                respondError(exchange, 502, "NASA POWER returned no usable climatology");
                return;
            }
            respond(exchange, 200, response);
        } catch (IllegalArgumentException e) {
            respondError(exchange, 400, e.getMessage());
        } catch (Exception e) {
            respondError(exchange, 502, "NASA POWER request failed: " + e.getMessage());
        }
    }

    private static void handleExplain(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        if (method.equalsIgnoreCase("OPTIONS")) {
            // CORS preflight for the JSON POST from the dev origin.
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }
        if (!method.equalsIgnoreCase("POST")) {
            respondError(exchange, 405, "Use POST");
            return;
        }
        if (!EXPLAIN.configured()) {
            respondError(exchange, 503, "AI explanations are not configured (GEMINI_API_KEY unset)");
            return;
        }
        String client = exchange.getRemoteAddress().getAddress().getHostAddress();
        if (!EXPLAIN.allow(client)) {
            respondError(exchange, 429, "Rate limit: max 10 explanations per minute");
            return;
        }
        try {
            byte[] body = ExplainService.readLimited(exchange.getRequestBody());
            com.fasterxml.jackson.databind.JsonNode snapshot = MAPPER.readTree(ExplainService.utf8(body));
            if (snapshot == null || !snapshot.isObject()) {
                throw new IllegalArgumentException("Body must be a JSON object");
            }
            ExplainService.Result result = EXPLAIN.explain(snapshot);
            ObjectNode response = MAPPER.createObjectNode()
                    .put("text", result.text())
                    .put("cached", result.cached())
                    .put("model", result.model());
            respond(exchange, 200, response);
        } catch (IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException e) {
            respondError(exchange, 400, e.getMessage());
        } catch (java.net.http.HttpTimeoutException e) {
            respondError(exchange, 504, "AI explanation timed out");
        } catch (Exception e) {
            respondError(exchange, 502, "AI explanation failed: " + e.getMessage());
        }
    }

    /** Clamp a parameter's daily values into its physical range. */
    private static void applySanityClamp(String parameter, Map<String, Double> daily) {
        double[] range = SANITY_RANGES.get(parameter);
        if (range == null) return;
        daily.replaceAll((date, value) -> Math.max(range[0], Math.min(range[1], value)));
    }

    /**
     * Conversion factor from a POWER units string to the contract unit
     * kWh/m²/day. POWER has shipped the radiation parameters under
     * several unit spellings across releases (currently daily-mean
     * W/m², historically MJ/m²/day and kW-hr/m²/day), so the known
     * families are normalized here instead of exact-matching one
     * string; an unrecognized unit is an upstream contract change we
     * must refuse (the caller answers 502) rather than silently
     * clamp into plausible-looking garbage.
     * A missing units string is assumed to already be the contract unit.
     */
    static double solarUnitsToKwhFactor(String units) {
        if (units == null) return 1.0;
        String u = units.toLowerCase(java.util.Locale.ROOT).replace('/', ' ').trim();
        if (u.startsWith("mj")) return 1.0 / 3.6;
        if (u.startsWith("kw")) return 1.0;
        if (u.startsWith("w")) return W_M2_TO_KWH_M2_DAY;
        throw new IllegalStateException("Unrecognized POWER units: " + units);
    }

    /**
     * Convert one solar-flux series to kWh/m²/day per the units string
     * the response carries, then clamp to the physical maximum.
     * Shared by /api/solar and the radiation parameters of /api/weather.
     */
    static void normalizeSolarValues(String json, String parameter,
                                     Map<String, Double> daily) throws Exception {
        double factor = solarUnitsToKwhFactor(SERVICE.parseUnits(json, parameter));
        if (factor != 1.0) {
            daily.replaceAll((date, value) -> value * factor);
        }
        daily.replaceAll((date, value) ->
                Math.max(0, Math.min(SOLAR_MAX_KWH_M2_DAY, value)));
    }

    static ObjectNode stats(Map<String, Double> daily) {
        // +/- infinity (not Double.MIN_VALUE, which is the smallest
        // POSITIVE double and would break all-negative series).
        double sum = 0, min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
        for (double value : daily.values()) {
            sum += value;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        ObjectNode stats = MAPPER.createObjectNode();
        stats.put("count", daily.size());
        stats.put("avg", round(sum / daily.size()));
        stats.put("min", round(min));
        stats.put("max", round(max));
        stats.put("total", round(sum));
        return stats;
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // --- request/response helpers -------------------------------------

    private static Map<String, String> query(HttpExchange exchange) {
        Map<String, String> params = new HashMap<>();
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null) return params;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) {
                params.put(
                        URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8),
                        URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8));
            }
        }
        return params;
    }

    private static double requireDouble(Map<String, String> params, String name) {
        String value = params.get(name);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing required query parameter: " + name);
        }
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Parameter '" + name + "' is not a number: " + value);
        }
    }

    /** Parse + range-check a coordinate: NaN/Infinity parse fine as
     *  doubles, and out-of-range values would only surface as a
     *  misleading upstream 400->502 later, so reject them here with a
     *  clear 400. */
    static double requireCoordinate(Map<String, String> params, String name,
                                    double min, double max) {
        double value = requireDouble(params, name);
        if (!Double.isFinite(value) || value < min || value > max) {
            throw new IllegalArgumentException(
                    "Parameter '" + name + "' out of range (" + min + "..." + max + "): " + value);
        }
        return value;
    }

    /** Validate an explicit start/end parameter (YYYYMMDD); null when
     *  the client didn't send one (the default window applies). */
    static String optionalDate(Map<String, String> params, String name) {
        String value = params.get(name);
        if (value == null) return null;
        if (!value.matches("\\d{8}")) {
            throw new IllegalArgumentException(
                    "Parameter '" + name + "' must be YYYYMMDD: " + value);
        }
        try {
            LocalDate.parse(value, POWER_DATE);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(
                    "Parameter '" + name + "' is not a real date: " + value);
        }
        return value;
    }

    /** A reversed range would only 400 upstream (surfacing as 502), so
     *  catch it locally. Both values are already validated YYYYMMDD. */
    static void requireDateOrder(String start, String end) {
        if (LocalDate.parse(start, POWER_DATE).isAfter(LocalDate.parse(end, POWER_DATE))) {
            throw new IllegalArgumentException("start date is after end date");
        }
    }

    /** Last 30 days, inclusive (minusDays(29) + today), on UTC so the
     *  window doesn't shift with the host's timezone. */
    private static String defaultStart() {
        return LocalDate.now(ZoneOffset.UTC).minusDays(29).format(POWER_DATE);
    }

    private static String defaultEnd() {
        return LocalDate.now(ZoneOffset.UTC).format(POWER_DATE);
    }

    private static void respond(HttpExchange exchange, int status, ObjectNode body)
            throws IOException {
        send(exchange, status, MAPPER.writeValueAsString(body));
    }

    private static void respondError(HttpExchange exchange, int status, String message)
            throws IOException {
        ObjectNode error = MAPPER.createObjectNode().put("error", message);
        send(exchange, status, MAPPER.writeValueAsString(error));
    }

    private static void send(HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        // The frontend runs on a different origin during development.
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}

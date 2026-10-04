package com.example;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for the pure request/parsing logic of the POWER server —
 * the units conversion and stats path that once shipped raw W/m²
 * labelled as kWh/m²/day (the "248 kWh/m²·d" bug). No network needed.
 */
class PowerApiLogicTest {

    // --- units conversion -------------------------------------------------

    @Test
    void wM2UnitsConvertBy0024() {
        assertEquals(0.024, PowerApiServer.solarUnitsToKwhFactor("W m-2"), 1e-12);
        assertEquals(0.024, PowerApiServer.solarUnitsToKwhFactor("w/m2"), 1e-12);
        assertEquals(0.024, PowerApiServer.solarUnitsToKwhFactor("W/M2"), 1e-12);
    }

    @Test
    void mjUnitsConvertByOneOver36() {
        assertEquals(1.0 / 3.6, PowerApiServer.solarUnitsToKwhFactor("MJ/m^2/day"), 1e-12);
        assertEquals(1.0 / 3.6, PowerApiServer.solarUnitsToKwhFactor("MJ m-2 day-1"), 1e-12);
    }

    @Test
    void kwhUnitsPassThrough() {
        assertEquals(1.0, PowerApiServer.solarUnitsToKwhFactor("kW-hr/m^2/day"), 1e-12);
        assertEquals(1.0, PowerApiServer.solarUnitsToKwhFactor("kWh/m2/day"), 1e-12);
    }

    @Test
    void missingUnitsAssumeContractUnit() {
        assertEquals(1.0, PowerApiServer.solarUnitsToKwhFactor(null));
    }

    @Test
    void unknownUnitsAreRejectedNotClamped() {
        assertThrows(IllegalStateException.class,
                () -> PowerApiServer.solarUnitsToKwhFactor("furlongs/fortnight"));
    }

    // --- full solar normalization (units + clamp) --------------------------

    /** Build a minimal POWER point response for one parameter. */
    private static String powerResponse(String units, double... values) {
        StringBuilder series = new StringBuilder();
        for (int i = 0; i < values.length; i++) {
            if (i > 0) series.append(',');
            series.append(String.format("\"202601%02d\":%s", i + 1, values[i]));
        }
        String unitsNode = units == null ? "" : "\"units\":\"" + units + "\"";
        return """
                {"parameters":{"ALLSKY_SFC_SW_DWN":{%s}},
                 "properties":{"parameter":{"ALLSKY_SFC_SW_DWN":{%s}}}}
                """.formatted(unitsNode, series);
    }

    @Test
    void rawWM2SeriesIsConverted() throws Exception {
        Map<String, Double> daily = new LinkedHashMap<>();
        daily.put("20260101", 248.5); // raw W/m² — the "248 kWh/m²·d" bug
        PowerApiServer.normalizeSolarValues(
                powerResponse("W m-2", 248.5), "ALLSKY_SFC_SW_DWN", daily);
        assertEquals(5.964, daily.get("20260101"), 1e-9); // 248.5 * 0.024
    }

    @Test
    void physicalMaximumIsEnforcedAfterConversion() throws Exception {
        Map<String, Double> daily = new LinkedHashMap<>();
        daily.put("20260101", 248.5);
        daily.put("20260102", 400.0); // 400 W/m² -> 9.6 kWh -> clamped to 8
        PowerApiServer.normalizeSolarValues(
                powerResponse("W m-2", 248.5, 400.0), "ALLSKY_SFC_SW_DWN", daily);
        assertEquals(5.964, daily.get("20260101"), 1e-9);
        assertEquals(8.0, daily.get("20260102"), 1e-9);
    }

    @Test
    void mjSeriesIsDividedBy36() throws Exception {
        Map<String, Double> daily = new LinkedHashMap<>();
        daily.put("20260101", 25.2); // MJ/m²/day
        PowerApiServer.normalizeSolarValues(
                powerResponse("MJ/m^2/day", 25.2), "ALLSKY_SFC_SW_DWN", daily);
        assertEquals(7.0, daily.get("20260101"), 1e-9);
    }

    @Test
    void unknownUnitsRefuseTheSeries() {
        Map<String, Double> daily = new LinkedHashMap<>();
        daily.put("20260101", 42.0);
        assertThrows(IllegalStateException.class, () -> PowerApiServer.normalizeSolarValues(
                powerResponse("furlongs", 42.0), "ALLSKY_SFC_SW_DWN", daily));
    }

    // --- stats -------------------------------------------------------------

    @Test
    void statsComputeMinMaxAvgTotal() {
        Map<String, Double> daily = new LinkedHashMap<>();
        daily.put("20260101", 2.0);
        daily.put("20260102", 4.0);
        daily.put("20260103", 6.0);
        ObjectNode stats = PowerApiServer.stats(daily);
        assertEquals(3, stats.get("count").asInt());
        assertEquals(2.0, stats.get("min").asDouble(), 1e-9);
        assertEquals(6.0, stats.get("max").asDouble(), 1e-9);
        assertEquals(4.0, stats.get("avg").asDouble(), 1e-9);
        assertEquals(12.0, stats.get("total").asDouble(), 1e-9);
    }

    @Test
    void statsRoundToTwoDecimals() {
        Map<String, Double> daily = new LinkedHashMap<>();
        daily.put("20260101", 1.0);
        daily.put("20260102", 4.0);
        daily.put("20260103", 5.0);
        ObjectNode stats = PowerApiServer.stats(daily);
        assertEquals(3.33, stats.get("avg").asDouble(), 1e-9);
    }

    // --- request validation -------------------------------------------------

    @Test
    void coordinatesAcceptValidRanges() {
        Map<String, String> p = Map.of("lat", "-89.5", "lon", "180");
        assertEquals(-89.5, PowerApiServer.requireCoordinate(p, "lat", -90, 90));
        assertEquals(180.0, PowerApiServer.requireCoordinate(p, "lon", -180, 180));
    }

    @Test
    void coordinatesRejectNanInfinityAndRange() {
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.requireCoordinate(
                Map.of("lat", "NaN"), "lat", -90, 90));
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.requireCoordinate(
                Map.of("lat", "Infinity"), "lat", -90, 90));
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.requireCoordinate(
                Map.of("lat", "999"), "lat", -90, 90));
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.requireCoordinate(
                Map.of("lon", "-181"), "lon", -180, 180));
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.requireCoordinate(
                Map.of("lat", ""), "lat", -90, 90));
    }

    @Test
    void datesAcceptYYYYMMDDOnly() {
        Map<String, String> ok = Map.of("start", "20260131", "end", "20260201");
        assertEquals("20260131", PowerApiServer.optionalDate(ok, "start"));
        assertNull(PowerApiServer.optionalDate(Map.of(), "start"));
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.optionalDate(
                Map.of("start", "2026-01-31"), "start"));
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.optionalDate(
                Map.of("start", "20260230"), "start")); // not a real date
        assertThrows(IllegalArgumentException.class, () -> PowerApiServer.optionalDate(
                Map.of("start", "droptable"), "start"));
    }

    @Test
    void reversedRangesAreRejected() {
        assertDoesNotThrow(() -> PowerApiServer.requireDateOrder("20260101", "20260131"));
        assertThrows(IllegalArgumentException.class,
                () -> PowerApiServer.requireDateOrder("20260131", "20260101"));
    }

    // --- daily-value parsing -------------------------------------------------

    @Test
    void parseSkipsFillNullAndNonNumericCells() throws Exception {
        //language=JSON
        String json = """
                {"properties":{"parameter":{"T2M":{
                  "20260101":12.5,
                  "20260102":-999.0,
                  "20260103":null,
                  "20260104":"17",
                  "20260105":0.0
                }}}}
                """;
        Map<String, Double> daily = new PowerApiService().parseDailyValues(json, "T2M");
        assertEquals(2, daily.size()); // fill and null/string cells are not data
        assertEquals(12.5, daily.get("20260101"), 1e-9);
        assertEquals(0.0, daily.get("20260105"), 1e-9); // a real 0.0 survives
    }
}

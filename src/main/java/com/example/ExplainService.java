package com.example;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Plain-language explanations of the dashboard numbers via Google Gemini.
 *
 * The frontend posts a JSON snapshot of exactly what the UI shows; this
 * service wraps it in a fixed system prompt that forbids computing new
 * numbers, calls Gemini (JDK java.net.http, no SDK), and caches the
 * answer per snapshot hash. The API key comes from GEMINI_API_KEY and
 * never leaves the server.
 */
public class ExplainService {

    static final String SYSTEM_PROMPT = String.join("\n",
            "You explain an environmental-impact dashboard to non-experts.",
            "You receive a JSON snapshot of exactly what the user sees: a site, a facility kind,",
            "the selected timeline month, metrics with units, and for each metric a provenance label",
            "and a short formula description. When 'projected' values are present, the user moved",
            "the timeline: explain what changed between 'initial' and 'projected' and why, using",
            "the given formula descriptions.",
            "",
            "Hard rules:",
            "- Use ONLY numbers that appear in the snapshot. Never compute, estimate, round",
            "  differently, or invent new numbers, percentages, comparisons or facts about the site.",
            "- Respect provenance: REAL = measured/published dataset; DERIVED = a formula over real",
            "  inputs (or interpolated); SYNTHETIC = a model assumption. Say plainly when a number",
            "  is an assumption rather than a measurement.",
            "- If something cannot be explained from the snapshot, say so briefly instead of guessing.",
            "- Plain English, no jargon without a one-phrase explanation, 120-180 words,",
            "  short paragraphs or a few bullet points, no headings, no markdown tables.");

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    /** Max accepted request body (bytes): a snapshot is ~2-4 KB. */
    static final int MAX_BODY_BYTES = 16 * 1024;
    static final Duration TIMEOUT = Duration.ofSeconds(20);
    private static final int CACHE_SIZE = 200;

    private final String apiKey;
    private final String model;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();
    private final RateLimiter limiter = new RateLimiter(10, 60_000);

    /** LRU cache: snapshot hash -> explanation text. */
    private final Map<String, String> cache = new LinkedHashMap<>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > CACHE_SIZE;
        }
    };

    public ExplainService(String apiKey, String model) {
        this.apiKey = apiKey;
        this.model = model == null || model.isBlank() ? "gemini-2.5-flash" : model;
    }

    public static ExplainService fromEnv() {
        return new ExplainService(System.getenv("GEMINI_API_KEY"), System.getenv("GEMINI_MODEL"));
    }

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public boolean allow(String clientKey) {
        return limiter.allow(clientKey, System.currentTimeMillis());
    }

    /** Result of one explain call. */
    public record Result(String text, boolean cached, String model) {}

    public Result explain(JsonNode snapshot) throws Exception {
        String key = hash(snapshot);
        synchronized (cache) {
            String hit = cache.get(key);
            if (hit != null) return new Result(hit, true, model);
        }
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://generativelanguage.googleapis.com/v1beta/models/"
                        + model + ":generateContent"))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(buildRequestBody(snapshot)))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("Gemini returned HTTP " + response.statusCode());
        }
        String text = parseResponseText(response.body());
        if (text == null || text.isBlank()) {
            throw new IllegalStateException("Gemini returned no text");
        }
        synchronized (cache) {
            cache.put(key, text);
        }
        return new Result(text, false, model);
    }

    /** Stable SHA-256 of a snapshot: keys sorted, whitespace-free. */
    static String hash(JsonNode snapshot) throws Exception {
        Object canonical = MAPPER.treeToValue(snapshot, Object.class);
        byte[] bytes = MAPPER.writeValueAsBytes(canonical);
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    /** Gemini generateContent body: fixed system prompt + snapshot. */
    static String buildRequestBody(JsonNode snapshot) throws Exception {
        ObjectNode body = MAPPER.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", SYSTEM_PROMPT);
        ArrayNode contents = body.putArray("contents");
        ObjectNode user = contents.addObject().put("role", "user");
        user.putArray("parts").addObject().put("text",
                "Dashboard snapshot (JSON):\n" + MAPPER.writeValueAsString(snapshot));
        ObjectNode config = body.putObject("generationConfig");
        config.put("temperature", 0.3);
        config.put("maxOutputTokens", 700);
        // 2.5-series models spend output tokens on "thinking" by default;
        // the task is explanation only, so turn it off.
        config.putObject("thinkingConfig").put("thinkingBudget", 0);
        return MAPPER.writeValueAsString(body);
    }

    /** Concatenated text parts of the first candidate, or null. */
    static String parseResponseText(String json) throws Exception {
        JsonNode parts = MAPPER.readTree(json).path("candidates").path(0).path("content").path("parts");
        if (!parts.isArray()) return null;
        StringBuilder out = new StringBuilder();
        for (JsonNode p : parts) {
            if (p.path("text").isTextual()) out.append(p.path("text").asText());
        }
        return out.toString().trim();
    }

    /** Sliding-window limiter: at most `limit` calls per `windowMs` per key. */
    static class RateLimiter {
        private final int limit;
        private final long windowMs;
        private final Map<String, Deque<Long>> hits = new LinkedHashMap<>();

        RateLimiter(int limit, long windowMs) {
            this.limit = limit;
            this.windowMs = windowMs;
        }

        synchronized boolean allow(String key, long nowMs) {
            Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
            while (!q.isEmpty() && nowMs - q.peekFirst() >= windowMs) q.pollFirst();
            if (q.size() >= limit) return false;
            q.addLast(nowMs);
            if (hits.size() > 1000) hits.entrySet().removeIf(e -> e.getValue().isEmpty());
            return true;
        }
    }

    static byte[] readLimited(java.io.InputStream in) throws java.io.IOException {
        byte[] data = in.readNBytes(MAX_BODY_BYTES + 1);
        if (data.length > MAX_BODY_BYTES) throw new IllegalArgumentException("Snapshot too large");
        return data;
    }

    static String utf8(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }
}

package com.example;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Pure logic of the explain endpoint and climatology parsing — no network. */
class ExplainServiceTest {

    private static final ObjectMapper M = new ObjectMapper();

    @Test
    void hashIgnoresKeyOrderAndWhitespace() throws Exception {
        JsonNode a = M.readTree("{\"b\":1,\"a\":{\"y\":2,\"x\":3}}");
        JsonNode b = M.readTree("{ \"a\": {\"x\":3, \"y\":2}, \"b\": 1 }");
        assertEquals(ExplainService.hash(a), ExplainService.hash(b));
        assertNotEquals(ExplainService.hash(a), ExplainService.hash(M.readTree("{\"b\":2}")));
    }

    @Test
    void requestBodyCarriesSystemPromptAndSnapshot() throws Exception {
        JsonNode body = M.readTree(ExplainService.buildRequestBody(M.readTree("{\"site\":\"X\"}")));
        assertTrue(body.at("/systemInstruction/parts/0/text").asText().contains("ONLY numbers"));
        assertTrue(body.at("/contents/0/parts/0/text").asText().contains("\"site\":\"X\""));
        assertEquals("minimal", body.at("/generationConfig/thinkingConfig/thinkingLevel").asText());
    }

    @Test
    void parsesGeminiText() throws Exception {
        String json = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello \"},{\"text\":\"world\"}]}}]}";
        assertEquals("Hello world", ExplainService.parseResponseText(json));
        assertNull(ExplainService.parseResponseText("{}"));
    }

    @Test
    void rateLimiterSlidingWindow() {
        ExplainService.RateLimiter rl = new ExplainService.RateLimiter(2, 1000);
        assertTrue(rl.allow("a", 0));
        assertTrue(rl.allow("a", 10));
        assertFalse(rl.allow("a", 20));
        assertTrue(rl.allow("b", 20));
        assertTrue(rl.allow("a", 1001));
    }

    @Test
    void unconfiguredWithoutKey() {
        assertFalse(new ExplainService(null, null).configured());
        assertFalse(new ExplainService(" ", null).configured());
        assertTrue(new ExplainService("k", null).configured());
    }

    @Test
    void parsesClimatologyMonthsAndAnnual() throws Exception {
        String json = "{\"properties\":{\"parameter\":{\"T2M\":{\"JAN\":1,\"FEB\":2,\"MAR\":3,\"APR\":4,"
                + "\"MAY\":5,\"JUN\":6,\"JUL\":7,\"AUG\":8,\"SEP\":9,\"OCT\":10,\"NOV\":11,\"DEC\":12,\"ANN\":6.5}}}}";
        double[] v = new PowerApiService().parseClimatology(json, "T2M");
        assertEquals(13, v.length);
        assertEquals(1, v[0]);
        assertEquals(6.5, v[12]);
        assertNull(new PowerApiService().parseClimatology(json, "WS2M"));
    }
}

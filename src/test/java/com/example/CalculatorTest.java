package com.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("Calculator")
class CalculatorTest {

    private Calculator calculator;

    @BeforeEach
    void setUp() {
        calculator = new Calculator();
    }

    @Test
    @DisplayName("adds two positive numbers")
    void addsPositiveNumbers() {
        assertEquals(7, calculator.add(3, 4));
    }

    @Test
    @DisplayName("adds negative numbers")
    void addsNegativeNumbers() {
        assertEquals(-5, calculator.add(-8, 3));
    }

    @Test
    @DisplayName("returns zero when adding zero")
    void addingZero() {
        assertEquals(42, calculator.add(42, 0));
    }

    @Nested
    @DisplayName("divide")
    class Divide {

        @Test
        @DisplayName("returns the quotient")
        void divides() {
            assertEquals(2.5, calculator.divide(5, 2), 1e-9);
        }

        @Test
        @DisplayName("throws on division by zero")
        void throwsOnDivideByZero() {
            ArithmeticException ex =
                    assertThrows(ArithmeticException.class, () -> calculator.divide(1, 0));
            assertTrue(ex.getMessage().contains("divide by zero"));
        }
    }

    @Test
    @DisplayName("throws when multiplying overflows int")
    void multiplyOverflow() {
        assertThrows(ArithmeticException.class, () -> calculator.add(Integer.MAX_VALUE, 1));
    }
}

package com.example;

/**
 * Minimal example class used by {@link CalculatorTest} to demonstrate JUnit 5.
 */
public final class Calculator {

    /**
     * Adds two integers.
     *
     * @throws ArithmeticException if the result overflows an int
     */
    public int add(int a, int b) {
        return Math.addExact(a, b);
    }

    /**
     * Divides {@code a} by {@code b}.
     *
     * @throws ArithmeticException if {@code b} is zero
     */
    public double divide(int a, int b) {
        if (b == 0) {
            throw new ArithmeticException("Cannot divide by zero");
        }
        return (double) a / b;
    }
}

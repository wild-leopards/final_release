# Usage Examples - NASA POWER API Integration

This document provides practical examples of how to use the NASA POWER API integration for your "Energy Around Us" hackathon project.

## Table of Contents
1. [Basic Solar Radiation Query](#basic-solar-radiation-query)
2. [Weather Data Integration](#weather-data-integration)
3. [Regional Analysis](#regional-analysis)
4. [Data Visualization](#data-visualization)
5. [Advanced Features](#advanced-features)

## Basic Solar Radiation Query

### Example 1: Single Location Daily Data

```java
import com.example.PowerApiService;

public class Example1 {
    public static void main(String[] args) {
        try {
            // Create service instance
            PowerApiService service = new PowerApiService();

            // Configuration for Berlin, Germany
            double longitude = 52.5200;
            double latitude = 13.4050;

            // Date range: January 2024
            String startDate = "20240101";
            String endDate = "20240131";

            // Fetch solar radiation data
            String jsonResponse = service.fetchSolarRadiationData(
                longitude, latitude, startDate, endDate);

            // Parse the response
            List<SolarRadiationData> dataPoints = service.parseSolarRadiationData(jsonResponse);

            // Display results
            System.out.println("Solar Radiation Data for Berlin, Germany:");
            System.out.println("Date Range: " + startDate + " to " + endDate);
            System.out.println("Number of Days: " + dataPoints.size());
            System.out.println();

            // Calculate and display statistics
            double total = 0, max = Double.MIN_VALUE, min = Double.MAX_VALUE;
            for (SolarRadiationData point : dataPoints) {
                total += point.getRadiation();
                max = Math.max(max, point.getRadiation());
                min = Math.min(min, point.getRadiation());
            }
            double avg = total / dataPoints.size();

            System.out.printf("Average: %.2f W/m²%n", avg);
            System.out.printf("Maximum: %.2f W/m²%n", max);
            System.out.printf("Minimum: %.2f W/m²%n", min);
            System.out.printf("Total: %.2f W/m²%n", total);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Example 2: Hourly Data for a Specific Day

```java
import com.example.PowerApiService;

public class Example2 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            double longitude = 52.5200;
            double latitude = 13.4050;
            String startDate = "20240115";
            String endDate = "20240115";

            // Fetch hourly solar radiation data
            String jsonResponse = service.fetchSolarRadiationData(
                longitude, latitude, startDate, endDate);

            List<SolarRadiationData> dataPoints = service.parseSolarRadiationData(jsonResponse);

            System.out.println("Hourly Solar Radiation Data for January 15, 2024:");
            System.out.println("Total Hours: " + dataPoints.size());
            System.out.println();

            for (SolarRadiationData point : dataPoints) {
                System.out.printf("Time: %s - Radiation: %.2f W/m²%n",
                    point.getDate(), point.getRadiation());
            }

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

## Weather Data Integration

### Example 3: Multiple Meteorological Parameters

```java
import com.example.PowerApiService;

public class Example3 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService("SB", "CSV");

            double longitude = 52.5200;
            double latitude = 13.4050;

            // Request multiple parameters
            String parameters = "T2M,T2M_MAX,T2M_MIN,WS10M,WD10M,RH2M,PS";

            String startDate = "20240101";
            String endDate = "20240131";

            String jsonResponse = service.fetchWeatherData(
                longitude, latitude, parameters, startDate, endDate);

            System.out.println("Weather Data for Berlin, Germany:");
            System.out.println("Parameters: " + parameters);
            System.out.println("Date Range: " + startDate + " to " + endDate);
            System.out.println();
            System.out.println("CSV Response:");
            System.out.println(jsonResponse);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Example 4: Temperature Analysis

```java
import com.example.PowerApiService;

public class Example4 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            double longitude = 52.5200;
            double latitude = 13.4050;

            // Request temperature parameters
            String parameters = "T2M,T2M_MAX,T2M_MIN";
            String startDate = "20240101";
            String endDate = "20240131";

            String jsonResponse = service.fetchWeatherData(
                longitude, latitude, parameters, startDate, endDate);

            // Parse and analyze temperature data
            // (Implementation depends on your parsing strategy)

            System.out.println("Temperature Analysis for Berlin, Germany:");
            System.out.println("Analyzing: " + parameters);
            System.out.println("Period: " + startDate + " to " + endDate);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

## Regional Analysis

### Example 5: Regional Data (Bounding Box)

```java
import com.example.PowerApiService;

public class Example5 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            // Define regional boundaries (e.g., Germany)
            double minLat = 47.0;
            double maxLat = 55.0;
            double minLon = 5.0;
            double maxLon = 15.0;

            String parameters = "ALLSKY_SFC_SW_DWN";
            String startDate = "20240101";
            String endDate = "20240131";

            // Regional request
            String regionUrl = String.format(
                "%s%s/regional?latitude-min=%.2f&latitude-max=%.2f&longitude-min=%.2f&longitude-max=%.2f&parameters=%s&community=SB&start=%s&end=%s&format=CSV",
                PowerApiService.BASE_URL, PowerApiService.API_VERSION,
                minLat, maxLat, minLon, maxLon,
                parameters, startDate, endDate);

            // Make HTTP request and process response
            System.out.println("Regional Solar Radiation Analysis:");
            System.out.println("Region: Germany (bounding box)");
            System.out.println("Date Range: " + startDate + " to " + endDate);
            System.out.println("URL: " + regionUrl);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

## Data Visualization

### Example 6: Solar Radiation Trend Analysis

```java
import com.example.PowerApiService;
import java.util.List;

public class Example6 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            double longitude = 52.5200;
            double latitude = 13.4050;
            String startDate = "20240101";
            String endDate = "20240131";

            // Fetch solar radiation data
            String jsonResponse = service.fetchSolarRadiationData(
                longitude, latitude, startDate, endDate);

            List<SolarRadiationData> dataPoints = service.parseSolarRadiationData(jsonResponse);

            // Calculate daily averages for visualization
            double[] radiationValues = new double[dataPoints.size()];
            for (int i = 0; i < dataPoints.size(); i++) {
                radiationValues[i] = dataPoints.get(i).getRadiation();
            }

            // Create visualization (implementation depends on your framework)
            System.out.println("Solar Radiation Trend Analysis:");
            System.out.println("Total days analyzed: " + dataPoints.size());
            System.out.println("Average daily radiation: " +
                calculateAverage(radiationValues) + " W/m²");
            System.out.println("Peak day: " + findPeakDay(dataPoints));

            // Here you would integrate with a visualization library
            // like JFreeChart, Chart.js, or your preferred framework

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static double calculateAverage(double[] values) {
        double sum = 0;
        for (double value : values) {
            sum += value;
        }
        return sum / values.length;
    }

    private static int findPeakDay(List<SolarRadiationData> dataPoints) {
        int peakIndex = 0;
        double peakValue = Double.MIN_VALUE;

        for (int i = 0; i < dataPoints.size(); i++) {
            if (dataPoints.get(i).getRadiation() > peakValue) {
                peakValue = dataPoints.get(i).getRadiation();
                peakIndex = i;
            }
        }
        return peakIndex;
    }
}
```

### Example 7: Comparison Between Two Locations

```java
import com.example.PowerApiService;
import java.util.List;

public class Example7 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            // Define two locations for comparison
            double[] berlinLon = {52.5200, 13.4050};
            double[] parisLon = {48.8566, 2.3522};

            String startDate = "20240101";
            String endDate = "20240131";

            // Fetch data for both locations
            List<SolarRadiationData> berlinData = getSolarData(service, berlinLon[0], berlinLon[1], startDate, endDate);
            List<SolarRadiationData> parisData = getSolarData(service, parisLon[0], parisLon[1], startDate, endDate);

            // Compare results
            System.out.println("Location Comparison:");
            System.out.println("Berlin vs Paris (January 2024)");
            System.out.println();

            double berlinAvg = calculateAverage(berlinData);
            double parisAvg = calculateAverage(parisData);

            System.out.printf("Berlin Average: %.2f W/m²%n", berlinAvg);
            System.out.printf("Paris Average: %.2f W/m²%n", parisAvg);
            System.out.printf("Difference: %.2f W/m² (%.1f%%)%n",
                Math.abs(berlinAvg - parisAvg),
                Math.abs((berlinAvg - parisAvg) / berlinAvg) * 100);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static List<SolarRadiationData> getSolarData(PowerApiService service,
                                                        double lon, double lat,
                                                        String start, String end) throws Exception {
        String jsonResponse = service.fetchSolarRadiationData(lon, lat, start, end);
        return service.parseSolarRadiationData(jsonResponse);
    }

    private static double calculateAverage(List<SolarRadiationData> dataPoints) {
        double sum = 0;
        for (SolarRadiationData point : dataPoints) {
            sum += point.getRadiation();
        }
        return sum / dataPoints.size();
    }
}
```

## Advanced Features

### Example 8: Custom Elevation Data

```java
import com.example.PowerApiService;

public class Example8 {
    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            double longitude = 52.5200;
            double latitude = 13.4050;
            String startDate = "20240101";
            String endDate = "20240131";

            // Request data with custom site elevation
            String parameters = "T2M";
            String format = "JSON";

            // Note: You would need to modify PowerApiService to support site-elevation parameter
            // This is a conceptual example

            System.out.println("Custom Elevation Data Request:");
            System.out.println("Location: " + latitude + ", " + longitude);
            System.out.println("Site Elevation: 100m (example)");
            System.out.println("Parameters: " + parameters);
            System.out.println("Date Range: " + startDate + " to " + endDate);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Example 9: Data Caching Strategy

```java
import com.example.PowerApiService;
import java.util.HashMap;
import java.util.Map;

public class Example9 {
    private static Map<String, List<SolarRadiationData>> cache = new HashMap<>();

    public static void main(String[] args) {
        try {
            PowerApiService service = new PowerApiService();

            String locationKey = "52.5200,13.4050";
            String startDate = "20240101";
            String endDate = "20240131";

            // Check cache first
            String cacheKey = locationKey + "|" + startDate + "|" + endDate;
            if (cache.containsKey(cacheKey)) {
                System.out.println("Using cached data for: " + cacheKey);
                List<SolarRadiationData> cachedData = cache.get(cacheKey);
                processAndDisplay(cachedData);
            } else {
                System.out.println("Fetching fresh data for: " + cacheKey);

                String jsonResponse = service.fetchSolarRadiationData(
                    Double.parseDouble(locationKey.split(",")[0]),
                    Double.parseDouble(locationKey.split(",")[1]),
                    startDate, endDate);

                List<SolarRadiationData> dataPoints = service.parseSolarRadiationData(jsonResponse);

                // Cache the results
                cache.put(cacheKey, dataPoints);

                processAndDisplay(dataPoints);
            }

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void processAndDisplay(List<SolarRadiationData> dataPoints) {
        System.out.println("Processed " + dataPoints.size() + " data points");
        System.out.println("Average radiation: " +
            calculateAverage(dataPoints) + " W/m²");
    }

    private static double calculateAverage(List<SolarRadiationData> dataPoints) {
        double sum = 0;
        for (SolarRadiationData point : dataPoints) {
            sum += point.getRadiation();
        }
        return sum / dataPoints.size();
    }
}
```

## Tips and Best Practices

### 1. Error Handling
Always wrap API calls in try-catch blocks:
```java
try {
    // API call
} catch (Exception e) {
    System.err.println("API Error: " + e.getMessage());
    // Handle error gracefully
}
```

### 2. Date Format
Remember to use YYYYMMDD format for dates:
```java
String startDate = "20240101";  // Correct
String endDate = "2024-01-01";  // Incorrect
```

### 3. Parameter Limits
- Maximum 20 parameters for point queries
- Maximum 1 parameter for regional queries
- Choose parameters wisely based on your needs

### 4. Rate Limiting
Implement rate limiting if making many requests:
```java
Thread.sleep(1000);  // Wait 1 second between requests
```

### 5. Data Validation
Always validate API responses:
```java
if (jsonResponse == null || jsonResponse.isEmpty()) {
    System.err.println("Empty API response");
}
```

## Next Steps

1. Choose an example that matches your needs
2. Adapt the code to your specific requirements
3. Integrate with your preferred visualization framework
4. Add custom data processing logic
5. Implement error handling and logging
6. Test with different locations and time periods

## Additional Resources

- [NASA POWER API Documentation](https://power.larc.nasa.gov/docs/)
- [API Pages](https://power.larc.nasa.gov/api/pages/)
- [Data Access Viewer](https://power.larc.nasa.gov/data-access-viewer/)
- [Parameter Reference](https://power.larc.nasa.gov/docs/parameters/)

---

**Last Updated**: 2025-06-23

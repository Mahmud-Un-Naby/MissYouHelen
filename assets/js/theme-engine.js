/**
 * Theme Engine - Computes real-world environment data and applies theme tokens
 * Data sources: Open-Meteo API (free, no key required)
 * Updates: CSS variables and data-* attributes on root element
 * Interval: 30s for time-based updates, 15min for weather caching
 */

(function () {
  const ROOT = document.documentElement;
  const BODY = document.body;

  const CONFIG = {
    themeEnabled: BODY.dataset.themeEnabled === "true",
    weatherEnabled: BODY.dataset.weatherEnabled === "true",
    fixedTimezone: BODY.dataset.fixedTimezone || null,
    lat: BODY.dataset.latitude ? Number(BODY.dataset.latitude) : null,
    lon: BODY.dataset.longitude ? Number(BODY.dataset.longitude) : null,
    weatherProvider: BODY.dataset.weatherProvider || "open-meteo",
    weatherTTL: 15 * 60 * 1000, // 15 minutes
    moodInterval: 30 * 1000, // 30s
  };

  if (!CONFIG.themeEnabled) return;

  // Attempt browser geolocation if coords not provided
  if (CONFIG.weatherEnabled && (!CONFIG.lat || !CONFIG.lon) && navigator.geolocation) {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          CONFIG.lat = pos.coords.latitude;
          CONFIG.lon = pos.coords.longitude;
        },
        () => {
          // permission denied
        },
        { maximumAge: 60 * 60 * 1000, timeout: 8000 }
      );
    } catch (e) {
      // ignore
    }
  }

  // Phase definitions (24-hour clock)
  const CLOCK_PHASES = [
    { id: "dawn", start: 5, end: 6.99 },
    { id: "morning", start: 7, end: 10.99 },
    { id: "noon", start: 11, end: 13.99 },
    { id: "afternoon", start: 14, end: 16.99 },
    { id: "evening", start: 17, end: 19.99 },
    { id: "night", start: 20, end: 4.99 },
  ];

  // Map Open-Meteo weather codes to intensity
  function mapWeatherCode(code) {
    if (code === 0) return { type: "clear", intensity: 0 };
    if (code >= 1 && code <= 3) return { type: "clear", intensity: 0.2 };
    if (code === 45 || code === 48) return { type: "gloom", intensity: 0.5 };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { type: "rain", intensity: 0.7 };
    if ((code >= 95 && code <= 99) || (code >= 71 && code <= 77)) return { type: "heavy-rain", intensity: 1 };
    return { type: "gloom", intensity: 0.4 };
  }

  // Get phase from clock
  function phaseFromClock(date) {
    const h = date.getHours() + date.getMinutes() / 60;
    for (const p of CLOCK_PHASES) {
      if (p.start <= p.end) {
        if (h >= p.start && h <= p.end) return p.id;
      } else {
        if (h >= p.start || h <= p.end) return p.id;
      }
    }
    return "noon";
  }

  // Cache for weather data
  let lastWeather = { fetchedAt: 0, data: null };

  // Fetch current weather and solar data from Open-Meteo
  async function fetchWeather(lat, lon) {
    const now = Date.now();
    if (lastWeather.data && now - lastWeather.fetchedAt < CONFIG.weatherTTL) {
      return lastWeather.data;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&current=temperature_2m,weather_code,wind_speed_10m,uv_index,pressure_msl&daily=sunrise,sunset&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("weather fetch failed");
      const json = await res.json();
      lastWeather = { fetchedAt: now, data: json };
      return json;
    } catch (e) {
      console.warn("Theme engine: weather fetch failed, using fallback");
      return lastWeather.data || null;
    }
  }

  // Calculate wind intensity (0-1) from wind speed (km/h)
  function windIntensity(windSpeed) {
    if (!windSpeed || windSpeed < 5) return 0;
    if (windSpeed < 20) return (windSpeed - 5) / 15; // 5-20 km/h -> 0-1
    return 1;
  }

  // Calculate wind angle (0-360) from cardinal direction
  // For now, default to variable angle based on time
  function windAngle(time) {
    return (time.getHours() * 15) % 360; // Simple approximation
  }

  // Temperature saturation shift (more saturated when warm, less when cold)
  function tempSaturationShift(tempC) {
    const baseline = 15;
    const shift = ((tempC - baseline) * 2) / 100;
    return Math.max(-15, Math.min(15, shift));
  }

  // Temperature hue shift (blue when cold, orange when warm)
  function tempHueShift(tempC) {
    if (tempC < 10) return -20; // cool blue shift
    if (tempC > 25) return 20; // warm orange shift
    return 0;
  }

  // UV intensity (0-11 scale from API, normalized to 0-1 for CSS)
  function uvIntensity(uvIndex) {
    return Math.min(1, (uvIndex || 0) / 11);
  }

  // UV glare opacity and saturation boost
  function uvGlareEffect(uvIndex) {
    const uv = uvIndex || 0;
    return {
      glareOpacity: Math.max(0, (uv - 3) / 8), // noticeable from UV 3+
      saturationBoost: (uv * 1.5) / 11, // 0-15% boost
    };
  }

  // Pressure haze (low pressure -> more haze)
  function pressureHaze(pressureMb) {
    const p = pressureMb || 1013;
    if (p < 1000) return 0.1; // low pressure haze
    if (p > 1020) return 0; // high pressure clarity
    return (1020 - p) / 20 * 0.05; // gradual
  }

  // Compute rain animation speed based on wind (faster wind = faster rain)
  function rainSpeed(windSpeed) {
    const baseSpeed = 2; // seconds
    const minSpeed = 0.8;
    const factor = Math.max(0.2, 1 - windSpeed / 50);
    return Math.max(minSpeed, baseSpeed * factor) + "s";
  }

  // Compute rain drift angle based on wind direction
  function rainAngle(windAngle) {
    // Wind direction shifts rain angle: 0° = vertical, 45° = diagonal right
    return windAngle + "deg";
  }

  // Apply CSS variable set to root
  function applyCssVars(vars) {
    Object.entries(vars).forEach(([key, value]) => {
      ROOT.style.setProperty(key, String(value));
    });
  }

  // Main mood computation
  async function computeAndApplyMood() {
    const now = new Date();
    let phase = phaseFromClock(now);
    let weather = { type: "clear", intensity: 0 };
    let temp = 15;
    let windSpeed = 0;
    let windDir = 0;
    let uvIndex = 0;
    let pressure = 1013;

    // Fetch weather if enabled and coords provided
    if (CONFIG.lat && CONFIG.lon && CONFIG.weatherEnabled) {
      const data = await fetchWeather(CONFIG.lat, CONFIG.lon);
      if (data) {
        // Current weather
        if (data.current) {
          if (typeof data.current.weather_code !== "undefined") {
            weather = mapWeatherCode(data.current.weather_code);
          }
          if (data.current.temperature_2m !== undefined) {
            temp = data.current.temperature_2m;
          }
          if (data.current.wind_speed_10m !== undefined) {
            windSpeed = data.current.wind_speed_10m;
          }
          if (data.current.uv_index !== undefined) {
            uvIndex = data.current.uv_index;
          }
          if (data.current.pressure_msl !== undefined) {
            pressure = data.current.pressure_msl;
          }
        }

        // Solar data (sunrise/sunset)
        if (data.daily && data.daily.sunrise && data.daily.sunset) {
          const sunrise = new Date(data.daily.sunrise[0]);
          const sunset = new Date(data.daily.sunset[0]);
          const h = now.getTime();

          if (h >= sunrise.getTime() - 25 * 60 * 1000 && h <= sunrise.getTime() + 25 * 60 * 1000) {
            phase = "dawn";
          } else if (h > sunrise.getTime() + 25 * 60 * 1000 && h < sunset.getTime() - 120 * 60 * 1000) {
            phase = "morning";
          } else if (h >= sunset.getTime() - 120 * 60 * 1000 && h <= sunset.getTime() + 60 * 60 * 1000) {
            phase = "evening";
          } else if (h > sunset.getTime() + 60 * 60 * 1000) {
            phase = "night";
          }
        }
      }
    }

    // Calculate derived values
    const windIntensityVal = windIntensity(windSpeed);
    const windDirVal = windAngle(now);
    const tempSatShift = tempSaturationShift(temp);
    const tempHueShiftVal = tempHueShift(temp);
    const uvIntensityVal = uvIntensity(uvIndex);
    const uvGlare = uvGlareEffect(uvIndex);
    const pressureHazeVal = pressureHaze(pressure);
    const rainSpeedVal = rainSpeed(windSpeed);
    const rainAngleVal = rainAngle(windDirVal);

    // Build CSS variable map
    const cssVars = {
      "--time": phase,
      "--weather-type": weather.type,
      "--weather-intensity": weather.intensity,
      "--wind-speed-kmh": windSpeed.toFixed(1),
      "--wind-angle": windDirVal + "deg",
      "--wind-intensity": windIntensityVal.toFixed(2),
      "--temp-celsius": temp.toFixed(1),
      "--temp-saturation-shift": tempSatShift.toFixed(1) + "%",
      "--temp-hue-shift": tempHueShiftVal.toFixed(0) + "deg",
      "--uv-index": uvIndex.toFixed(1),
      "--uv-glare-opacity": uvGlare.glareOpacity.toFixed(2),
      "--uv-saturation-boost": (uvGlare.saturationBoost * 100).toFixed(1) + "%",
      "--pressure-mb": pressure.toFixed(0),
      "--pressure-haze": pressureHazeVal.toFixed(3),
      "--rain-speed": rainSpeedVal,
      "--rain-angle": rainAngleVal,
    };

    // Rain opacity scales with weather intensity and wind (wind makes rain visible)
    if (weather.type === "rain" || weather.type === "heavy-rain") {
      cssVars["--rain-opacity"] = Math.min(0.9, weather.intensity + windIntensityVal * 0.2).toFixed(2);
    } else {
      cssVars["--rain-opacity"] = "0";
    }

    // Apply CSS variables
    applyCssVars(cssVars);

    // Set data attributes for CSS selectors
    ROOT.setAttribute("data-time", phase);
    ROOT.setAttribute("data-weather", weather.type);
    ROOT.setAttribute("data-weather-intensity", weather.intensity.toFixed(1));
    ROOT.setAttribute("data-wind", windIntensityVal.toFixed(1));
    ROOT.setAttribute("data-temp", Math.round(temp));
    ROOT.setAttribute("data-uv", Math.round(uvIndex));
    ROOT.setAttribute("data-pressure", Math.round(pressure));

    // Publish state for debugging and UI sync
    if (!window.mood) window.mood = {};
    window.mood.current = {
      time: phase,
      weather: weather.type,
      weatherIntensity: weather.intensity,
      temp: temp.toFixed(1),
      windSpeed: windSpeed.toFixed(1),
      uvIndex: uvIndex.toFixed(1),
      pressure: pressure.toFixed(0),
      source: CONFIG.lat && CONFIG.lon && CONFIG.weatherEnabled ? "realtime" : "clock",
    };

    // Sync mood chooser if available
    if (typeof window.__syncMoodChooser__ === "function") {
      window.__syncMoodChooser__(window.mood.current);
    }
  }

  // Scheduler
  if (CONFIG.themeEnabled) {
    computeAndApplyMood();
    setInterval(computeAndApplyMood, CONFIG.moodInterval);
  }

  // Expose for debugging
  window.__themeEngine__ = {
    computeMood: computeAndApplyMood,
    config: CONFIG,
  };
})();

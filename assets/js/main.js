const counters = Array.from(document.querySelectorAll("[data-counter]"))
  .map((counter) => {
    const startAttr = counter.getAttribute("data-start-time");
    const startTime = startAttr ? new Date(startAttr) : null;

    if (!startTime || Number.isNaN(startTime.getTime())) {
      return null;
    }

    const daysEl = counter.querySelector('[data-unit="days"]');
    const hoursEl = counter.querySelector('[data-unit="hours"]');
    const minutesEl = counter.querySelector('[data-unit="minutes"]');
    const secondsEl = counter.querySelector('[data-unit="seconds"]');

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) {
      return null;
    }

    return {
      startTime,
      locale: counter.getAttribute("data-locale") || navigator.language || "en-US",
      daysEl,
      hoursEl,
      minutesEl,
      secondsEl,
    };
  })
  .filter(Boolean);

const pad = (value) => String(value).padStart(2, "0");

const updateCounter = (state) => {
  const now = new Date();
  let diffMs = now - state.startTime;

  if (diffMs < 0) {
    diffMs = 0;
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  state.daysEl.textContent = days.toLocaleString(state.locale);
  state.hoursEl.textContent = pad(hours);
  state.minutesEl.textContent = pad(minutes);
  state.secondsEl.textContent = pad(seconds);
};

if (counters.length > 0) {
  counters.forEach(updateCounter);
  setInterval(() => counters.forEach(updateCounter), 1000);
}

/* Theme & Weather Engine
   - Composes time-phase + season + weather into CSS variables
   - Weather provider: Open-Meteo (default), pluggable
   - Mood recompute cadence: 30s. Weather refresh TTL: 15min.
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

  // If weather is enabled but no coords provided, try browser geolocation (privacy-friendly options retained)
  if (CONFIG.weatherEnabled && (!CONFIG.lat || !CONFIG.lon) && navigator.geolocation) {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          CONFIG.lat = pos.coords.latitude;
          CONFIG.lon = pos.coords.longitude;
        },
        () => {
          // permission denied or unavailable — leave coords null and fallback to clock
        },
        { maximumAge: 60 * 60 * 1000, timeout: 8000 }
      );
    } catch (e) {
      // ignore
    }
  }

  // Simple mapping from Open-Meteo weathercode to mood token
  function mapWeatherCode(code) {
    // Clear
    if (code === 0) return { token: "clear", intensity: 1 };
    // Mainly clear / partly cloudy
    if (code >= 1 && code <= 3) return { token: "clear", intensity: 0.6 };
    // Fog
    if (code === 45 || code === 48) return { token: "gloom", intensity: 0.6 };
    // Drizzle / rain
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { token: "rain", intensity: 0.8 };
    // Heavy rain / thunderstorms
    if ((code >= 95 && code <= 99) || (code >= 71 && code <= 77)) return { token: "rain", intensity: 1 };
    // Default to overcast/gloom
    return { token: "gloom", intensity: 0.5 };
  }

  // Memory cache for weather
  let lastWeather = { fetchedAt: 0, data: null };

  async function fetchWeather(lat, lon) {
    const now = Date.now();
    if (lastWeather.data && now - lastWeather.fetchedAt < CONFIG.weatherTTL) {
      return lastWeather.data;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=sunrise,sunset&timezone=auto`;
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
      // keep stale data if available
      return lastWeather.data || null;
    }
  }

  // Phase clock ranges fallback (24h) in hour ranges
  const CLOCK_PHASES = [
    { id: "dawn", start: 5, end: 6.99 },
    { id: "morning", start: 7, end: 10.99 },
    { id: "noon", start: 11, end: 13.99 },
    { id: "afternoon", start: 14, end: 16.99 },
    { id: "evening", start: 17, end: 19.99 },
    { id: "night", start: 20, end: 4.99 },
  ];

  function phaseFromClock(date) {
    const h = date.getHours() + date.getMinutes() / 60;
    for (const p of CLOCK_PHASES) {
      if (p.start <= p.end) {
        if (h >= p.start && h <= p.end) return p.id;
      } else {
        if (h >= p.start || h <= p.end) return p.id;
      }
    }
    return "day";
  }

  function seasonFromDate(d) {
    const m = d.getMonth() + 1;
    if (m === 12 || m <= 2) return "winter";
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    return "autumn";
  }

  // Theme palettes (minimal) — JS-driven tokens
  const BASE_PALETTES = {
    dawn: {
      "--bg-top": "#fff1e6",
      "--bg-bottom": "#f3e8ff",
      "--ink": "#2b2b33",
      "--card-bg": "rgba(255,255,255,0.78)",
      "--grain-opacity": "0.18",
    },
    morning: {
      "--bg-top": "#fff7e6",
      "--bg-bottom": "#e6f7ff",
      "--ink": "#1c2331",
      "--card-bg": "rgba(255,255,255,0.82)",
      "--grain-opacity": "0.14",
    },
    noon: {
      "--bg-top": "#e8f6ff",
      "--bg-bottom": "#e2fef4",
      "--ink": "#0f1724",
      "--card-bg": "rgba(255,255,255,0.9)",
      "--grain-opacity": "0.08",
    },
    afternoon: {
      "--bg-top": "#fff3e6",
      "--bg-bottom": "#f0f5ff",
      "--ink": "#1b2430",
      "--card-bg": "rgba(255,255,255,0.78)",
      "--grain-opacity": "0.16",
    },
    evening: {
      "--bg-top": "#ffecec",
      "--bg-bottom": "#e9f0ff",
      "--ink": "#11121a",
      "--card-bg": "rgba(18,16,21,0.6)",
      "--grain-opacity": "0.22",
    },
    night: {
      "--bg-top": "#0f1724",
      "--bg-bottom": "#071028",
      "--ink": "#dbeafe",
      "--card-bg": "rgba(8,12,20,0.6)",
      "--grain-opacity": "0.28",
    },
  };

  function applyTokenSet(tokens) {
    Object.keys(tokens).forEach((k) => {
      ROOT.style.setProperty(k, tokens[k]);
    });
  }

  // Apply weather modifier as gentle transforms
  function applyWeatherModifier(mood) {
    if (!mood) return;
    const { token, intensity } = mood;
    if (token === "rain") {
      // darken and cool
      ROOT.style.setProperty("--bg-top", shadeColor(ROOT.style.getPropertyValue("--bg-top") || BASE_PALETTES.noon["--bg-top"], -6 * intensity));
      ROOT.style.setProperty("--bg-bottom", shadeColor(ROOT.style.getPropertyValue("--bg-bottom") || BASE_PALETTES.noon["--bg-bottom"], -10 * intensity));
      ROOT.style.setProperty("--grain-opacity", String(Math.min(0.6, Number(ROOT.style.getPropertyValue("--grain-opacity") || 0.12) + 0.12 * intensity)));
    }
    if (token === "gloom") {
      ROOT.style.setProperty("--bg-top", shadeColor(ROOT.style.getPropertyValue("--bg-top") || BASE_PALETTES.noon["--bg-top"], -8 * intensity));
      ROOT.style.setProperty("--bg-bottom", shadeColor(ROOT.style.getPropertyValue("--bg-bottom") || BASE_PALETTES.noon["--bg-bottom"], -6 * intensity));
      ROOT.style.setProperty("--grain-opacity", String(Math.min(0.55, Number(ROOT.style.getPropertyValue("--grain-opacity") || 0.12) + 0.14 * intensity)));
    }
    if (token === "clear") {
      ROOT.style.setProperty("--grain-opacity", String(Math.max(0.02, Number(ROOT.style.getPropertyValue("--grain-opacity") || 0.08) - 0.06 * intensity)));
    }
  }

  // Simple color shading helper (works on hex like #rrggbb)
  function shadeColor(hex, percent) {
    try {
      const h = hex.trim();
      if (!h || h[0] !== "#") return hex;
      const num = parseInt(h.slice(1), 16);
      const r = (num >> 16) + Math.round((percent / 100) * 255);
      const g = ((num >> 8) & 0x00ff) + Math.round((percent / 100) * 255);
      const b = (num & 0x0000ff) + Math.round((percent / 100) * 255);
      const rr = Math.max(0, Math.min(255, r)).toString(16).padStart(2, "0");
      const gg = Math.max(0, Math.min(255, g)).toString(16).padStart(2, "0");
      const bb = Math.max(0, Math.min(255, b)).toString(16).padStart(2, "0");
      return `#${rr}${gg}${bb}`;
    } catch (e) {
      return hex;
    }
  }

  // Compose mood: base phase -> season transform -> weather modifier
  async function computeAndApplyMood() {
    // Respect manual override if set by the chooser UI
    if (window.mood && window.mood.manualActive) return;
    const now = new Date();
    let phase = phaseFromClock(now);
    let sunrise = null;
    let sunset = null;

    // if lat/lon present and weather enabled, fetch weather which includes sunrise/sunset
    let weather = null;
    if (CONFIG.lat && CONFIG.lon && CONFIG.weatherEnabled) {
      const data = await fetchWeather(CONFIG.lat, CONFIG.lon);
      if (data) {
        // current_weather
        if (data.current_weather && typeof data.current_weather.weathercode !== 'undefined') {
          weather = mapWeatherCode(data.current_weather.weathercode);
        }
        // daily sunrise/sunset
        if (data.daily && data.daily.sunrise && data.daily.sunset) {
          // find today's index (0)
          sunrise = new Date(data.daily.sunrise[0]);
          sunset = new Date(data.daily.sunset[0]);
          // derive phase from solar if available
          if (sunrise && sunset) {
            const h = now.getTime();
            if (h >= sunrise.getTime() - 25 * 60 * 1000 && h <= sunrise.getTime() + 25 * 60 * 1000) phase = 'dawn';
            else if (h > sunrise.getTime() + 25 * 60 * 1000 && h < (sunset.getTime() - 120 * 60 * 1000)) phase = 'morning';
            else if (h >= (sunset.getTime() - 120 * 60 * 1000) && h <= (sunset.getTime() + 60 * 60 * 1000)) phase = 'evening';
            else if (h > (sunset.getTime() + 60 * 60 * 1000)) phase = 'night';
          }
        }
      }
    }

    const season = seasonFromDate(now);

    // Apply base palette
    const base = BASE_PALETTES[phase] || BASE_PALETTES.noon;
    applyTokenSet(base);

    // Apply weather overlay if any
    if (weather && CONFIG.weatherEnabled) {
      applyWeatherModifier(weather);
      BODY.dataset.weather = weather.token;
      BODY.dataset.weatherIntensity = String(weather.intensity);
    } else {
      BODY.dataset.weather = 'none';
      BODY.dataset.weatherIntensity = '0';
    }

    // Set runtime attributes
    BODY.dataset.phase = phase;
    BODY.dataset.season = season;
    BODY.dataset.source = (CONFIG.lat && CONFIG.lon && weather) ? 'solar+weather' : 'clock';

    // Publish current state for the chooser UI and diagnostics
    if (!window.mood) window.mood = {};
    window.mood.current = {
      phase,
      season,
      weather: weather ? weather.token : 'none',
      weatherIntensity: weather ? weather.intensity : 0,
      source: BODY.dataset.source,
    };

    if (typeof window.__syncMoodChooser__ === 'function') {
      window.__syncMoodChooser__(window.mood.current);
    }
  }

  // Kick off scheduler
  computeAndApplyMood();
  setInterval(computeAndApplyMood, CONFIG.moodInterval);
  // Weather TTL-driven refresh when coords exist
  if (CONFIG.lat && CONFIG.lon && CONFIG.weatherEnabled) {
    setInterval(() => fetchWeather(CONFIG.lat, CONFIG.lon), CONFIG.weatherTTL);
  }

  // Expose internals for the manual UI module
  try {
    window.__BASE_PALETTES__ = BASE_PALETTES;
    window.__applyWeatherModifier__ = applyWeatherModifier;
    window.__recomputeMood__ = computeAndApplyMood;
  } catch (e) {
    // ignore
  }

})();

// Manual mood chooser bindings and public API
(function () {
  const BODY = document.body;
  // Manual override state
  const MANUAL = { active: false, phase: null, weather: null };

  function normalizeWeatherToken(token) {
    if (!token || token === 'none') return null;
    if (token === 'clear') return { token: 'clear', intensity: 0.9 };
    if (token === 'gloom') return { token: 'gloom', intensity: 0.8 };
    if (token === 'rain') return { token: 'rain', intensity: 1 };
    return null;
  }

  // Apply manual mood (blocks automatic updates until resync)
  function applyManual(phase, weatherToken) {
    MANUAL.active = true;
    if (!window.mood) window.mood = {};
    window.mood.manualActive = true;
    MANUAL.phase = phase;
    MANUAL.weather = normalizeWeatherToken(weatherToken);
    // apply base palette immediately
    const base = (window && window.__BASE_PALETTES__) ? window.__BASE_PALETTES__[phase] : null;
    if (base) {
      Object.keys(base).forEach(k => document.documentElement.style.setProperty(k, base[k]));
    }
    // apply weather overlay
    if (MANUAL.weather) {
      const applyWeatherModifier = window.__applyWeatherModifier__;
      if (typeof applyWeatherModifier === 'function') applyWeatherModifier(MANUAL.weather);
      BODY.dataset.weather = MANUAL.weather.token;
      BODY.dataset.weatherIntensity = String(MANUAL.weather.intensity);
    } else {
      BODY.dataset.weather = 'none';
      BODY.dataset.weatherIntensity = '0';
    }
    BODY.dataset.phase = phase;
    BODY.dataset.season = BODY.dataset.season || '';
    BODY.dataset.source = 'manual';

    syncChooser({ phase, weather: MANUAL.weather ? MANUAL.weather.token : 'none' });
  }

  function resync() {
    MANUAL.active = false;
    if (window.mood) window.mood.manualActive = false;
    MANUAL.phase = null;
    MANUAL.weather = null;
    // trigger a recompute by calling global recompute if available
    if (window && window.__recomputeMood__) {
      Promise.resolve(window.__recomputeMood__()).then(() => {
        if (window.mood && window.mood.current) {
          syncChooser(window.mood.current);
        }
      });
    }
  }

  // Wire UI when available
  function wireUI() {
    const chooser = document.getElementById('mood-chooser');
    if (!chooser) return;
    const phaseSel = document.getElementById('mood-phase');
    const weatherSel = document.getElementById('mood-weather');
    const applyBtn = document.getElementById('mood-apply');
    const resyncBtn = document.getElementById('mood-resync');

    applyBtn.addEventListener('click', () => {
      const p = phaseSel.value;
      const w = weatherSel.value;
      applyManual(p, w);
    });

    resyncBtn.addEventListener('click', () => {
      resync();
    });
  }

  function syncChooser(state) {
    const phaseSel = document.getElementById('mood-phase');
    const weatherSel = document.getElementById('mood-weather');
    if (!phaseSel || !weatherSel || !state) return;

    if (state.phase) phaseSel.value = state.phase;
    if (state.weather) weatherSel.value = state.weather === 'gloom' ? 'gloom' : state.weather;
    if (state.weather === 'none') weatherSel.value = 'none';
  }

  // Expose lightweight global API for debug and recompute
  window.mood = window.mood || {};
  window.mood.applyManual = applyManual;
  window.mood.resync = resync;
  window.mood.sync = syncChooser;

  // Helper exposure for apply routines used above (set by main closure)
  // If main closure didn't expose, set placeholders
  window.__BASE_PALETTES__ = window.__BASE_PALETTES__ || null;
  window.__applyWeatherModifier__ = window.__applyWeatherModifier__ || null;
  window.__recomputeMood__ = window.__recomputeMood__ || null;
  window.__syncMoodChooser__ = syncChooser;

  document.addEventListener('DOMContentLoaded', wireUI);
  // also attempt to wire immediately
  wireUI();
})();

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







































/* Manual mood chooser UI - works with theme engine */
(function () {
  const BODY = document.body;
  const ROOT = document.documentElement;
  const MANUAL = { active: false, phase: null, weather: null };

  function applyManualTheme(time, weather) {
    MANUAL.active = true;
    MANUAL.phase = time;
    MANUAL.weather = weather;

    // Set data attributes for CSS to pick up
    ROOT.setAttribute("data-time", time);
    if (weather && weather !== "none") {
      ROOT.setAttribute("data-weather", weather);
      const weatherIntensity = weather === "clear" ? 0 : weather === "gloom" ? 0.5 : 0.8;
      ROOT.setAttribute("data-weather-intensity", weatherIntensity);
      // Set CSS variables for weather effects
      if (weather === "rain") {
        ROOT.style.setProperty("--rain-opacity", "0.8");
        ROOT.style.setProperty("--rain-speed", "2s");
        ROOT.style.setProperty("--weather-intensity", "0.8");
      } else if (weather === "gloom") {
        ROOT.style.setProperty("--rain-opacity", "0");
        ROOT.style.setProperty("--weather-intensity", "0.5");
      } else if (weather === "clear") {
        ROOT.style.setProperty("--rain-opacity", "0");
        ROOT.style.setProperty("--weather-intensity", "0");
      }
    } else {
      ROOT.setAttribute("data-weather", "clear");
      ROOT.setAttribute("data-weather-intensity", "0");
      ROOT.style.setProperty("--rain-opacity", "0");
    }

    // Update mood chooser UI
    syncChooser({ time, weather: weather || "none" });
  }

  function resyncToThemeEngine() {
    MANUAL.active = false;
    MANUAL.phase = null;
    MANUAL.weather = null;
    // Trigger theme engine recompute
    if (window.__themeEngine__ && typeof window.__themeEngine__.computeMood === "function") {
      window.__themeEngine__.computeMood().then(() => {
        if (window.mood && window.mood.current) {
          syncChooser({ time: window.mood.current.time, weather: window.mood.current.weather });
        }
      });
    }
  }

  function syncChooser(state) {
    const phaseSel = document.getElementById("mood-phase");
    const weatherSel = document.getElementById("mood-weather");
    if (!phaseSel || !weatherSel) return;

    if (state.time) phaseSel.value = state.time;
    if (state.weather) weatherSel.value = state.weather;
  }

  function wireUI() {
    const chooser = document.getElementById("mood-chooser");
    if (!chooser) return;

    const phaseSel = document.getElementById("mood-phase");
    const weatherSel = document.getElementById("mood-weather");
    const applyBtn = document.getElementById("mood-apply");
    const resyncBtn = document.getElementById("mood-resync");

    if (!applyBtn || !resyncBtn) return;

    applyBtn.addEventListener("click", () => {
      const time = phaseSel.value;
      const weather = weatherSel.value;
      applyManualTheme(time, weather);
    });

    resyncBtn.addEventListener("click", () => {
      resyncToThemeEngine();
    });
  }

  // Expose API
  window.mood = window.mood || {};
  window.mood.applyManual = applyManualTheme;
  window.mood.resync = resyncToThemeEngine;
  window.mood.syncChooser = syncChooser;

  document.addEventListener("DOMContentLoaded", wireUI);
  wireUI();
})();



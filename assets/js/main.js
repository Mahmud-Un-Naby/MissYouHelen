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

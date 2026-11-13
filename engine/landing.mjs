import { conditions, DAY, HOUR } from './index.mjs';

// Hourly arrival screening over a fixed ten-minute integration grid. Compute
// expensive disc/horizon geometry once, then query integrals and dark runs.
export function landingWindows(data, start, end, durationDays, mask, minAntennaEl, profile) {
  const duration = durationDays * DAY, step = 600000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start ||
      !Number.isFinite(duration) || duration <= 0 || duration > 90 * DAY || end - start > 90 * DAY)
    throw Error('Choose a valid search of up to 90 days and a positive mission duration.');
  if (!profile || !['minSunlitPct','minEarthDtePct','maxDarknessHours'].every(key => Number.isFinite(profile[key])) ||
      profile.minSunlitPct < 0 || profile.minSunlitPct > 100 ||
      profile.minEarthDtePct < 0 || profile.minEarthDtePct > 100 || profile.maxDarknessHours < 0)
    throw Error('Check the sunlight, darkness and Earth-contact limits.');
  const first = Math.ceil(start / HOUR) * HOUR, last = Math.floor(end / HOUR) * HOUR;
  if (start < Math.max(data.sun[0][0], data.earth[0][0]) ||
      end + duration > Math.min(data.sun.at(-1)[0], data.earth.at(-1)[0]))
    throw Error('The full search and mission duration need NASA/JPL coverage.');
  if (first > last) return { windows: [], tested: 0, matching: 0, stepMinutes: 10, arrivalStepHours: 1 };
  const finish = last + duration, n = Math.ceil((finish - first) / step);
  const sun = new Float64Array(n + 1), dte = new Float64Array(n + 1), dark = [];
  let darkStart = null;
  for (let i = 0; i < n; i++) {
    const a = first + i * step, b = Math.min(finish, a + step);
    const c = conditions(data, (a + b) / 2, mask, minAntennaEl);
    sun[i + 1] = sun[i] + (c.sun.visible ? b - a : 0);
    dte[i + 1] = dte[i] + (c.earth.dte ? b - a : 0);
    if (!c.sun.visible && darkStart === null) darkStart = a;
    if (c.sun.visible && darkStart !== null) { dark.push([darkStart, a]); darkStart = null; }
  }
  if (darkStart !== null) dark.push([darkStart, finish]);
  const integral = (p, t) => {
    const i = Math.min(n - 1, Math.floor((t - first) / step));
    const a = first + i * step, b = Math.min(finish, a + step);
    return p[i] + (p[i + 1] - p[i]) * (t - a) / (b - a);
  };
  const windows = [];
  const score = r => r.sunlitPct + r.earthDtePct - r.longestDarkH / durationDays / 24;
  let matching = 0, tested = 0, previous = null, firstRun = 0;
  for (let time = first; time <= last; time += HOUR) {
    tested++;
    const endTime = time + duration;
    // Match summarize() at a fractional final integration cell rather than
    // assigning that fraction the midpoint condition of a full grid cell.
    const fullEnd = time + Math.floor(duration / step) * step;
    const tail = endTime - fullEnd;
    const tailCondition = tail ? conditions(data, fullEnd + tail / 2, mask, minAntennaEl) : null;
    // Arrival times are ordered. Discard runs before this arrival and stop
    // scanning at the last complete cell, which may join the fractional tail.
    while (firstRun < dark.length && dark[firstRun][1] < time) firstRun++;
    const darkTail = tailCondition && !tailCondition.sun.visible ? tail : 0;
    let longestDark = darkTail;
    for (let i = firstRun; i < dark.length && dark[i][0] <= fullEnd; i++) {
      const [a, b] = dark[i];
      const overlap = Math.min(b, fullEnd) - Math.max(a, time);
      longestDark = Math.max(longestDark, overlap + (b >= fullEnd ? darkTail : 0));
    }
    const row = { time,
      sunlitPct: 100 * (integral(sun, fullEnd) - integral(sun, time) + (tailCondition?.sun.visible ? tail : 0)) / duration,
      earthDtePct: 100 * (integral(dte, fullEnd) - integral(dte, time) + (tailCondition?.earth.dte ? tail : 0)) / duration,
      longestDarkH: longestDark / HOUR };
    if (row.sunlitPct + 1e-8 < profile.minSunlitPct || row.earthDtePct + 1e-8 < profile.minEarthDtePct ||
        row.longestDarkH > profile.maxDarknessHours + 1e-8) { previous = null; continue; }
    matching++;
    if (!previous) { previous = { start: time, end: time, first: row, best: row, count: 1 }; windows.push(previous); }
    else {
      previous.end = time; previous.count++;
      if (score(row) > score(previous.best)) previous.best = row;
    }
  }
  return { windows, tested, matching, stepMinutes: 10, arrivalStepHours: 1 };
}

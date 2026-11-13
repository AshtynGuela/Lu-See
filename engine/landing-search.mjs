import { DAY, HOUR } from './index.mjs';

// Bound each real-ephemeris request and the overall forward search. Inclusive
// hourly endpoints leave neither duplicate candidates nor gaps between batches.
export const NEXT_SEARCH_DAYS = 365;
export function nextWindowSearch(start, durationDays, searchDays = NEXT_SEARCH_DAYS) {
  if (!Number.isFinite(start) || !Number.isFinite(durationDays) || durationDays < .1 || durationDays > 90 ||
      !Number.isFinite(searchDays) || searchDays <= 0 || searchDays > NEXT_SEARCH_DAYS)
    throw Error('Choose a mission duration from 0.1 to 90 days and a search up to one year.');
  const first = Math.ceil(start / HOUR) * HOUR;
  // Mission end must be strictly before 2041, including fractional-day stays.
  const lastSupported = (Math.ceil((Date.parse('2041-01-01') - durationDays * DAY) / HOUR) - 1) * HOUR;
  const limit = Math.min(first + searchDays * DAY - HOUR, lastSupported);
  if (first < Date.parse('1969-01-01') || first > limit)
    throw Error('No further arrivals fit with this mission duration before the end of 2040.');
  return { origin: first, limit, tested: 0, mode: 'next', ...nextWindowChunk(first, limit) };
}

export function nextWindowChunk(start, limit) {
  const end = Math.min(start + 30 * DAY - HOUR, limit);
  if (!Number.isFinite(start) || !Number.isFinite(limit) || end < start)
    throw Error('No further dates remain in this search.');
  return { start, end, span: (end - start) / DAY };
}

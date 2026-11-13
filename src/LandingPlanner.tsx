import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, X } from 'lucide-react';
import { allSites, ensureData, getMask, packetFor, packetKey, useScout, type Scenario } from './store';
import { DAY, HOUR } from '../engine/index.mjs';
import { arrivalSearch, DEFAULT_MISSION_PROFILE, flightEstimate, historicalTiming, MISSION_PROFILES } from '../engine/mission-history.mjs';
import { nextWindowSearch, nextWindowChunk } from '../engine/landing-search.mjs';

const dateLabel = (t: number) => new Date(t).toISOString().slice(0,16).replace('T',' ');
const flightLabel = (hours: number) => `${Math.floor(hours / 24)} d ${hours % 24} h`;
export default function LandingPlanner({close}: {close: () => void}) {
  const state = useScout(), site = allSites().find(s => s.id === state.selected)!;
  const [flightProfile, setFlightProfile] = useState(DEFAULT_MISSION_PROFILE);
  const timing = historicalTiming(flightProfile);
  const [days, setDays] = useState(() => String(timing.surfaceDays)), [manual, setManual] = useState(false);
  const [epoch, setEpoch] = useState(new Date(state.time).toISOString().slice(0,16));
  const [startDate, setStartDate] = useState('');
  const [span, setSpan] = useState(30), [live, setLive] = useState(false);
  const [profile, setProfile] = useState({minSunlitPct:80, maxDarknessHours:12, minEarthDtePct:60});
  const [arrayMode, setArrayMode] = useState('horizontal'), [arrayAzimuth, setArrayAzimuth] = useState(0);
  const [error, setError] = useState(''), [job, setJob] = useState<any>(null);
  const [result, setResult] = useState<any>(null), [chosen, setChosen] = useState<number | null>(null);
  const [preference, setPreference] = useState('best');
  const [busy, setBusy] = useState(false), first = useRef<HTMLSelectElement>(null);
  const terrain = state.terrains[state.selected], key = packetKey(state.selected, state.mastM);
  const packet = job && packetFor(state, state.selected, job.start, job.span + job.duration);
  useEffect(() => { first.current?.focus(); }, []);
  // A change to any scientific input invalidates the displayed choices immediately.
  useEffect(() => { setJob(null); setResult(null); setChosen(null); setBusy(false); setError(''); },
    [flightProfile, days, startDate, span, profile, state.selected, state.mastM, state.minAntennaEl, manual]);
  useEffect(() => {
    const window = result?.windows[0];
    setChosen(window ? (preference === 'earliest' ? window.first.time : window.best.time) : null);
  }, [result, preference]);
  useEffect(() => {
    if (!job) return;
    ensureData(site, job.start, job.span + job.duration);
  }, [job, packet, state.loading[key]]);
  useEffect(() => {
    if (!job || !packet) return;
    // Curated sites require their actual terrain before screening.
    if (site.family !== 'custom' && !terrain) {
      setBusy(false); setError('Terrain could not load for this curated site. Close and reopen the planner to retry.'); return;
    }
    const worker = new Worker(new URL('./metrics.worker.ts', import.meta.url), {type:'module'});
    worker.onmessage = e => {
      if (e.data.error) { setBusy(false); setError(e.data.error); return; }
      const landing = e.data.landing, tested = job.tested + landing.tested;
      if (job.mode === 'next' && !landing.matching && job.end < job.limit) {
        setJob({...job, ...nextWindowChunk(job.end + HOUR, job.limit), tested});
        return;
      }
      setBusy(false); setJob(null);
      setResult({...landing, tested, mode:job.mode, searchedStart:job.origin, searchedEnd:job.end});
    };
    worker.onerror = e => { setBusy(false); setError(e.message || 'Calculation could not start. Try again.'); };
    worker.postMessage({id:'landing',kind:'landing',data:packet,start:job.start,end:job.end,
      duration:job.duration,mask:getMask(terrain,state.mastM),minAntennaEl:state.minAntennaEl,profile});
    return () => worker.terminate();
  }, [job, packet, terrain]);
  const validate = () => {
    const duration = Number(days);
    if (!days || !Number.isFinite(duration) || duration < .1 || duration > 90) {
      setError('Enter a mission duration from 0.1 to 90 Earth days.'); return null;
    }
    if (!Object.values(profile).every(Number.isFinite) || profile.minSunlitPct < 0 || profile.minSunlitPct > 100 ||
      profile.minEarthDtePct < 0 || profile.minEarthDtePct > 100 || profile.maxDarknessHours < 0 || profile.maxDarknessHours > 2160) {
      setError('Use 0–100% for sunlight/contact and 0–2160 hours for darkness.'); return null;
    }
    return duration;
  };
  const calculate = () => {
    const duration = validate(); if (duration === null) return;
    const earliestDeparture = startDate ? Date.parse(startDate + 'T00:00:00Z') : state.time;
    const { start, end } = arrivalSearch(earliestDeparture, span, flightProfile);
    if (!Number.isFinite(start) || earliestDeparture < Date.parse('1969-01-01') || end + duration * DAY >= Date.parse('2041-01-01')) {
      setError('The search and entire mission must fit between 1969 and the end of 2040.'); return;
    }
    setError(''); setResult(null); setChosen(null); setBusy(true);
    setPreference('best');
    setJob({start,end,span,duration,origin:start,tested:0,mode:'range'});
    // A previous failed network request can be retried explicitly.
    ensureData(site, start, span + duration, !!state.errors[key]);
  };
  const findNext = () => {
    const duration = validate(); if (duration === null) return;
    const departure = startDate ? Date.parse(startDate + 'T00:00:00Z') : state.time;
    if (!Number.isFinite(departure) || departure < Date.parse('1969-01-01')) {
      setError('Choose an earliest departure from 1969 through 2040.'); return;
    }
    // Continue after dates already checked; never silently relax mission limits.
    const start = result?.tested && !result.matching ? result.searchedEnd + HOUR : arrivalSearch(departure, span, flightProfile).start;
    try {
      const search = nextWindowSearch(start, duration);
      setError(''); setResult(null); setChosen(null); setBusy(true); setPreference('earliest');
      setJob({...search,duration});
      ensureData(site, search.start, search.span + duration, !!state.errors[key]);
    } catch (e) { setError(e.message); }
  };
  const stopSearch = () => {
    if (job?.mode === 'next') setResult({windows:[],matching:0,tested:job.tested,mode:'next',cancelled:true,
      searchedStart:job.origin,searchedEnd:job.start - HOUR});
    setJob(null); setBusy(false); setError('');
  };
  const submit = (travel = false) => {
    const duration = validate(); if (duration === null) return;
    const time = manual ? (live ? Math.floor(state.time / HOUR) * HOUR : Date.parse(epoch + 'Z')) : chosen;
    if (time === null || !Number.isFinite(time)) { setError('Calculate dates and select a landing option first.'); return; }
    if (time < Date.parse('1969-01-01') || time + duration * DAY >= Date.parse('2041-01-01')) {
      setError('The entire mission must be between 1969 and the end of 2040.'); return;
    }
    const estimate = flightEstimate(time, flightProfile);
    if (travel && Date.parse(estimate.departureUtc) < Date.parse('1969-01-01')) {
      setError('Choose an arrival whose estimated departure is on or after 1 January 1969.');
      return;
    }
    const id = ['A','B','C','D'].find(i => !state.scenarios.some(s => s.id === i));
    if (!id) { setError('Four scenarios are already open. Remove one to add another.'); return; }
    const scenario: Scenario = {id,siteId:state.selected,epoch:manual && live ? 'live' : new Date(time).toISOString(),
      durationDays:duration,arrayMode,arrayAzimuth,profile,
      ...(!(manual && live) ? {flightProfile} : {})};
    state.set({scenarios:[...state.scenarios,scenario],activeScenarioId:id,compare:!travel,scenarioDialog:false});
    ensureData(site,time,duration);
    if (travel) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) state.set({time,view:'surface',landed:true,playing:false});
      else state.set({view:'globe',focusVersion:state.focusVersion+1,
        time:Date.parse(estimate.departureUtc),
        travel:{from:Date.parse(estimate.departureUtc),to:time,started:performance.now(),siteId:state.selected},playing:false,chase:true});
    } else state.message(`Scenario ${id} added with ${manual && live ? 'a live' : 'a pinned'} landing date.`);
  };
  const networkError = job && state.errors[key];
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget) close();}}>
    <section className="scenario-dialog landing-planner" role="dialog" aria-modal="true" aria-labelledby="scenario-title"
      onKeyDown={e => {
        if(e.key==='Escape') close();
        if(e.key==='Tab') {
          const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input,select,summary')).filter(x => !x.hasAttribute('disabled') && x.getClientRects().length);
          const i = els.indexOf(document.activeElement as HTMLElement);
          if((e.shiftKey && i===0)||(!e.shiftKey && i===els.length-1)) {e.preventDefault(); (e.shiftKey?els.at(-1):els[0])?.focus();}
        }
      }}>
      <header><h2 id="scenario-title">Plan a landing</h2><button className="icon-button" aria-label="Close landing plan" onClick={close}><X size={20}/></button></header>
      <p>{site.name} <span className="muted">/ {site.region}</span></p>
      <p className="planner-intro">Find landing dates with enough sunlight and Earth contact for your surface stay.</p>
      <label>Mission reference
        <select ref={first} value={flightProfile} onChange={e => {
          setFlightProfile(e.target.value);
          setDays(String(historicalTiming(e.target.value).surfaceDays));
        }}>
          {Object.entries(MISSION_PROFILES).map(([id, profile]) => <option key={id} value={id}>{profile.label}</option>)}
        </select>
      </label>
      <p className="data-note"><strong>Estimated flight {flightLabel(timing.flightHours)}</strong> · {timing.surfaceDays} Earth days on the surface by default</p>
      <label>Surface duration (Earth days)<input type="number" min="0.1" max="90" step="0.1" value={days} onChange={e=>setDays(e.target.value)}/></label>
      <div className="planner-mode" role="group" aria-label="Landing date method">
        <button aria-pressed={!manual} onClick={()=>setManual(false)}>Calculate dates</button>
        <button aria-pressed={manual} onClick={()=>setManual(true)}>Manual date</button>
      </div>
      {manual ? <>
        <label>Arrival date and time <span className="muted">UTC</span><input type="datetime-local" min="1969-01-01T00:00" max="2040-12-31T23:59" value={epoch} onChange={e=>setEpoch(e.target.value)}/></label>
        <label className="check-label"><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)}/>Follow the global clock instead of pinning this date</label>
      </> : <p className="data-note">Search starts at the earliest arrival from the map clock, using the estimated flight time.</p>}
      <details className="planner-advanced"><summary>Timing and historical sources</summary>
        {!manual && <div className="planner-range">
          <label>Earliest departure (UTC, optional)<input type="date" min="1969-01-01" max="2040-12-31" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label>Arrival search span<select value={span} onChange={e=>setSpan(+e.target.value)}><option value={7}>7 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select></label>
        </div>}
        <p className="data-note">Departure uses the historical median time from launch to touchdown, including time in orbit.</p>
        {timing.missions.length > 1 && <p className="data-note">
          Recorded flight range: {(timing.observedMinHours / 24).toFixed(1)} to {(timing.observedMaxHours / 24).toFixed(1)} days.
        </p>}
        <ul>{timing.missions.map(m => <li key={m.name}>
          {m.name} · {(m.flightHours / 24).toFixed(1)} days to touchdown
          {" · "}<a href={m.sources[0]} target="_blank" rel="noreferrer">Flight record</a>
          {m.sources[1] && <>{" · "}<a href={m.sources[1]} target="_blank" rel="noreferrer">Surface record</a></>}
        </li>)}</ul>
      </details>
      <fieldset className="landing-requirements"><legend>What does your mission need?</legend>
        {Object.entries(profile).map(([key,value])=><label key={key}>{key==='minSunlitPct'?'Minimum time in sunlight (%)':key==='maxDarknessHours'?'Longest allowed darkness (hours)':'Minimum time with Earth contact (%)'}
          <input type="number" min="0" max={key==='maxDarknessHours'?2160:100} value={Number.isNaN(value)?'':value} onChange={e=>setProfile({...profile,[key]:e.target.value===''?NaN:+e.target.value})}/></label>)}
        <p className="data-note">Earth contact starts when Earth’s centre clears the horizon and your {state.minAntennaEl}° antenna limit.</p>
      </fieldset>
      <details className="planner-advanced"><summary>Solar array settings</summary>
        <label>Solar array orientation<select value={arrayMode} onChange={e=>setArrayMode(e.target.value)}>
          <option value="horizontal">Horizontal</option><option value="vertical">Vertical, fixed compass direction</option><option value="single_axis">Single-axis tracking · north–south axis</option><option value="tracking">Ideal Sun-tracking</option>
        </select></label>
        {arrayMode==='vertical' && <label>Array-facing azimuth · degrees clockwise from north<input type="number" min="0" max="360" value={arrayAzimuth} onChange={e=>setArrayAzimuth(+e.target.value)}/></label>}
        <p className="data-note">Array orientation determines the mission power index.</p>
      </details>
      {!manual && <button className="primary full-width" onClick={calculate} disabled={busy && !networkError && !error}>
        {busy && !networkError && !error ? <><LoaderCircle size={16} className="spin"/>Calculating landing dates…</> : 'Find possible landing dates'}
      </button>}
      {!manual && !busy && <>
        <button className="full-width" onClick={findNext}>Find next window</button>
        <p className="data-note">Look up to a year ahead for the first window that meets your mission limits.</p>
      </>}
      {busy && <button className="full-width" onClick={stopSearch}>Stop search</button>}
      {busy && !networkError && !error && <p className="data-note" role="status">
        {job.mode === 'next' && <>Searching {dateLabel(job.start)} – {dateLabel(job.end)} UTC · {job.tested} earlier arrivals checked. Search limit {dateLabel(job.limit)} UTC. </>}
        {packet?'Checking hourly arrivals and ten-minute mission conditions…':'Loading real NASA/JPL Sun and Earth positions for the full search…'}
      </p>}
      {(error || networkError) && <p className="error-text" role="alert">{error || networkError}</p>}
      {networkError && job && <button onClick={()=>{setError('');setBusy(true);ensureData(site,job.start,job.span+job.duration,true);}}>Retry current search</button>}
      {site.family==='custom' && !terrain && !state.loading[key] && <p className="quality limited">LOLA terrain unavailable. Calculations use a smooth horizon.</p>}
      {!manual && result && <section className="landing-results" aria-live="polite">
        <h3>{result.cancelled ? 'Search stopped' : result.windows.length ? (result.mode === 'next' ? 'Next matching window found' : `${result.windows.length} candidate ${result.windows.length===1?'window':'windows'}`) : 'No dates meet these limits'}</h3>
        <p className="data-note">{result.matching} of {result.tested} hourly arrival times meet all three limits.</p>
        {result.tested > 0 && <p className="data-note">Checked {dateLabel(result.searchedStart)} – {dateLabel(result.searchedEnd)} UTC.{!result.matching && ' Use Find next window to continue from here, or adjust your mission limits.'}</p>}
        {result.windows.length > 0 && <label>Recommend by<select value={preference} onChange={e=>setPreference(e.target.value)}>
          <option value="earliest">Earliest compatible arrival</option><option value="best">Best surface conditions in each window</option>
        </select></label>}
        {result.windows.map((w:any)=>{const recommended = preference === 'earliest' ? w.first : w.best; return <label className={'landing-candidate'+(chosen===recommended.time?' is-chosen':'')} key={w.start}>
          <input type="radio" name="landing-candidate" checked={chosen===recommended.time} onChange={()=>setChosen(recommended.time)}/>
          <span><strong>Land {dateLabel(recommended.time)} UTC</strong>
            <span>Estimated departure {dateLabel(recommended.time - timing.flightHours * HOUR)} UTC · {flightLabel(timing.flightHours)} flight</span>
            <span>Matching hourly arrivals: {dateLabel(w.start)} – {dateLabel(w.end)} UTC</span>
            <span className="landing-candidate-metrics"><b>{recommended.sunlitPct.toFixed(1)}% sunlight</b><b>{recommended.earthDtePct.toFixed(1)}% contact</b><b>{recommended.longestDarkH.toFixed(1)} h max darkness</b></span>
          </span>
        </label>})}
        <p className="data-note">Hourly arrivals · NASA/JPL positions · {terrain ? 'LOLA terrain' : 'Smooth horizon'}</p>
      </section>}
      {manual && !live && Number.isFinite(Date.parse(epoch + 'Z')) && <p className="data-note">
        Estimated departure {dateLabel(Date.parse(epoch + 'Z') - timing.flightHours * HOUR)} UTC.
      </p>}
      <footer><button disabled={!manual && chosen===null} onClick={()=>submit(false)}>Add to comparison</button>
        <button className="primary" disabled={!terrain || (!manual && chosen===null)} onClick={()=>submit(true)}>Travel &amp; land <ArrowUpRight size={16}/></button></footer>
    </section>
  </div>;
}

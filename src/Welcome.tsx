import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import "./welcome.css";

type Props = { departing: boolean; enter: () => void; skip: () => void };
export const WELCOME_ENTRY_MS = 2000;

export default function Welcome({ departing, enter, skip }: Props) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    // The welcome screen covers the application. Keep its hidden controls out
    // of keyboard navigation until the introduction has finished.
    const parent = node.parentElement!;
    const previous = new Map<HTMLElement, boolean>();
    const isolate = () => {
      for (const child of [...parent.children] as HTMLElement[]) {
        if (child === node) continue;
        if (!previous.has(child)) previous.set(child, child.inert);
        child.inert = true;
      }
    };
    isolate();
    const observer = new MutationObserver(isolate);
    observer.observe(parent, { childList: true });
    node.focus({ preventScroll: true });
    return () => { observer.disconnect(); previous.forEach((inert, child) => { child.inert = inert; }); };
  }, []);
  return <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="welcome-title"
    aria-busy={departing} style={{"--entry-duration": `${WELCOME_ENTRY_MS}ms`} as React.CSSProperties}
    className={`mission-welcome mission-welcome--ambient${departing ? " mission-welcome--departing" : ""}`}
    onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); skip(); }
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]")];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
    <div className="mission-welcome__space" aria-hidden="true">
      <div className="mission-welcome__composition">
        <div className="mission-welcome__stars">
          {[0, 1, 2].map(strip => <div className="mission-welcome__star-strip" key={strip}><img src="/assets/welcome/astronaut.png" alt="" width="1440" height="1024" fetchPriority={strip === 0 ? "high" : "auto"} decoding="async" /></div>)}
        </div>
        <div className="mission-welcome__stars mission-welcome__stars--near">
          {[0, 1, 2].map(strip => <div className="mission-welcome__star-strip" key={strip}><img src="/assets/welcome/astronaut.png" alt="" width="1440" height="1024" decoding="async" /></div>)}
        </div>
        <div className="mission-welcome__glow" />
        <img className="mission-welcome__light" src="/assets/welcome/astronaut.png" alt="" width="1440" height="1024" decoding="async" />
        <img className="mission-welcome__astronaut" src="/assets/welcome/astronaut.png" alt="" width="1440" height="1024" decoding="async" />
      </div>
    </div>
    <div className="mission-welcome__content">
      <div className="mission-welcome__float">
      <h1 id="welcome-title" aria-label="AMAZE-X"><span className="mission-welcome__wordmark">AMAZE</span><span data-node-id="23:120" className="mission-welcome__x" aria-hidden="true"><img src="/assets/welcome/x-glass.svg" alt="" width="49" height="53" /></span></h1>
      <p className="mission-welcome__tagline">Navigate the moon, reactively, accurately.</p>
      <p className="mission-welcome__description">An interactive lunar navigation app to help you discover and evaluate potential lunar landing sites using Horizons.</p>
      <div className="mission-welcome__actions">
        <button className="mission-welcome__enter" onClick={enter} disabled={departing}>Enter the Solar System <ArrowUpRight size={20} aria-hidden="true" /></button>
        <button className="mission-welcome__skip" onClick={skip} disabled={departing}>Skip introduction</button>
      </div>
      </div>
    </div>
    <footer className="mission-welcome__credits" aria-label="Credits">
      <a className="mission-welcome__nasa" href="https://www.nasa.gov/" target="_blank" rel="noreferrer"><img src="/assets/welcome/nasa-insignia.png" width="121" height="102" alt="NASA" /></a>
      <div className="mission-welcome__sources">
        <p><a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">NASA/JPL Horizons</a><span aria-hidden="true"> · </span><a href="https://science.nasa.gov/mission/lro/" target="_blank" rel="noreferrer">LOLA &amp; LROC</a><span aria-hidden="true"> · </span><a href="https://quickmap.lroc.im-ldi.com/" target="_blank" rel="noreferrer">QuickMap</a></p>
        <a className="mission-welcome__challenge" href="https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/" target="_blank" rel="noreferrer">For the NASA Space Apps Challenge</a>
      </div>
    </footer>
    {departing && <span className="sr-only" role="status">Entering the Solar System</span>}
  </section>;
}

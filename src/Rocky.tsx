import { useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  RotateCcw,
  LoaderCircle,
  ArrowUpRight,
  Image,
  History,
} from "lucide-react";
import { selectedScenario, useScout, jsonFetch } from "./store";
import RockyOverlay, { RockyBubble } from "./RockyOverlay";
import { calmVoice, useDialogueReveal } from "./rocky-voice";

type Phase = "IDLE" | "ASKING" | "THINKING" | "OPEN" | "ERROR";
type PendingQuestion = {
  question: string;
  mode: "plain" | "engineer";
  image?: string;
  context: Record<string, unknown>;
  history: { role: string; content: string }[];
};
function SpokenReply({ speech, details = "", stream, sound }: {
  speech: string; details?: string; stream: boolean; sound: boolean;
}) {
  const text = details ? `${speech}\n${details}` : speech;
  const revealed = useDialogueReveal(text, stream, sound);
  return <RockyBubble>
    <div aria-hidden="true" className="rocky-spoken-text">
      <p className="speech">{revealed.slice(0, speech.length)}</p>
      {revealed.length > speech.length && <div className="answer-details">{revealed.slice(speech.length + 1)}</div>}
    </div>
    <p className="sr-only">{text}</p>
  </RockyBubble>;
}

export default function Rocky({ snapshot }: { snapshot: () => string }) {
  const state = useScout(),
    [phase, setPhase] = useState<Phase>("IDLE"),
    [draft, setDraft] = useState(""),
    [answer, setAnswer] = useState<any>(null),
    [error, setError] = useState(""),
    [image, setImage] = useState(false),
    [history, setHistory] = useState<any[]>([]),
    [showHistory, setShowHistory] = useState(false),
    controller = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement>(null),
    lastQuestion = useRef(""),
    pending = useRef<PendingQuestion | null>(null);
  const [attachedMap, setAttachedMap] = useState("");
  const [retryVisual, setRetryVisual] = useState(false);
  const resumePhase = useRef<Phase>("ASKING");
  const [animateReply, setAnimateReply] = useState(true);
  const site = [...state.sites, ...state.custom].find(
      (s) => s.id === state.selected,
    ),
    scenario = selectedScenario(state);
  useEffect(() => {
    const open = () => setPhase(current => current === "IDLE" ? resumePhase.current : current);
    window.addEventListener("ask-rocky", open);
    return () => window.removeEventListener("ask-rocky", open);
  }, []);
  useEffect(() => {
    if (phase === "ASKING") input.current?.focus();
  }, [phase]);
  const ask = async (retry = false) => {
    const q = retry ? lastQuestion.current : draft.trim();
    if (!q) return;
    if (!retry) {
      pending.current = null;
      setAttachedMap("");
      setRetryVisual(image);
    }
    lastQuestion.current = q;
    setAnimateReply(true);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setPhase("THINKING");
    setError("");
    try {
      const mapImage =
        retry && pending.current
          ? pending.current.image
          : (retry ? retryVisual : image)
            ? snapshot()
            : undefined;
      if ((retry ? retryVisual : image) && !mapImage)
        throw new Error(
          "The map image is not ready. Wait for the scene to load, then retry.",
        );
      const payload =
        retry && pending.current
          ? pending.current
          : {
              question: q,
              mode: state.mode,
              image: mapImage,
              context: {
                selectedSiteId: state.selected,
                activeScenarioId: state.activeScenarioId,
                timeUtc: new Date(state.time).toISOString(),
                view: state.view,
                mastM: state.mastM,
                minAntennaEl: state.minAntennaEl,
                durationDays: scenario?.durationDays,
                scenarios: state.scenarios,
                customSites: state.custom.filter(
                  (s) =>
                    s.id === state.selected ||
                    state.scenarios.some((c) => c.siteId === s.id),
                ),
              },
              history: history.slice(-3).flatMap((h) => [
                { role: "user", content: h.question },
                {
                  role: "assistant",
                  content: `${h.answer.speech}\n${h.answer.details}`.slice(0, 9000),
                },
              ]),
            };
      pending.current = payload;
      setAttachedMap(payload.image ?? "");
      const result = await jsonFetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: request.signal,
      });
      if (controller.current !== request || request.signal.aborted) return;
      setAnswer(result);
      setHistory((h) => [...h, { question: q, answer: result }]);
      setDraft("");
      pending.current = null;
      setAttachedMap("");
      setPhase("OPEN");
    } catch (e) {
      if (controller.current === request && !request.signal.aborted && e.name !== "AbortError") {
        setError(e.message);
        setPhase("ERROR");
      }
    }
  };
  const action = (a: any) => {
    if (a.type === "set_time") state.set({ time: Date.parse(a.iso) });
    else if (a.type === "set_view") state.set({ view: a.view });
    else if (a.type === "fly_to" || a.type === "open_inspector")
      state.fly(a.siteId);
    else if (a.type === "add_to_compare") {
      state.select(a.siteId);
      state.set({ scenarioDialog: true });
      if (a.iso) state.set({ time: Date.parse(a.iso) });
    }
  };
  const close = () => {
    controller.current?.abort();
    calmVoice.stop();
    resumePhase.current = phase === "THINKING" ? "ASKING" : phase;
    setPhase("IDLE");
    setShowHistory(false);
    setAnimateReply(false);
  };
  const reopen = () => setPhase(resumePhase.current);
  const editQuestion = () => {
    setDraft(lastQuestion.current);
    pending.current = null;
    setAttachedMap("");
    setError("");
    setPhase("ASKING");
  };
  useEffect(() => () => controller.current?.abort(), []);
  return <RockyOverlay
    visible={!state.welcome}
    open={phase !== "IDLE"}
    thinking={phase === "THINKING"}
    onChat={() => phase === "IDLE" ? reopen() : close()}
    renderChat={(stream, sound) => (
      <div className="rocky-panel" onKeyDown={e => {
        if (e.key === "Escape") { e.stopPropagation(); close(); }
      }}>
      <div className="sr-only" role="status">
        {phase === "THINKING" ? "Rocky is thinking" : phase === "OPEN" ? "Rocky has an answer" : phase === "ERROR" ? error : ""}
      </div>
        <div className="rocky-chat-scroll">
          <header>
            <strong>Rocky</strong>
            <span className="muted">{site?.name || "Earth–Moon space"}</span>
            <button
              className="icon-button"
              aria-label="Answer history"
              disabled={phase === "THINKING"}
              onClick={() => setShowHistory((v) => !v)}
            >
              <History size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Close Rocky"
              onClick={close}
            >
              <X size={16} />
            </button>
          </header>
          {showHistory ? (
            <div className="history-list">
              {history.length ? (
                history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setAnimateReply(false);
                      setAnswer(h.answer);
                      setPhase("OPEN");
                      setShowHistory(false);
                    }}
                  >
                    {h.question}
                  </button>
                ))
              ) : (
                <p>No answers yet. Ask about a site to begin.</p>
              )}
            </div>
          ) : (
            <>
              {phase === "ASKING" && (
                <>
                  <RockyBubble><p>Friend! Pick a place. Rocky helps check Sun, Earth, and terrain. Where we go, question?</p></RockyBubble>
                  <div className="question-chips">
                    {[
                      "When does the Sun set here?",
                      "Why is the lunar south pole difficult?",
                      "Explain the horizon assumptions.",
                      "What can you see on this map?",
                    ].map((q) => (
                      <button key={q} onClick={() => {
                        setDraft(q);
                        if (q === "What can you see on this map?") setImage(true);
                      }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {phase === "THINKING" && (
                <div className="thinking">
                  <LoaderCircle className="spin" size={18} />
                  <div className="rocky-thinking-bubble"><SpokenReply speech={attachedMap ? "Rocky looks at your map. One moment." : "Rocky checks the numbers. One moment."} stream={stream} sound={sound} /></div>
                  <button onClick={close}>Cancel</button>
                </div>
              )}
              {phase === "ERROR" && (
                <div className="assistant-error">
                  <RockyBubble><p>{retryVisual ? "Rocky still has your question. Try again, question?" : "Rocky needs another try. Ready, question?"}</p></RockyBubble>
                  <small>{error}</small>
                  {attachedMap && <figure className="rocky-map-preview">
                    <img src={attachedMap} alt="Map snapshot saved for retry" />
                    <figcaption>Retry uses this same map and time.</figcaption>
                  </figure>}
                  <button onClick={() => { if (sound) void calmVoice.unlock(); ask(true); }}>
                    <RotateCcw size={14} /> Retry
                  </button>
                  <button onClick={editQuestion}>Edit question</button>
                </div>
              )}
              {phase === "OPEN" && answer && (
                <div className="answer-content">
                  <SpokenReply key={lastQuestion.current} speech={answer.speech} details={answer.details}
                    stream={stream && animateReply} sound={sound} />
                  {answer.evidence?.length > 0 && (
                    <details>
                      <summary>Numbers I used</summary>
                      <table>
                        <tbody>
                          {answer.evidence.map((f: any) => (
                            <tr key={f.id}>
                              <th>{f.label}</th>
                              <td>
                                {f.value} {f.unit}
                                {f.utc && <small>{f.utc}</small>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                  <div className="action-chips">
                    {answer.actions?.map((a: any, i: number) => (
                      <button key={i} onClick={() => action(a)}>
                        {a.type.replaceAll("_", " ")}{" "}
                        {a.siteId || a.view || a.iso}
                      </button>
                    ))}
                    {answer.actions?.length > 1 && (
                      <button onClick={() => answer.actions.forEach(action)}>
                        Do all
                      </button>
                    )}
                  </div>
                  <small className="data-note">
                    {answer.model} · Early screening
                  </small>
                </div>
              )}
              {(phase === "ASKING" || phase === "OPEN") && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (sound) void calmVoice.unlock();
                    ask();
                  }}
                >
                  <div className="ask-input">
                    <input
                      ref={input}
                      maxLength={500}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Ask Rocky…"
                      aria-label="Question for Rocky"
                    />
                    <button
                      className="icon-button"
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label="Send question"
                    >
                      <Send size={17} />
                    </button>
                  </div>
                  <label className="snapshot-check">
                    <input
                      type="checkbox"
                      checked={image}
                      onChange={(e) => setImage(e.target.checked)}
                    />
                    <Image size={13} /> Include current map image
                  </label>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    )}
  />;
}

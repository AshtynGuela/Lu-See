import { useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  RotateCcw,
  LoaderCircle,
  ArrowUpRight,
  Image,
  History,
  Check,
} from "lucide-react";
import { actionLabel } from "../engine/app-actions.mjs";
import { runAppAction } from "./app-actions";
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

export default function Rocky({ snapshot, hasInspector }: { snapshot: () => string; hasInspector: boolean }) {
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
  const [autoUse,setAutoUse]=useState(()=>localStorage.getItem("amaze-x-rocky-auto")!=="off");
  useEffect(()=>localStorage.setItem("amaze-x-rocky-auto",autoUse?"on":"off"),[autoUse]);
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
    const wantsImage=image||/\b(?:look at (?:this |the |my )?map|inspect (?:this |the |my )?map|what (?:can you see|is shown)|this (?:image|screenshot)|map looks)\b/i.test(q);
    if (!retry) {
      pending.current = null;
      setAttachedMap("");
      setRetryVisual(wantsImage);
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
          : (retry ? retryVisual : wantsImage)
            ? snapshot()
            : undefined;
      if ((retry ? retryVisual : wantsImage) && !mapImage)
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
                customSites: state.custom,
                settings: {playing:state.playing,speed:state.speed,trueScale:state.trueScale,grid:state.grid,markers:state.markers,statLayer:state.statLayer,lunarLighting:state.lunarLighting,lunarRotation:state.lunarRotation,lunarTerrain:state.lunarTerrain,freeCameraAxis:state.freeCameraAxis,mastM:state.mastM,minAntennaEl:state.minAntennaEl},
                solarBody:state.selectedBody,
                lastActions:history.at(-1)?.answer?.actionResults??[],
                toolsEnabled:autoUse,
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
      result._requestId=crypto.randomUUID();
      result.actionResults=[];
      if(autoUse)for(const action of result.actions??[]){
        if(controller.current!==request||request.signal.aborted)return;
        result.actionResults.push(await runAppAction(action));
      }
      if(controller.current!==request||request.signal.aborted)return;
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
  const action = async (index: number) => {
    if(!answer||answer.actionResults?.[index]?.ok)return;
    const result=await runAppAction(answer.actions[index]);
    const updated={...answer,actionResults:[...(answer.actionResults??[])]};
    updated.actionResults[index]=result;
    setAnswer(updated);
    setHistory(rows=>rows.map(row=>row.answer._requestId===updated._requestId?{...row,answer:updated}:row));
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
    hasInspector={hasInspector}
    open={phase !== "IDLE"}
    thinking={phase === "THINKING"}
    onChat={() => phase === "IDLE" ? reopen() : close()}
    renderChat={(stream, sound) => (
      <div id="rocky-chat" className="rocky-panel" onKeyDown={e => {
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
                  <RockyBubble><p>Friend! Rocky can explore the map, compare landing plans, and help find a date. Tell Rocky what you want to do. Big science, together.</p></RockyBubble>
                  <div className="question-chips">
                    {[
                      "How do I find a landing window?",
                      "Open the Moon in terrain flyover.",
                      "Show me what you can do in AMAZE-X.",
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
                      <button key={i} onClick={() => action(i)} disabled={answer.actionResults?.[i]?.ok} title={answer.actionResults?.[i]?.message}>
                        {answer.actionResults?.[i]?.ok&&<Check size={13}/>}{actionLabel(a,[...state.sites,...state.custom])}
                      </button>
                    ))}
                    {answer.actions?.length > 1 && (
                      <button disabled={answer.actions.every((_:any,index:number)=>answer.actionResults?.[index]?.ok)} onClick={async()=>{
                        const updated={...answer,actionResults:[...(answer.actionResults??[])]};
                        for(let i=0;i<answer.actions.length;i++)if(!updated.actionResults[i]?.ok)updated.actionResults[i]=await runAppAction(answer.actions[i]);
                        setAnswer(updated);setHistory(rows=>rows.map(row=>row.answer._requestId===updated._requestId?{...row,answer:updated}:row));
                      }}>
                        Use these tools
                      </button>
                    )}
                  </div>
                  {answer.actionResults?.length>0&&<div className="rocky-action-results" role="status">{answer.actionResults.map((result:any,index:number)=>result&&<p key={index} className={result.ok?"":"assistant-error"}>{result.ok?"Done: ":"Could not finish: "}{result.message}</p>)}</div>}
                  <small className="data-note">
                    {answer.model}
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
                  <label className="snapshot-check"><input type="checkbox" checked={autoUse} onChange={event=>setAutoUse(event.target.checked)}/>Let Rocky use app tools</label>
                  <p className="rocky-tools-hint">Rocky can open views, adjust settings and run your chosen analysis. Completed actions appear below his reply.</p>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    )}
  />;
}

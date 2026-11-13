import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { LoopRepeat, Mesh, MeshPhysicalMaterial, Texture } from "three";
import { MessageCircle } from "lucide-react";
import { calmVoice, useDialogueReveal } from "./rocky-voice";

const movements = [
  ["Random", "Random animations"], ["Attentive", "Attentive"],
  ["Question", "Question? / tapping"], ["RockyDance", "Rocky dance"],
  ["JazzHands", "Jazz hands"], ["ClawGrip", "Claw open / close"],
  ["Scuttle", "Scuttle"],
] as const;
const phrases = [
  "How do you know when the hug is done?",
  "Thumbs up, baby",
  "Fist my bump",
  "User question is dumb",
  "My portable Earth thinking machine",
  "Rocky, User, big science",
  "Good, Good",
  "Oh, humor. Confusing.",
  "Dirty, dirty, dirty…. This room for garbage?",
  "Need word: to risk self to help another",
  "Amaze, Amaze, Amaze",
  "It's not enough",
  "Grace Rocky Save Stars",
  "Thank.",
  "Grace, question?",
  "You are here!",
  "Yes! Set up the airlock tunnel!",
  "Warning! Taumoeba-82.5 is-",
  "I know! I know. It can get through xeonite. That's why I'm here. I knew you'd be in trouble.",
  "You observe, question?",
  "Yes. Want want want.",
  "Eiridians need water too, you know.",
  "Rocky new to ball",
  "I like Earth",
  "rocky happy not alone",
  "Need more space for Rocky, much less space for Grace",
  "scary alien spider",
  "Grumpy.Angry.Stupid.How long since last sleep?",
  "Who is User talking to, question?",
  "Full Good",
  "Where my bedroom?",
];
const introduction = "Left or Right Click Me for Features! I help you. Statement.";
const randomClips = ["Attentive", "Question", "RockyDance", "JazzHands", "ClawGrip", "Scuttle", "FistBump", "Celebration"];
const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), Math.max(min, max));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const readSetting = (name: string) => localStorage.getItem(`lunar-rocky-${name}`) !== "off";
type Point = { x: number; y: number };
const opaqueMaps = new WeakMap<Texture, boolean>();
function zeroTransmission(map: Texture) {
  if (opaqueMaps.has(map)) return opaqueMaps.get(map);
  try {
    const image = map.image;
    if (!image?.width || !image?.height) return false;
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    if (!ctx) return false;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let zero = true;
    // glTF transmission reads only red. Test every pixel, not a downsample.
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== 0) { zero = false; break; }
    opaqueMaps.set(map, zero);
    return zero;
  } catch { return false; }
}

function Model({ clip, paused, replay, onReady }: { clip: string; paused: boolean; replay: number; onReady: () => void }) {
  const { scene, animations } = useGLTF("/assets/rocky-web.glb");
  const { actions, ref } = useAnimations(animations);
  const invalidate = useThree(s => s.invalidate);
  useLayoutEffect(() => {
    const restore: (() => void)[] = [];
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const original = object.material;
      const materials = Array.isArray(original) ? original : [original];
      const replacements = materials.map(material => {
        if (!(material instanceof MeshPhysicalMaterial) || !material.transmissionMap ||
            !zeroTransmission(material.transmissionMap)) return material;
        // A black transmission map means zero transmission everywhere. Avoid
        // the extra glass passes without changing any visible material value,
        // source texture, geometry, or the one arm's nonzero transmission.
        const opaque = material.clone(); opaque.transmission = 0;
        restore.push(() => opaque.dispose());
        return opaque;
      });
      object.material = Array.isArray(original) ? replacements : replacements[0];
      restore.push(() => {object.material = original;});
    });
    invalidate();
    return () => restore.reverse().forEach(reset => reset());
  }, [scene, invalidate]);
  useEffect(onReady, [onReady]);

  useEffect(() => {
    const action = actions[clip];
    if (action) {
      action.clampWhenFinished = false;
      action.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.2).play();
    }
    invalidate();
    return () => { action?.stop(); };
  }, [actions, clip, replay, invalidate]);
  useEffect(() => {
    const action = actions[clip];
    if (action) action.paused = paused;
    invalidate();
    if (paused) return;
    const timer = setInterval(invalidate, 1000 / 30);
    return () => clearInterval(timer);
  }, [actions, clip, paused, replay, invalidate]);
  return <group ref={ref}><primitive object={scene} /></group>;
}

class MascotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <MessageCircle size={28} /> : this.props.children; }
}

export function RockyBubble({ children }: { children: ReactNode }) {
  return <div className="rocky-speech-bubble">{children}</div>;
}

function IdleBubble({ phrase, sound, onFinish }: {
  phrase: string;
  sound: boolean;
  onFinish: () => void;
}) {
  const text = useDialogueReveal(phrase, true, sound);
  useEffect(() => {
    if (text !== phrase) return;
    const timer = setTimeout(onFinish, 3500);
    return () => clearTimeout(timer);
  }, [text, phrase, onFinish]);
  return <RockyBubble><span aria-hidden="true">{text}</span><span className="sr-only">{phrase}</span></RockyBubble>;
}

export default function RockyOverlay({ visible, open, thinking, onChat, renderChat }: {
  visible: boolean;
  open: boolean;
  thinking: boolean;
  onChat: () => void;
  renderChat: (stream: boolean, sound: boolean) => ReactNode;
}) {
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  const [position, setPosition] = useState<Point | null>(null);
  const [scale, setScale] = useState(1);
  const [movement, setMovement] = useState("Random");
  const [randomClip, setRandomClip] = useState("Attentive");
  const [gesture, setGesture] = useState<{ clip: string; id: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [chatter, setChatter] = useState(() => readSetting("chatter"));
  const [stream, setStream] = useState(() => readSetting("stream"));
  const [sound, setSound] = useState(() => readSetting("sound"));
  const [speech, setSpeech] = useState<{ text: string; id: number } | null>(null);
  const clearSpeech = useCallback(() => setSpeech(null), []);
  const [menu, setMenu] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [roaming, setRoaming] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [modelReady, setModelReady] = useState(false);
  const modelLoaded = useCallback(() => setModelReady(true), []);
  const mascot = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pointerMap = useRef(new Map<number, Point>());
  const drag = useRef<{ start: Point; origin: Point } | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const moved = useRef(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heldForMenu = useRef(false);
  const pointerReleasedAfterHold = useRef(-Infinity);
  const lastPhrase = useRef("");
  const greeted = useRef(false);
  const idle = visible && pageVisible && modelReady && !open && !paused && !dragging && !menu && !gesture;
  const compact = viewport.width < 760;
  const baseSize = compact ? 96 : 122;
  const size = Math.min(baseSize * scale, viewport.width, viewport.height);
  const dock = { x: viewport.width - size, y: viewport.height - size };
  // Start beside the map, clear of the inspector and bottom time controls.
  const home = {
    x: compact ? viewport.width - size - 20 : viewport.width - (viewport.width > 1200 ? 370 : 324) - size - 28,
    y: viewport.height * (compact ? .32 : .64) - size / 2,
  };
  const at = { x: clamp(position?.x ?? home.x, 0, dock.x), y: clamp(position?.y ?? home.y, 0, dock.y) };
  const side = at.y + size / 2 > viewport.height * 0.51 ? "above" : "below";
  const bubbleWidth = Math.min(open ? 386 : 280, viewport.width - 24);
  const bubbleX = clamp(at.x + size / 2 - bubbleWidth / 2, 12, viewport.width - bubbleWidth - 12);
  const bubbleY = side === "above" ? viewport.height - at.y + 8 : at.y + size + 8;
  const chatHeight = Math.max(100, viewport.height - bubbleY - 12);

  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    for (const [key, on] of Object.entries({ chatter, stream, sound }))
      localStorage.setItem(`lunar-rocky-${key}`, on ? "on" : "off");
    if (!sound) calmVoice.stop();
  }, [chatter, stream, sound]);
  useEffect(() => {
    if (!sound) return;
    const unlockAudio = () => { void calmVoice.unlock(); };
    // Entering or skipping the welcome screen provides browser audio activation.
    window.addEventListener("click", unlockAudio, { capture: true, once: true });
    return () => window.removeEventListener("click", unlockAudio, true);
  }, [sound]);
  useEffect(() => {
    if (open || !visible) setSpeech(null);
  }, [open, visible]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector("button")?.focus();
    const outside = (e: globalThis.PointerEvent) => {
      pointerReleasedAfterHold.current = -Infinity;
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [menu]);
  useEffect(() => {
    if (!gesture || paused) return;
    const timer = setTimeout(() => setGesture(null), 2800);
    return () => clearTimeout(timer);
  }, [gesture, paused]);
  useEffect(() => {
    if (movement !== "Random" || !visible || !pageVisible || paused || gesture) return;
    const timer = setTimeout(() => {
      setRandomClip(previous => {
        const choices = randomClips.filter(clip => clip !== previous);
        return choices[Math.floor(Math.random() * choices.length)];
      });
    }, 3000 + Math.random() * 3000);
    return () => clearTimeout(timer);
  }, [movement, visible, pageVisible, paused, gesture, randomClip]);
  useEffect(() => {
    if ((movement !== "Random" && movement !== "Scuttle") || !idle || reducedMotion()) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      setRoaming(true);
      setRandomClip("Scuttle");
      setPosition(current => {
        const here = current ?? home;
        const x = clamp(here.x, 0, dock.x), y = clamp(here.y, 0, dock.y);
        const left = x > dock.x * 0.55;
        return {
          x: clamp(x + (left ? -1 : 1) * (size * 0.75 + Math.random() * size), 0, dock.x),
          y: clamp(y + (y > dock.y * 0.7 ? -1 : 1) * size * 0.45, 0, dock.y),
        };
      });
    }, movement === "Scuttle" ? 4200 : 11500);
    return () => clearInterval(timer);
  }, [movement, idle, dock.x, dock.y, home.x, home.y, size]);
  useEffect(() => {
    if (!roaming) return;
    const timer = setTimeout(() => setRoaming(false), 1900);
    return () => clearTimeout(timer);
  }, [roaming, position]);

  function saySomething() {
    const choices = phrases.filter(text => text !== lastPhrase.current);
    const text = choices[Math.floor(Math.random() * choices.length)];
    lastPhrase.current = text;
    setSpeech({ text, id: performance.now() });
  }
  useEffect(() => {
    if (!chatter || !idle || speech) return;
    const timer = setTimeout(() => {
      if (!greeted.current) {
        greeted.current = true;
        setSpeech({ text: introduction, id: performance.now() });
      } else {
        saySomething();
      }
    }, greeted.current ? 11000 + Math.random() * 10000 : 550);
    return () => clearTimeout(timer);
  }, [chatter, idle, speech]);
  useEffect(() => () => clearTimeout(longPress.current), []);

  function showMenu(point: Point) {
    setMenu(point);
    setSpeech(null);
    setRoaming(false);
  }
  function pointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const point = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerMap.current.set(e.pointerId, point);
    clearTimeout(longPress.current);
    if (pointerMap.current.size === 1) {
      moved.current = false;
      heldForMenu.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      drag.current = { start: point, origin: { x: rect.left, y: rect.top } };
      setPosition(drag.current.origin);
      setDragging(true);
      setRoaming(false);
      if (e.pointerType === "touch") longPress.current = setTimeout(() => {
        moved.current = true;
        heldForMenu.current = true;
        showMenu(point);
      }, 540);
    } else if (pointerMap.current.size === 2) {
      const [a, b] = [...pointerMap.current.values()];
      pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale };
      moved.current = true;
    }
  }
  function pointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!pointerMap.current.has(e.pointerId)) return;
    pointerMap.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current) {
      const [a, b] = [...pointerMap.current.values()];
      if (a && b) setScale(clamp(pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance, 0.65, 2.3));
      return;
    }
    if (!drag.current || (moved.current && menu)) return;
    const { start, origin } = drag.current;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved.current && Math.hypot(dx, dy) < 5) return;
    moved.current = true;
    clearTimeout(longPress.current);
    setPosition({ x: clamp(origin.x + dx, 0, dock.x), y: clamp(origin.y + dy, 0, dock.y) });
  }
  function pointerEnd(e: PointerEvent<HTMLButtonElement>) {
    if (heldForMenu.current && e.pointerType === "touch") {
      pointerReleasedAfterHold.current = performance.now();
      heldForMenu.current = false;
    }
    pointerMap.current.delete(e.pointerId);
    clearTimeout(longPress.current);
    if (!pointerMap.current.size) {
      drag.current = null;
      pinch.current = null;
      setDragging(false);
    }
  }
  function menuAction(callback: () => void) {
    callback();
    setMenu(null);
    mascot.current?.focus();
  }
  const clip = gesture?.clip ?? (movement === "Random" ? (thinking ? "Question" : randomClip) : movement);
  return <aside className="rocky-overlay" aria-label="Rocky assistant"
    onKeyDown={e => {
      if (e.key === "Escape" && menu) {
        e.stopPropagation();
        menuAction(() => {});
      } else if (e.key === " " || e.key === "Enter") {
        e.stopPropagation();
      }
    }}>
    <button ref={mascot} type="button" className={`rocky-character${roaming ? " roaming" : ""}`}
      style={{ left: at.x, top: at.y, width: size, height: size }}
      aria-label={open ? "Toggle Rocky" : "Ask Rocky"} aria-expanded={open} aria-haspopup="menu"
      data-animation={clip} title="Click to chat. Right-click for Rocky’s options."
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
      onClick={e => {
        if (moved.current) return;
        setMenu(null);
        if (sound) void calmVoice.unlock();
        onChat();
      }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); showMenu({ x: e.clientX, y: e.clientY }); }}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") moved.current = false;
        if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          e.preventDefault(); e.stopPropagation(); showMenu({ x: at.x, y: at.y });
        }
      }}>
      <MascotBoundary><Suspense fallback={<MessageCircle size={26} />}>
        <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0, 0.2, 3.1], fov: 47 }}
          gl={{ alpha: true, antialias: true }} aria-hidden="true">
          <ambientLight intensity={1.45} />
          <directionalLight intensity={3.2} position={[3, 3, 4]} />
          <Model clip={clip} paused={paused || !visible || !pageVisible} replay={gesture?.id ?? 0} onReady={modelLoaded} />
        </Canvas>
      </Suspense></MascotBoundary>
    </button>
    {visible && (open || (speech && pageVisible && !menu && !dragging)) && <div className={`rocky-conversation ${side}`}
      style={{ left: bubbleX, width: bubbleWidth, [side === "above" ? "bottom" : "top"]: bubbleY,
        "--rocky-tail": `${clamp(at.x + size / 2 - bubbleX, 18, bubbleWidth - 18)}px`,
        "--rocky-chat-height": `${Math.min(chatHeight, viewport.height * 0.69)}px` } as React.CSSProperties}>
      {open ? renderChat(stream, sound) : <IdleBubble key={speech.id} phrase={speech.text} sound={sound} onFinish={clearSpeech} />}
    </div>}
    {menu && <div ref={menuRef} className="context-menu rocky-menu" role="menu" aria-label="Rocky options"
      style={{ left: clamp(menu.x, 8, viewport.width - 230), top: clamp(menu.y, 8, viewport.height - Math.min(680, viewport.height - 16) - 8) }}
      onClickCapture={e => {
        // Touch can dispatch a compatibility click at the release position
        // after a long press, even when the original pointer was captured.
        if (e.detail > 0 && performance.now() - pointerReleasedAfterHold.current < 350) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={e => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const buttons = [...e.currentTarget.querySelectorAll("button")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      <button role="menuitem" onClick={() => menuAction(() => { if (!open) onChat(); })}>Chat with Rocky</button>
      <div role="separator" />
      {movements.map(([id, name]) => <button key={id} role="menuitemradio" aria-checked={movement === id}
        onClick={() => menuAction(() => { setMovement(id); setGesture(null); setPaused(false); })}>{name}</button>)}
      <div role="separator" />
      <button role="menuitem" onClick={() => menuAction(() => { setPaused(false); setGesture({ clip: "FistBump", id: performance.now() }); })}>Fist bump</button>
      <button role="menuitem" onClick={() => menuAction(() => { setPaused(false); setGesture({ clip: "Celebration", id: performance.now() }); })}>Celebrate</button>
      <button role="menuitem" onClick={() => menuAction(() => setPaused(!paused))}>{paused ? "Resume" : "Pause"}</button>
      <div role="separator" />
      <button role="menuitemcheckbox" aria-checked={chatter} onClick={() => menuAction(() => { setChatter(!chatter); setSpeech(null); })}>Idle speech bubbles</button>
      <button role="menuitemcheckbox" aria-checked={stream} onClick={() => menuAction(() => setStream(!stream))}>Stream reply text</button>
      <button role="menuitemcheckbox" aria-checked={sound} onClick={() => menuAction(() => { if (!sound) void calmVoice.unlock(); setSound(!sound); })}>Calm dialogue blips</button>
      <button role="menuitem" onClick={() => menuAction(() => { if (sound) void calmVoice.unlock(); saySomething(); })}>Say something</button>
      <button role="menuitem" onClick={() => menuAction(() => setScale(1))}>Reset size</button>
      <button role="menuitem" onClick={() => menuAction(() => setPosition(null))}>Reset position</button>
      <button role="menuitem" onClick={() => menuAction(() => setPosition(dock))}>Move to corner</button>
    </div>}
  </aside>;
}

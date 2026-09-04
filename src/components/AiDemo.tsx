import { useEffect, useMemo, useRef, useState } from "react";
import { prefersReduced } from "../lib/motion";

/* Живая демонстрация AI-режима:
   идея → сценарий → кадры/озвучка → превью → кнопки публикуют по-настоящему. */

const IDEA =
  "короткий метр про кота-космонавта:\nпроснулся на станции — а корабля нет.\nсделай грустно, но смешно, 4 сцены.";

const SCENES = [
  "Станция молчит. Кот в скафандре открывает один глаз — корабль исчез.",
  "Он проверяет все люки. Внутри — скелет рыбы и записка: «Улетел на Марс, буду через неделю».",
  "Кот смотрит в иллюминатор: его корабль угнал енот. Неожиданный поворот.",
  "Мораль: прячьте ключи от корабля. Продолжение следует.",
];

const POSTERS = [
  "linear-gradient(160deg,#0f3557 0%,#0b1f3d 55%,#071226 100%)",
  "linear-gradient(160deg,#0c4038 0%,#0a2733 55%,#071422 100%)",
  "linear-gradient(160deg,#4a2c10 0%,#241728 55%,#0c1020 100%)",
  "linear-gradient(160deg,#3d1420 0%,#1c1230 55%,#0a0f22 100%)",
];

function phaseSet(take: number) {
  return [
    { label: take === 1 ? "Pollinations · кадры 720×1280" : `Дубль #${take} · кадры 720×1280`, dur: 1500 },
    { label: "edge-tts · SvetlanaNeural · озвучка", dur: 800 },
    { label: "ffmpeg · Ken Burns + склейка", dur: 950 },
  ];
}

function Checks() {
  return (
    <svg width="16" height="11" viewBox="0 0 18 12" fill="none" aria-hidden>
      <path d="m1 6.5 3.2 3.2L10.5 3" stroke="#7bc8f0" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m7.5 8.5 1.2 1.2L15 3" stroke="#7bc8f0" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Eq() {
  const bars = [6, 11, 8, 14, 9, 12, 7, 13, 8, 11, 6, 12, 9, 14, 7, 10];
  return (
    <span className="flex items-end gap-[3px] h-[16px]" aria-hidden>
      {bars.map((h, i) => (
        <i key={i} className="eq-bar w-[3px] rounded-sm bg-[var(--ok)]"
          style={{ height: h, animationDelay: `${(i % 8) * 0.09}s` }} />
      ))}
    </span>
  );
}

function Poster({ take }: { take: number }) {
  return (
    <div className="relative h-[168px] overflow-hidden" style={{ background: POSTERS[(take - 1) % POSTERS.length] }}>
      {/* планета и орбита */}
      <svg className="absolute -right-7 -top-7 opacity-70" width="130" height="130" viewBox="0 0 130 130" fill="none" aria-hidden>
        <circle cx="65" cy="65" r="34" fill="rgba(255,255,255,0.10)" />
        <circle cx="65" cy="65" r="34" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        <ellipse cx="65" cy="65" rx="56" ry="18" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" transform="rotate(-18 65 65)" />
        <circle cx="112" cy="42" r="4" fill="rgba(255,255,255,0.6)" />
      </svg>
      {/* звёзды */}
      <svg className="absolute inset-0" width="100%" height="100%" aria-hidden>
        {[[18, 26], [42, 12], [70, 30], [30, 62], [82, 58], [12, 48], [60, 74], [88, 20]].map(([x, y], i) => (
          <circle key={i} cx={`${x}%`} cy={`${y}%`} r={i % 3 === 0 ? 1.6 : 1} fill="rgba(255,255,255,0.55)" />
        ))}
      </svg>
      <svg className="absolute inset-0 m-auto" width="52" height="52" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="25" fill="rgba(255,255,255,0.13)" />
        <circle cx="26" cy="26" r="25" stroke="rgba(255,255,255,0.55)" />
        <path d="M22 18.5v15l12-7.5-12-7.5Z" fill="#fff" />
      </svg>
      <span className="absolute top-2.5 left-2.5 font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(5,12,24,0.78)] text-[#9fd8f7]">дубль #{take}</span>
      <span className="absolute bottom-2.5 right-2.5 font-mono text-[10px] px-2 py-0.5 rounded bg-[rgba(5,12,24,0.78)] text-white">0:40 · 9:16</span>
    </div>
  );
}

function useNow() {
  return useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, []);
}

export default function AiDemo() {
  /* 0 пусто · 1 идея · 2 печатает · 3 сценарий · 4 прогресс · 5 превью · 6 публикует · 7 готово */
  const [stage, setStage] = useState(0);
  const [phase, setPhase] = useState(0);
  const [pct, setPct] = useState(0);
  const [take, setTake] = useState(1);
  const [runId, setRunId] = useState(0);
  const [started, setStarted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const now = useNow();

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          setStarted(true);
          setRunId((r) => r + 1);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  /* таймлайн сценария */
  useEffect(() => {
    if (runId === 0) return;
    clearTimers();
    setStage(0); setPhase(0); setPct(0); setTake(1);
    const k = prefersReduced() ? 0.12 : 1;
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms * k));
    at(400, () => setStage(1));
    at(1500, () => setStage(2));
    at(2400, () => setStage(3));
    at(3900, () => setStage(4));
    return clearTimers;
  }, [runId]);

  /* прогресс генерации */
  useEffect(() => {
    if (stage !== 4) return;
    const phases = phaseSet(take);
    if (prefersReduced()) {
      setPhase(phases.length - 1);
      setPct(100);
      const t = window.setTimeout(() => setStage(5), 350);
      return () => window.clearTimeout(t);
    }
    let cancelled = false;
    const speed = take > 1 ? 0.5 : 1;
    const run = (idx: number) => {
      if (cancelled || idx >= phases.length) return;
      setPhase(idx);
      let cur = 0;
      const iv = window.setInterval(() => {
        cur = Math.min(100, cur + (100 / phases[idx].dur) * 60 + Math.random() * 2);
        setPct(Math.round(cur));
        if (cur >= 100) {
          window.clearInterval(iv);
          if (idx + 1 < phases.length) {
            timers.current.push(window.setTimeout(() => run(idx + 1), 240 * speed));
          } else {
            timers.current.push(window.setTimeout(() => setStage(5), 600));
          }
        }
      }, 60);
      timers.current.push(iv as unknown as number);
    };
    run(0);
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [stage, take]);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReduced() ? "auto" : "smooth" });
  }, [stage, pct]);

  const publish = () => {
    if (stage !== 5) return;
    setStage(6);
    const k = prefersReduced() ? 0.15 : 1;
    timers.current.push(window.setTimeout(() => setStage(7), 1400 * k));
  };

  const retry = () => {
    if (stage !== 5) return;
    setPct(0);
    setPhase(0);
    setTake((t) => t + 1);
    setStage(4);
  };

  return (
    <div className="relative w-full max-w-[400px] mx-auto" data-reveal>
      <div className="absolute -inset-8 rounded-[40px] opacity-60 blur-3xl -z-10"
        style={{ background: "radial-gradient(60% 60% at 60% 30%, rgba(69,212,131,0.2), transparent 70%), radial-gradient(50% 50% at 20% 80%, rgba(42,171,238,0.18), transparent 70%)" }} />

      <div className="relative rounded-[26px] border border-[var(--line)] overflow-hidden shadow-[0_36px_80px_-30px_rgba(2,8,20,0.9)]"
        style={{ background: "linear-gradient(180deg,#101a30,#0d1526)" }}>
        {/* шапка */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line-soft)]" style={{ background: "rgba(16,26,48,0.92)" }}>
          <div className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,#45d483,#1f8f57)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2.5 14.2 8.8l6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3-6.3-2.2 6.3-2.2L12 2.5Z" stroke="#06230f" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="m18.5 16 .8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8.8-1.7Z" fill="#06230f" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[15px] leading-tight truncate">ShortsFlow Bot · AI-режим</p>
            <p className="font-mono text-[11px] text-[var(--ok)]">идея → сценарий → видео → кнопка</p>
          </div>
          <span className="chip !text-[9.5px] !py-[2px] !border-[rgba(69,212,131,0.45)] !text-[var(--ok)]">free</span>
        </div>

        {/* лента */}
        <div ref={boxRef} className="h-[470px] overflow-y-auto px-3.5 py-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
          <div className="flex justify-center">
            <span className="chip !text-[10px]">сегодня</span>
          </div>

          {stage === 0 && (
            <div className="flex justify-center pt-10">
              <p className="font-mono text-[12px] text-[var(--faint)] text-center leading-relaxed">
                AI-сценарий запустится<br />через мгновение…
              </p>
            </div>
          )}

          {/* 1 — идея пользователя */}
          {stage >= 1 && (
            <div className="flex justify-end msg-in">
              <div className="max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2.5 border border-[var(--line-soft)]" style={{ background: "linear-gradient(180deg,#2b527a,#20456a)" }}>
                <p className="text-[14px] leading-snug whitespace-pre-line">{IDEA}</p>
                <div className="flex justify-end items-center gap-1 mt-1">
                  <span className="font-mono text-[10px] text-[rgba(255,255,255,0.6)]">{now}</span>
                  <Checks />
                </div>
              </div>
            </div>
          )}

          {/* 2 — печатает */}
          {stage === 2 && (
            <div className="flex justify-start msg-in">
              <div className="rounded-2xl rounded-bl-md px-4 py-3.5 border border-[var(--line-soft)]" style={{ background: "#16213a" }}>
                <span className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className="typing-dot w-[7px] h-[7px] rounded-full bg-[var(--tg-soft)]" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          )}

          {/* 3+ — сценарий */}
          {stage >= 3 && (
            <div className="flex justify-start msg-in">
              <div className="w-[86%] rounded-2xl rounded-bl-md overflow-hidden border border-[rgba(255,180,84,0.4)]" style={{ background: "#16213a" }}>
                <div className="px-3.5 py-2.5 border-b border-[var(--line-soft)]" style={{ background: "rgba(255,180,84,0.06)" }}>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--amber)]">сценарий готов</p>
                    <span className="chip !text-[9px] !py-[2px] !px-2">Groq · 2,8 c</span>
                  </div>
                  <p className="text-[14.5px] font-bold mt-1 leading-snug">«Кот-космонавт: где мой корабль?!»</p>
                </div>
                <ul className="px-3.5 py-2.5 space-y-1.5">
                  {SCENES.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-[var(--muted)] msg-in" style={{ animationDelay: `${i * 120}ms` }}>
                      <span className="font-mono text-[11px] font-bold text-[var(--amber)] shrink-0 mt-[1px]">{i + 1}.</span>
                      {s}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-1.5 px-3.5 pb-3">
                  <span className="chip !text-[9px] !py-[2px] !px-2">4 сцены</span>
                  <span className="chip !text-[9px] !py-[2px] !px-2">≈ 40 c</span>
                  <span className="chip !text-[9px] !py-[2px] !px-2">JSON schema</span>
                </div>
              </div>
            </div>
          )}

          {/* 4 — прогресс генерации */}
          {stage === 4 && (
            <div className="flex justify-start msg-in">
              <div className="w-[82%] rounded-2xl rounded-bl-md px-3.5 py-3 border border-[var(--line-soft)]" style={{ background: "#16213a" }}>
                <p className="font-mono text-[12px] text-[var(--ink)] mb-2 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok)] pulse-dot" />
                  {phaseSet(take)[phase].label}
                </p>
                <div className="h-[7px] rounded-full bg-[#0c1428] overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-150 ease-linear bar-anim"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg,#45d483,#9df0c0)" }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="font-mono text-[10px] text-[var(--faint)]">{take > 1 ? `пересъёмка · дубль #${take}` : "бесплатный стек · 0 ₽"}</span>
                  <span className="font-mono text-[10px] text-[var(--ok)]">{pct}%</span>
                </div>
              </div>
            </div>
          )}

          {/* 5+ — превью с кнопками */}
          {stage >= 5 && (
            <div className="flex justify-start msg-in">
              <div className="w-[86%] rounded-2xl rounded-bl-md overflow-hidden border border-[var(--line-soft)]" style={{ background: "#16213a" }}>
                <Poster take={take} />
                <div className="px-3.5 py-2.5">
                  <p className="text-[14px] font-semibold leading-snug">Кот-космонавт: где мой корабль?! <span className="text-[#ff8a80]">#Shorts</span></p>
                  <div className="flex items-center gap-2.5 mt-2">
                    <Eq />
                    <span className="font-mono text-[10px] text-[var(--faint)]">превью · 38,4 c · 1080×1920 · дубль #{take}</span>
                  </div>

                  {stage === 5 && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button onClick={publish}
                        className="py-2.5 rounded-xl text-[13px] font-bold text-white transition-all duration-200 cursor-pointer hover:brightness-110 active:scale-[0.97]"
                        style={{ background: "linear-gradient(135deg,#ff4438,#c92a1f)", boxShadow: "0 6px 16px -6px rgba(255,68,56,0.6)" }}>
                        Опубликовать
                      </button>
                      <button onClick={retry}
                        className="py-2.5 rounded-xl text-[13px] font-semibold text-[var(--tg-soft)] border border-[rgba(42,171,238,0.45)] transition-all duration-200 cursor-pointer hover:bg-[rgba(42,171,238,0.1)] active:scale-[0.97]">
                        Ещё дубль
                      </button>
                    </div>
                  )}
                  {stage === 6 && (
                    <div className="flex items-center gap-2.5 mt-3 py-2">
                      <span className="w-4 h-4 rounded-full border-2 border-[rgba(255,68,56,0.3)] border-t-[var(--yt)] animate-spin" aria-hidden />
                      <span className="font-mono text-[12px] text-[var(--muted)]">Публикую на YouTube…</span>
                    </div>
                  )}
                  {stage === 7 && (
                    <p className="font-mono text-[11px] text-[var(--ok)] mt-3 flex items-center gap-1.5">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5 6 12l7.5-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      решение принято вами · youtube.upload
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 7 — успех */}
          {stage === 7 && (
            <div className="flex justify-start msg-in">
              <div className="w-[86%] rounded-2xl rounded-bl-md overflow-hidden border border-[rgba(69,212,131,0.45)]" style={{ background: "#12233c" }}>
                <div className="px-3.5 py-3">
                  <p className="text-[14px] font-semibold text-[var(--ok)]">Shorts опубликован (unlisted)</p>
                  <p className="font-mono text-[12px] text-[#9df0c0] mt-1 break-all">youtube.com/shorts/Me0w9X4</p>
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    <span className="chip !text-[9px] !py-[2px] !px-2 !border-[rgba(255,68,56,0.5)] !text-[#ff9d95]">AI-режим</span>
                    <span className="chip !text-[9px] !py-[2px] !px-2">дубль #{take}</span>
                    <span className="chip !text-[9px] !py-[2px] !px-2">0 ₽ за генерацию</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* нижняя панель */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-t border-[var(--line-soft)]" style={{ background: "rgba(13,21,38,0.95)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          <div className="flex-1 rounded-full border border-[var(--line-soft)] px-3.5 py-2">
            <p className="font-mono text-[12px] text-[var(--faint)] truncate">
              {stage >= 7 ? "новая идея — новый ролик…" : stage >= 5 ? "решение за вами…" : "опишите идею парой строк…"}
            </p>
          </div>
          <button
            onClick={() => setRunId((r) => r + 1)}
            disabled={stage > 0 && stage < 7}
            className="w-10 h-10 rounded-full grid place-items-center shrink-0 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-default hover:scale-110 active:scale-95"
            style={{ background: stage === 7 || stage === 0 ? "var(--ok)" : "#1c2a4a" }}
            title="Повторить демо"
            aria-label="Повторить демо"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={stage === 7 || stage === 0 ? "#06230f" : "#8fa2c2"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* плавающие чипы */}
      <div className="hidden md:flex absolute -left-10 top-16 floaty" style={{ "--rot": "-6deg" } as React.CSSProperties}>
        <span className="chip !text-[var(--amber)] !border-[rgba(255,180,84,0.45)] !bg-[rgba(255,180,84,0.08)] shadow-lg">Groq · сценарий за 3 c</span>
      </div>
      <div className="hidden md:flex absolute -right-8 top-1/3 floaty" style={{ "--rot": "5deg", animationDelay: "1s" } as React.CSSProperties}>
        <span className="chip !text-[var(--ok)] !border-[rgba(69,212,131,0.45)] !bg-[rgba(69,212,131,0.08)] shadow-lg">Pollinations · без ключа</span>
      </div>
      <div className="hidden md:flex absolute -left-7 bottom-20 floaty" style={{ "--rot": "4deg", animationDelay: "1.8s" } as React.CSSProperties}>
        <span className="chip !text-[var(--tg-soft)] !border-[rgba(42,171,238,0.45)] !bg-[rgba(42,171,238,0.08)] shadow-lg">edge-tts · нейроголос</span>
      </div>
    </div>
  );
}

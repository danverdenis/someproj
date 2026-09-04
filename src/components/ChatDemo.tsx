import { useEffect, useMemo, useRef, useState } from "react";
import { prefersReduced } from "../lib/motion";

/* Живая демонстрация: бот получает видео и публикует его в Shorts.
   Сценарий проигрывается при попадании в вьюпорт, есть кнопка повтора. */

const PHASES = [
  { label: "Скачиваю файл · 12,4 МБ", to: 100, dur: 900 },
  { label: "ffmpeg → 9:16 · 1080×1920 · 47 c", to: 100, dur: 1000 },
  { label: "Загружаю на YouTube (resumable)", to: 100, dur: 1700 },
];

function useNow() {
  return useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, []);
}

function Checks() {
  return (
    <svg width="16" height="11" viewBox="0 0 18 12" fill="none" aria-hidden>
      <path d="m1 6.5 3.2 3.2L10.5 3" stroke="#7bc8f0" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m7.5 8.5 1.2 1.2L15 3" stroke="#7bc8f0" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlaneAvatar() {
  return (
    <div className="w-10 h-10 rounded-full grid place-items-center shrink-0"
      style={{ background: "linear-gradient(135deg, #2aabee, #1a7fc4)" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 11.5 21 4l-4.2 16.2c-.2.7-1 .9-1.5.4l-4.1-3.5-2.6 2.5c-.5.5-1.3.2-1.4-.5l-.7-4.4L3 11.5Z" fill="#fff" />
      </svg>
    </div>
  );
}

export default function ChatDemo() {
  /* stage: 0 пусто · 1 видео юзера · 2 бот печатает · 3 «принял» · 4 прогресс · 5 готово */
  const [stage, setStage] = useState(0);
  const [phase, setPhase] = useState(0);
  const [pct, setPct] = useState(0);
  const [runId, setRunId] = useState(0);
  const [started, setStarted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const now = useNow();

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  /* автозапуск при появлении на экране */
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
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  /* таймлайн сценария */
  useEffect(() => {
    if (runId === 0) return;
    clearTimers();
    setStage(0);
    setPhase(0);
    setPct(0);
    const reduced = prefersReduced();
    const k = reduced ? 0.15 : 1;
    const at = (ms: number, fn: () => void) =>
      timers.current.push(window.setTimeout(fn, ms * k));

    at(400, () => setStage(1));
    at(1500, () => setStage(2));
    at(2500, () => setStage(3));
    at(3300, () => setStage(4));
    return clearTimers;
  }, [runId]);

  /* фазы прогресса */
  useEffect(() => {
    if (stage !== 4) return;
    if (prefersReduced()) {
      setPhase(PHASES.length - 1);
      setPct(100);
      const t = window.setTimeout(() => setStage(5), 400);
      return () => window.clearTimeout(t);
    }
    let p = 0;
    let cancelled = false;
    const runPhase = (idx: number) => {
      if (cancelled || idx >= PHASES.length) return;
      setPhase(idx);
      const ph = PHASES[idx];
      const tick = 60;
      const step = (100 / ph.dur) * tick * ph.to / 100;
      let cur = 0;
      const iv = window.setInterval(() => {
        cur = Math.min(100, cur + step + Math.random() * 2);
        setPct(Math.round(cur));
        if (cur >= 100) {
          window.clearInterval(iv);
          if (idx + 1 < PHASES.length) {
            timers.current.push(window.setTimeout(() => runPhase(idx + 1), 260));
          } else {
            timers.current.push(window.setTimeout(() => setStage(5), 650));
          }
        }
      }, tick);
      timers.current.push(iv as unknown as number);
    };
    runPhase(0);
    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [stage]);

  /* автопрокрутка */
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReduced() ? "auto" : "smooth" });
  }, [stage, pct]);

  const replay = () => setRunId((r) => r + 1);

  return (
    <div className="relative w-full max-w-[400px] mx-auto" data-reveal style={{ "--rd": "150ms" } as React.CSSProperties}>
      {/* свечение позади «телефона» */}
      <div className="absolute -inset-8 rounded-[40px] opacity-60 blur-3xl -z-10"
        style={{ background: "radial-gradient(60% 60% at 40% 30%, rgba(42,171,238,0.28), transparent 70%), radial-gradient(50% 50% at 80% 80%, rgba(255,68,56,0.16), transparent 70%)" }} />

      <div className="relative rounded-[26px] border border-[var(--line)] overflow-hidden shadow-[0_36px_80px_-30px_rgba(2,8,20,0.9)]"
        style={{ background: "linear-gradient(180deg,#101a30,#0d1526)" }}>
        {/* шапка чата */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line-soft)]" style={{ background: "rgba(16,26,48,0.92)" }}>
          <PlaneAvatar />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-[15px] leading-tight truncate">ShortsFlow Bot</p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--tg)" aria-label="бот">
                <path d="M12 2a2 2 0 0 1 2 2v1h3a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4h3V4a2 2 0 0 1 2-2Zm-5 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
              </svg>
            </div>
            <p className="font-mono text-[11px] text-[var(--tg-soft)]">@shortsflow_pipe_bot · приватный</p>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--faint)" aria-hidden>
            <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
          </svg>
        </div>

        {/* лента сообщений */}
        <div ref={boxRef} className="h-[430px] overflow-y-auto px-3.5 py-4 space-y-3 scroll-smooth" style={{ scrollbarWidth: "thin" }}>
          <div className="flex justify-center">
            <span className="chip !text-[10px]">сегодня</span>
          </div>

          {stage === 0 && (
            <div className="flex justify-center pt-10">
              <p className="font-mono text-[12px] text-[var(--faint)] text-center leading-relaxed">
                демо-сценарий запустится<br />через мгновение…
              </p>
            </div>
          )}

          {/* 1 — пользователь прислал видео */}
          {stage >= 1 && (
            <div className="flex justify-end msg-in">
              <div className="max-w-[78%] rounded-2xl rounded-br-md overflow-hidden border border-[var(--line-soft)]" style={{ background: "linear-gradient(180deg,#2b527a,#20456a)" }}>
                <div className="relative aspect-[9/14] w-[210px]" style={{ background: "linear-gradient(160deg,#173a5e 0%,#0f2a49 55%,#0b1f38 100%)" }}>
                  <svg className="absolute inset-0 m-auto" width="52" height="52" viewBox="0 0 52 52" fill="none">
                    <circle cx="26" cy="26" r="25" fill="rgba(255,255,255,0.14)" />
                    <circle cx="26" cy="26" r="25" stroke="rgba(255,255,255,0.5)" />
                    <path d="M22 18.5v15l12-7.5-12-7.5Z" fill="#fff" />
                  </svg>
                  <span className="absolute bottom-2 right-2 font-mono text-[11px] px-1.5 py-0.5 rounded bg-[rgba(5,12,24,0.75)] text-white">0:47</span>
                  <span className="absolute top-2 left-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-[rgba(5,12,24,0.75)] text-[#9fd8f7]">MP4 · 12,4 МБ</span>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[14px] leading-snug">гол на 90+4, выложи в shorts</p>
                  <div className="flex justify-end items-center gap-1 mt-0.5">
                    <span className="font-mono text-[10px] text-[rgba(255,255,255,0.6)]">{now}</span>
                    <Checks />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2 — бот печатает */}
          {stage === 2 && (
            <div className="flex justify-start msg-in">
              <div className="rounded-2xl rounded-bl-md px-4 py-3.5 border border-[var(--line-soft)]" style={{ background: "#16213a" }}>
                <div className="flex items-center gap-1.5">
                  <span className="typing-dot w-[7px] h-[7px] rounded-full bg-[var(--tg-soft)] inline-block" />
                  <span className="typing-dot w-[7px] h-[7px] rounded-full bg-[var(--tg-soft)] inline-block" style={{ animationDelay: "0.15s" }} />
                  <span className="typing-dot w-[7px] h-[7px] rounded-full bg-[var(--tg-soft)] inline-block" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            </div>
          )}

          {/* 3+ — ответы бота */}
          {stage >= 3 && (
            <div className="flex justify-start msg-in">
              <div className="max-w-[82%] rounded-2xl rounded-bl-md px-3.5 py-2.5 border border-[var(--line-soft)]" style={{ background: "#16213a" }}>
                <p className="text-[13px] font-bold text-[var(--tg-soft)] mb-0.5">ShortsFlow Bot</p>
                <p className="text-[14px] leading-snug">
                  {stage === 3 ? "Принял видео. Скачиваю файл…" : "Принял видео. Скачиваю файл… ✓"}
                </p>
                <p className="font-mono text-[10px] text-[var(--faint)] text-right mt-1">{now}</p>
              </div>
            </div>
          )}

          {/* 4 — прогресс */}
          {stage === 4 && (
            <div className="flex justify-start msg-in">
              <div className="w-[82%] rounded-2xl rounded-bl-md px-3.5 py-3 border border-[var(--line-soft)]" style={{ background: "#16213a" }}>
                <p className="font-mono text-[12px] text-[var(--ink)] mb-2 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--amber)]" />
                  {PHASES[phase].label}
                </p>
                <div className="h-[7px] rounded-full bg-[#0c1428] overflow-hidden">
                  <div className="h-full rounded-full relative transition-[width] duration-150 ease-linear bar-anim"
                    style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2aabee,#63c4f5)" }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="font-mono text-[10px] text-[var(--faint)]">{phase + 1} / {PHASES.length}</span>
                  <span className="font-mono text-[10px] text-[var(--tg-soft)]">{pct}%</span>
                </div>
              </div>
            </div>
          )}

          {/* 5 — готово: карточка Shorts */}
          {stage >= 5 && (
            <div className="flex justify-start msg-in">
              <div className="w-[84%] rounded-2xl rounded-bl-md overflow-hidden border border-[rgba(255,68,56,0.4)]" style={{ background: "#16213a" }}>
                <div className="relative h-[104px]" style={{ background: "linear-gradient(135deg,#3d0f0d,#1d0a12 60%,#120b1e)" }}>
                  <svg className="absolute inset-0 m-auto" width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <circle cx="22" cy="22" r="21" fill="rgba(255,68,56,0.25)" stroke="#ff4438" strokeWidth="1.5" />
                    <path d="M18 15v14l11-7-11-7Z" fill="#ff6b60" />
                  </svg>
                  <span className="absolute top-2 left-2 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--yt)] text-white tracking-widest">SHORTS</span>
                  <span className="absolute bottom-2 right-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-[rgba(5,12,24,0.8)] text-[#ffb4ae]">0:47 · 9:16</span>
                </div>
                <div className="px-3.5 py-2.5">
                  <p className="text-[14px] font-semibold leading-snug">гол на 90+4 #Shorts</p>
                  <p className="font-mono text-[12px] text-[#ff8a80] mt-0.5 break-all">youtube.com/shorts/Xt9Kq2m</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <span className="chip !text-[9px] !py-[2px] !px-2 !border-[rgba(255,68,56,0.5)] !text-[#ff9d95]">unlisted</span>
                    <span className="chip !text-[9px] !py-[2px] !px-2 !border-[rgba(69,212,131,0.5)] !text-[var(--ok)]">опубликовано ✓</span>
                  </div>
                  <p className="font-mono text-[10px] text-[var(--faint)] text-right mt-2">{now}</p>
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
              {stage >= 5 ? "отправьте ещё одно видео…" : stage > 0 ? "видео обрабатывается…" : "демо-чат · сообщение"}
            </p>
          </div>
          <button
            onClick={replay}
            disabled={stage < 5 && stage !== 0}
            className="w-10 h-10 rounded-full grid place-items-center shrink-0 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-default hover:scale-110 active:scale-95"
            style={{ background: stage >= 5 ? "var(--tg)" : "#1c2a4a" }}
            title="Повторить демо"
            aria-label="Повторить демо"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={stage >= 5 ? "#06131f" : "#8fa2c2"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* плавающие чипы */}
      <div className="hidden md:flex absolute -left-9 top-14 floaty" style={{ "--rot": "-7deg" } as React.CSSProperties}>
        <span className="chip !text-[var(--tg-soft)] !border-[rgba(42,171,238,0.45)] !bg-[rgba(42,171,238,0.1)] shadow-lg">9:16 · вертикаль</span>
      </div>
      <div className="hidden md:flex absolute -right-7 top-1/2 floaty" style={{ "--rot": "5deg", animationDelay: "0.9s" } as React.CSSProperties}>
        <span className="chip !text-[#ff9d95] !border-[rgba(255,68,56,0.45)] !bg-[rgba(255,68,56,0.1)] shadow-lg">≤ 60 c</span>
      </div>
      <div className="hidden md:flex absolute -left-6 bottom-16 floaty" style={{ "--rot": "4deg", animationDelay: "1.7s" } as React.CSSProperties}>
        <span className="chip !text-[var(--amber)] !border-[rgba(255,180,84,0.4)] !bg-[rgba(255,180,84,0.08)] shadow-lg">#Shorts в заголовке</span>
      </div>
    </div>
  );
}

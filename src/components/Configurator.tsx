import { useMemo, useState } from "react";
import { CopyButton, SectionHead, ShieldIcon } from "../lib/motion";

const PRIVACY_OPTS = [
  { v: "private", label: "private — виден только вам" },
  { v: "unlisted", label: "unlisted — по ссылке" },
  { v: "public", label: "public — всем" },
];

const LLM_PRESETS = [
  { id: "groq", label: "Groq · Llama 3.3 70B — бесплатно и быстро", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  { id: "gemini", label: "Gemini 2.0 Flash — free tier AI Studio", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.0-flash" },
  { id: "openrouter", label: "OpenRouter — бесплатные модели", url: "https://openrouter.ai/api/v1/chat/completions", model: "meta-llama/llama-3.3-70b-instruct:free" },
];

const VOICES = [
  "ru-RU-SvetlanaNeural",
  "ru-RU-DmitryNeural",
  "ru-RU-DariyaNeural",
];

export default function Configurator() {
  const [token, setToken] = useState("");
  const [ids, setIds] = useState("");
  const [privacy, setPrivacy] = useState("unlisted");
  const [tags, setTags] = useState("shorts,автопостинг");
  const [maxSec, setMaxSec] = useState(58);

  // AI-режим
  const [aiOn, setAiOn] = useState(true);
  const [preset, setPreset] = useState(LLM_PRESETS[0]);
  const [apiKey, setApiKey] = useState("");
  const [scenes, setScenes] = useState(4);
  const [voice, setVoice] = useState(VOICES[0]);

  const tokenOk = /^\d{6,12}:[\w-]{20,}$/.test(token.trim());
  const idsOk = ids.trim() !== "" && ids.split(",").every((x) => /^\s*\d{5,12}\s*$/.test(x));
  const secClamped = Math.min(180, Math.max(15, maxSec || 58));

  const env = useMemo(() => {
    const lines = [
      "# .env — сгенерировано конфигуратором ShortsFlow",
      `BOT_TOKEN=${token.trim() || "<вставьте_токен_из_BotFather>"}`,
      `ALLOWED_IDS=${ids.trim().replace(/\s+/g, "") || "<ваш_chat_id>"}`,
      `PRIVACY=${privacy}`,
      `DEFAULT_TAGS=${tags.trim() || "shorts"}`,
      `MAX_SECONDS=${secClamped}`,
    ];
    if (aiOn) {
      lines.push(
        "",
        "# --- AI-режим ---",
        `SCRIPT_API_URL=${preset.url}`,
        `SCRIPT_API_KEY=${apiKey.trim() || "<ключ_" + preset.id + ">"}`,
        `SCRIPT_MODEL=${preset.model}`,
        `SCENE_COUNT=${scenes}`,
        `TTS_VOICE=${voice}`,
      );
    }
    return lines.join("\n");
  }, [token, ids, privacy, tags, secClamped, aiOn, preset, apiKey, scenes, voice]);

  return (
    <section id="config" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <SectionHead
          index="05"
          kicker="конфигуратор"
          tone="amber"
          title={<>Соберите свой <span className="text-[var(--amber)]">.env</span> прямо здесь</>}
          lead="Заполните поля — справа мгновенно сложится готовый файл настроек, включая AI-режим. Ничего никуда не отправляется: всё считается в вашем браузере."
        />

        <div className="mt-12 grid lg:grid-cols-2 gap-8 items-start">
          {/* форма */}
          <div className="card p-6 sm:p-7 space-y-5" data-reveal>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="cfg-token" className="font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)]">BOT_TOKEN</label>
                <span className={`font-mono text-[11px] transition-colors duration-300 ${token === "" ? "text-[var(--faint)]" : tokenOk ? "text-[var(--ok)]" : "text-[var(--amber)]"}`}>
                  {token === "" ? "из @BotFather" : tokenOk ? "похоже на настоящий" : "проверьте формат: 123456:ABC…"}
                </span>
              </div>
              <input id="cfg-token" className="input" placeholder="123456789:AAE-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="cfg-ids" className="font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)]">ALLOWED_IDS · whitelist</label>
                <span className={`font-mono text-[11px] transition-colors duration-300 ${ids === "" ? "text-[var(--faint)]" : idsOk ? "text-[var(--ok)]" : "text-[var(--amber)]"}`}>
                  {ids === "" ? "узнайте у @userinfobot" : idsOk ? "id выглядят верно" : "нужны цифры, через запятую"}
                </span>
              </div>
              <input id="cfg-ids" className="input" placeholder="123456789, 987654321"
                value={ids} onChange={(e) => setIds(e.target.value)} autoComplete="off" spellCheck={false} />
              <p className="flex items-center gap-2 text-[12.5px] text-[var(--faint)] mt-2">
                <ShieldIcon size={14} className="text-[var(--ok)] shrink-0" />
                только эти chat_id смогут пользоваться ботом — все остальные получат отказ
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="cfg-privacy" className="block font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)] mb-2">PRIVACY · статус роликов</label>
                <select id="cfg-privacy" className="input cursor-pointer" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                  {PRIVACY_OPTS.map((o) => (
                    <option key={o.v} value={o.v} style={{ background: "#0b1120" }}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cfg-sec" className="block font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)] mb-2">
                  MAX_SECONDS · <span className="text-[var(--tg-soft)]">{secClamped} c</span>
                </label>
                <input id="cfg-sec" type="range" min={15} max={180} step={1} value={secClamped}
                  onChange={(e) => setMaxSec(Number(e.target.value))}
                  className="w-full accent-[var(--tg)] cursor-pointer h-[38px]" />
                <p className="text-[12px] text-[var(--faint)] mt-0.5">всё длиннее бот обрежет · 15–180 c</p>
              </div>
            </div>

            <div>
              <label htmlFor="cfg-tags" className="block font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)] mb-2">DEFAULT_TAGS · через запятую</label>
              <input id="cfg-tags" className="input" placeholder="shorts,автопостинг"
                value={tags} onChange={(e) => setTags(e.target.value)} spellCheck={false} />
            </div>

            {/* AI-режим */}
            <div className="rounded-xl border p-4 sm:p-5 transition-colors duration-300"
              style={{ borderColor: aiOn ? "rgba(69,212,131,0.4)" : "var(--line-soft)", background: aiOn ? "rgba(69,212,131,0.04)" : "transparent" }}>
              <button type="button" onClick={() => setAiOn((v) => !v)} className="w-full flex items-center justify-between gap-3 cursor-pointer group" aria-pressed={aiOn}>
                <span className="text-left">
                  <span className="flex items-center gap-2 text-[15px] font-bold">
                    AI-режим
                    <span className="chip !text-[9px] !py-[2px] !border-[rgba(69,212,131,0.45)] !text-[var(--ok)]">опционально</span>
                  </span>
                  <span className="block text-[12.5px] text-[var(--faint)] mt-0.5">идея → сценарий → кадры и озвучка → превью</span>
                </span>
                <span className={`relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0 ${aiOn ? "bg-[var(--ok)]" : "bg-[#233252] group-hover:bg-[#2b3d63]"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-300 ${aiOn ? "left-[22px]" : "left-0.5"}`} />
                </span>
              </button>

              {aiOn && (
                <div className="space-y-4 mt-4 swap-in">
                  <div>
                    <label htmlFor="cfg-llm" className="block font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)] mb-2">LLM для сценариев</label>
                    <select id="cfg-llm" className="input cursor-pointer" value={preset.id}
                      onChange={(e) => setPreset(LLM_PRESETS.find((p) => p.id === e.target.value) ?? LLM_PRESETS[0])}>
                      {LLM_PRESETS.map((p) => (
                        <option key={p.id} value={p.id} style={{ background: "#0b1120" }}>{p.label}</option>
                      ))}
                    </select>
                    <p className="font-mono text-[11px] text-[var(--faint)] mt-1.5 break-all">URL: {preset.url}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="cfg-key" className="font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)]">SCRIPT_API_KEY</label>
                      <span className={`font-mono text-[11px] ${apiKey ? "text-[var(--ok)]" : "text-[var(--faint)]"}`}>
                        {apiKey ? "ключ на месте" : `бесплатно · console.${preset.id === "openrouter" ? "openrouter.ai" : preset.id === "gemini" ? "google.com/aistudio" : "groq.com"}`}
                      </span>
                    </div>
                    <input id="cfg-key" className="input" placeholder={preset.id === "groq" ? "gsk_xxxxxxxxxxxxxxxx" : "AIza… / sk-or-…"}
                      value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="cfg-scenes" className="block font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)] mb-2">
                        SCENE_COUNT · <span className="text-[var(--ok)]">{scenes} сцены</span>
                      </label>
                      <input id="cfg-scenes" type="range" min={3} max={6} step={1} value={scenes}
                        onChange={(e) => setScenes(Number(e.target.value))}
                        className="w-full accent-[var(--ok)] cursor-pointer h-[38px]" />
                      <p className="text-[12px] text-[var(--faint)] mt-0.5">каждая ~10 c → ролик ≈ {scenes * 10} c</p>
                    </div>
                    <div>
                      <label htmlFor="cfg-voice" className="block font-mono text-[12px] tracking-[0.12em] uppercase text-[var(--muted)] mb-2">TTS_VOICE · edge-tts</label>
                      <select id="cfg-voice" className="input cursor-pointer" value={voice} onChange={(e) => setVoice(e.target.value)}>
                        {VOICES.map((v) => (
                          <option key={v} value={v} style={{ background: "#0b1120" }}>{v.replace("ru-RU-", "").replace("Neural", "")}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* живой предпросмотр */}
          <div className="lg:sticky lg:top-28" data-reveal style={{ "--rd": "120ms" } as React.CSSProperties}>
            <div className="flex items-center justify-between px-4 py-3 rounded-t-[13px] border border-b-0 border-[var(--line-soft)]" style={{ background: "#0e1730" }}>
              <div className="flex items-center gap-2.5">
                <span className="flex gap-1.5" aria-hidden>
                  <i className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                  <i className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                  <i className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                </span>
                <span className="font-mono text-[12px] text-[var(--muted)]">/opt/shortsflow/.env — live</span>
              </div>
              <CopyButton text={env} />
            </div>
            <pre className="codebox !rounded-t-none p-5 m-0 min-h-[300px] whitespace-pre-wrap">
              {env.split("\n").map((l, i) => (
                <span key={i} className="block min-h-[1.2em]">
                  {l === "" ? "\u00A0" : l.startsWith("#") ? (
                    <span className={l.includes("AI-режим") ? "text-[var(--ok)]" : "text-[#54688f]"}>{l}</span>
                  ) : (
                    <>
                      <span className={l.startsWith("SCRIPT") || l.startsWith("SCENE") || l.startsWith("TTS") ? "text-[var(--ok)]" : "text-[var(--tg-soft)]"}>
                        {l.split("=")[0]}
                      </span>
                      <span className="text-[#54688f]">=</span>
                      <span className="text-[#ffd591]">{l.split("=").slice(1).join("=")}</span>
                    </>
                  )}
                </span>
              ))}
            </pre>
            <p className="font-mono text-[11.5px] text-[var(--faint)] mt-3 leading-relaxed">
              совет: положите .env рядом с main.py и добавьте в .gitignore —<br className="hidden sm:block" />
              токен бота и ключ LLM дают контроль над вашими аккаунтами.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

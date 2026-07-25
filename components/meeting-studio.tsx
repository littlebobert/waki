"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  LayoutDashboard,
  Mic2,
  Play,
  RotateCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { Artifact, sampleArtifact, sampleTranscript } from "@/lib/artifact";

type GenerationMode = "live" | "demo" | "fallback";
type Locale = "en" | "ja";

const copy = {
  en: {
    home: "Waki home",
    meeting: "Product beta sync",
    room: "4 in room",
    profile: "Open profile",
    canvas: "Meeting canvas",
    headline: "Ideas, made present.",
    intro: "Waki listens from the side, then quietly turns the room's intent into something everyone can use.",
    reset: "Reset demo",
    generating: "Shaping the room…",
    build: "Build from conversation",
    source: "Source",
    conversation: "Conversation",
    listening: "Listening",
    screenReady: "Screen context ready",
    screenHelp: "Connect Attendee to add shared frames here.",
    transcript: "Live transcript",
    elapsed: "14:32 elapsed",
    characters: "characters",
    madeThis: "Waki made this",
    aiGenerated: "AI generated",
    safeFallback: "Safe fallback",
    demoMode: "Demo mode",
    artifact: "Live artifact",
    open: "Open",
    readiness: "Launch readiness",
    nextMoves: "Next moves",
    done: "done",
    decisions: "Decisions",
    watch: "Watch closely",
    constraints: "Product constraints",
    acceptance: "Acceptance checks",
    verifiedBy: "Verify with",
    finding: "Finding the shape in your conversation",
    extracting: "Pass 1: grounding evidence · Pass 2: shaping AppSpec…",
    footer: "Waki sits beside the conversation, never in front of it.",
    locale: "Interface language",
    requestError: "Could not shape this meeting yet.",
    genericError: "Something went wrong.",
  },
  ja: {
    home: "Waki ホーム",
    meeting: "プロダクトβ版 定例",
    room: "4人が参加中",
    profile: "プロフィールを開く",
    canvas: "ミーティングキャンバス",
    headline: "アイデアを、かたちに。",
    intro: "Wakiは会話のそばで耳を傾け、みんなの想いを静かに使えるかたちへ変えていきます。",
    reset: "デモをリセット",
    generating: "会話をかたちにしています…",
    build: "会話からつくる",
    source: "ソース",
    conversation: "会話",
    listening: "聞き取り中",
    screenReady: "画面共有の準備完了",
    screenHelp: "Attendeeを接続すると共有画面を追加できます。",
    transcript: "リアルタイム文字起こし",
    elapsed: "経過時間 14:32",
    characters: "文字",
    madeThis: "Wakiがつくりました",
    aiGenerated: "AIで生成",
    safeFallback: "セーフモード",
    demoMode: "デモモード",
    artifact: "ライブ成果物",
    open: "開く",
    readiness: "ローンチ準備度",
    nextMoves: "次にやること",
    done: "完了",
    decisions: "決定事項",
    watch: "要注意",
    constraints: "プロダクト制約",
    acceptance: "受け入れ基準",
    verifiedBy: "検証方法",
    finding: "会話の中からかたちを見つけています",
    extracting: "パス1：根拠を整理 · パス2：AppSpecを生成…",
    footer: "Wakiは会話の前ではなく、そばにいます。",
    locale: "表示言語",
    requestError: "この会話をまだうまくかたちにできませんでした。",
    genericError: "問題が発生しました。",
  },
} as const;

export function MeetingStudio() {
  const [locale, setLocale] = useState<Locale>("en");
  const [transcript, setTranscript] = useState(sampleTranscript);
  const [artifact, setArtifact] = useState<Artifact>(sampleArtifact);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<GenerationMode>("demo");
  const [error, setError] = useState("");
  const t = copy[locale];

  useEffect(() => {
    const savedLocale = window.localStorage.getItem("waki-locale");
    const deviceLocale = navigator.languages.some((language) => language.toLowerCase().startsWith("ja")) ? "ja" : "en";
    const initialLocale = savedLocale === "ja" || savedLocale === "en" ? savedLocale : deviceLocale;
    document.documentElement.lang = initialLocale;
    queueMicrotask(() => setLocale(initialLocale));
  }, []);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    window.localStorage.setItem("waki-locale", nextLocale);
  }

  async function generate() {
    setIsGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.requestError);
      setArtifact(data.artifact);
      setMode(data.mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.genericError);
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleAction(id: string) {
    setArtifact((current) => ({
      ...current,
      actions: current.actions.map((action) =>
        action.id === id ? { ...action, done: !action.done } : action,
      ),
    }));
  }

  const completed = useMemo(
    () => artifact.actions.filter((action) => action.done).length,
    [artifact.actions],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label={t.home}>
          <span className="brand-mark">脇</span>
          <span>Waki</span>
        </a>
        <div className="meeting-status">
          <span className="live-dot" />
          {t.meeting}
          <span className="status-divider" />
          <Users size={14} /> {t.room}
        </div>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t.locale}>
            <button className={locale === "en" ? "active" : ""} onClick={() => changeLocale("en")} aria-pressed={locale === "en"}>EN</button>
            <button className={locale === "ja" ? "active" : ""} onClick={() => changeLocale("ja")} aria-pressed={locale === "ja"}>日本語</button>
          </div>
          <button className="avatar" aria-label={t.profile}>JM</button>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> {t.canvas}</div>
          <h1>{t.headline}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" onClick={() => setTranscript(sampleTranscript)}>
            <RotateCcw size={16} /> {t.reset}
          </button>
          <button className="primary-button" onClick={generate} disabled={isGenerating}>
            {isGenerating ? <span className="spinner" /> : <Play size={16} fill="currentColor" />}
            {isGenerating ? t.generating : t.build}
          </button>
        </div>
      </section>

      <section className="studio-grid">
        <aside className="conversation-panel panel">
          <div className="panel-header">
            <div>
              <span className="section-label">{t.source}</span>
              <h2>{t.conversation}</h2>
            </div>
            <div className="listening-pill"><Mic2 size={13} /> {t.listening}</div>
          </div>

          <div className="capture-note">
            <span className="capture-icon"><LayoutDashboard size={16} /></span>
            <div><strong>{t.screenReady}</strong><span>{t.screenHelp}</span></div>
            <ChevronRight size={16} />
          </div>

          <label className="transcript-label" htmlFor="transcript">{t.transcript}</label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            spellCheck={false}
          />
          <div className="transcript-footer">
            <span><Clock3 size={13} /> {t.elapsed}</span>
            <span>{transcript.length.toLocaleString(locale === "ja" ? "ja-JP" : "en-US")} {t.characters}</span>
          </div>
          {error && <p className="error-message">{error}</p>}
        </aside>

        <section className={`artifact-panel panel ${isGenerating ? "is-generating" : ""}`}>
          <div className="artifact-topline">
            <div className="artifact-badge"><span>脇</span> {t.madeThis}</div>
            <div className="mode-badge">{mode === "live" ? t.aiGenerated : mode === "fallback" ? t.safeFallback : t.demoMode}</div>
          </div>

          <div className="artifact-heading">
            <div>
              <span className="section-label">{t.artifact}</span>
              <h2>{artifact.title}</h2>
              <p>{artifact.subtitle}</p>
            </div>
            <button className="open-button">{t.open} <ArrowUpRight size={15} /></button>
          </div>

          <div className="summary-card">
            <p>{artifact.summary}</p>
            <div className="progress-row">
              <span>{t.readiness}</span><strong>{artifact.progress}%</strong>
            </div>
            <div className="progress-track"><span style={{ width: `${artifact.progress}%` }} /></div>
          </div>

          <div className="metrics-grid">
            {artifact.metrics.map((metric) => (
              <div className="metric-card" key={metric.label}>
                <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
              </div>
            ))}
          </div>

          <div className="artifact-columns">
            <div>
              <div className="subsection-heading">
                <h3>{t.nextMoves}</h3><span>{completed}/{artifact.actions.length} {t.done}</span>
              </div>
              <div className="action-list">
                {artifact.actions.map((action) => (
                  <button className={`action-item ${action.done ? "done" : ""}`} key={action.id} onClick={() => toggleAction(action.id)}>
                    <span className="check-circle">{action.done ? <Check size={14} /> : <Circle size={15} />}</span>
                    <span className="action-copy"><strong>{action.title}</strong><small>{action.owner} · {action.due}</small></span>
                  </button>
                ))}
              </div>

              <div className="spec-section">
                <div className="subsection-heading"><h3>{t.acceptance}</h3></div>
                <div className="acceptance-list">
                  {artifact.acceptanceCriteria.map((item) => (
                    <div className="acceptance-item" key={item.id}>
                      <Check size={13} />
                      <span>{item.criterion}</span>
                      <small>{t.verifiedBy} {item.verification}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="insight-column">
              <div className="subsection-heading"><h3>{t.decisions}</h3></div>
              {artifact.decisions.map((decision, index) => (
                <div className="decision" key={`${decision.title}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{decision.title}</strong><p>{decision.detail}</p></div>
                </div>
              ))}
              {artifact.risks.length > 0 && (
                <div className="risk-card">
                  <span>{t.watch}</span>
                  {artifact.risks.map((risk) => <p key={risk}>{risk}</p>)}
                </div>
              )}
              {artifact.constraints.length > 0 && (
                <div className="constraint-card">
                  <span>{t.constraints}</span>
                  {artifact.constraints.map((constraint) => <p key={constraint}>{constraint}</p>)}
                </div>
              )}
            </div>
          </div>

          {isGenerating && (
            <div className="generation-overlay">
              <span className="waki-pulse">脇</span>
              <strong>{t.finding}</strong>
              <p>{t.extracting}</p>
            </div>
          )}
        </section>
      </section>

      <footer><span>{t.footer}</span><span>Prototype · Tokyo · 2026</span></footer>
    </main>
  );
}

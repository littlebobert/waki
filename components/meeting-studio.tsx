"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  LayoutDashboard,
  Link2,
  Mic2,
  Play,
  RotateCcw,
  Sparkles,
  Users,
} from "lucide-react";
import { Artifact, sampleArtifact, sampleTranscript } from "@/lib/artifact";

type GenerationMode = "live" | "demo" | "fallback";
type Locale = "en" | "ja";
type LiveSession = {
  session: { botState: string; errorMessage: string | null };
  transcript: string;
  terminal: boolean;
};

type Region = "All" | "EMEA" | "NA" | "APAC" | "LATAM";

const salesRows = [
  { region: "EMEA" as const, april: 412300, may: 398110, june: 451900, conversion: 3.1 },
  { region: "NA" as const, april: 688020, may: 702450, june: 731200, conversion: 4.2 },
  { region: "APAC" as const, april: 301540, may: 355890, june: 340760, conversion: 2.7 },
  { region: "LATAM" as const, april: 98700, may: 121300, june: 134050, conversion: 2.2 },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

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
    joinTitle: "Bring Waki into the meeting",
    meetingUrl: "Google Meet, Zoom, or Teams URL",
    join: "Join with Waki",
    joining: "Joining meeting…",
    botState: "Bot state",
    waitingTranscript: "Waki joined. Waiting for someone to speak…",
    joinError: "Could not join this meeting.",
    screenReady: "Screen context ready",
    screenHelp: "Attendee is connected for live transcript capture.",
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
    joinTitle: "Wakiをミーティングに参加させる",
    meetingUrl: "Google Meet、Zoom、TeamsのURL",
    join: "Wakiを参加させる",
    joining: "ミーティングに参加中…",
    botState: "ボットの状態",
    waitingTranscript: "Wakiが参加しました。発言を待っています…",
    joinError: "このミーティングに参加できませんでした。",
    screenReady: "画面共有の準備完了",
    screenHelp: "Attendeeでリアルタイム文字起こしを取得中です。",
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
  const [meetingUrl, setMeetingUrl] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [botState, setBotState] = useState("idle");
  const [isJoining, setIsJoining] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region>("All");
  const [period, setPeriod] = useState<"Monthly" | "Weekly">("Monthly");
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

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function refreshSession() {
      try {
        const response = await fetch(`/api/attendee/sessions/${sessionId}`, { cache: "no-store" });
        const data = await response.json() as LiveSession & { error?: string };
        if (!response.ok) throw new Error(data.error || t.joinError);
        if (stopped) return;
        setBotState(data.session.botState);
        if (data.transcript) setTranscript(data.transcript);
        if (data.session.errorMessage) setError(data.session.errorMessage);
        if (!data.terminal) timer = setTimeout(refreshSession, 2000);
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : t.genericError);
      }
    }

    refreshSession();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sessionId, t.genericError, t.joinError]);

  async function joinMeeting() {
    setIsJoining(true);
    setError("");
    try {
      const response = await fetch("/api/attendee/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.joinError);
      setTranscript("");
      setSessionId(data.sessionId);
      setBotState(data.state || "joining");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.joinError);
    } finally {
      setIsJoining(false);
    }
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

  function resetDemo() {
    setTranscript(sampleTranscript);
    setMeetingUrl("");
    setSessionId(null);
    setBotState("idle");
    setSelectedRegion("All");
    setPeriod("Monthly");
    setError("");
  }

  const visibleSales = selectedRegion === "All"
    ? salesRows
    : salesRows.filter((row) => row.region === selectedRegion);

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
          <button className="secondary-button" onClick={resetDemo}>
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

          <div className="meeting-join-card">
            <label htmlFor="meeting-url">{t.joinTitle}</label>
            <div className="meeting-url-row">
              <span><Link2 size={15} /></span>
              <input
                id="meeting-url"
                type="url"
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
                placeholder={t.meetingUrl}
                disabled={isJoining}
              />
              <button onClick={joinMeeting} disabled={isJoining || !meetingUrl.trim()}>
                {isJoining ? <span className="spinner" /> : <Mic2 size={14} />}
                {isJoining ? t.joining : t.join}
              </button>
            </div>
            {sessionId && <small><span className="live-dot" /> {t.botState}: {botState.replaceAll("_", " ")}</small>}
          </div>

          <div className="screen-source">
            <div className="screen-source-head">
              <span className="capture-icon"><LayoutDashboard size={16} /></span>
              <div><strong>regional_sales_q3.xlsx</strong><span>Priya&apos;s screen · live sheet</span></div>
              <span className="screen-live"><span className="live-dot" /> Screen</span>
            </div>
            <div className="sheet-grid" aria-label="Raw regional sales spreadsheet">
              <div className="sheet-row sheet-header"><span>Region</span><span>Apr</span><span>May</span><span>Jun</span><span>Conv %</span></div>
              {salesRows.map((row) => (
                <div className={`sheet-row ${row.region === "APAC" ? "sheet-flagged" : ""}`} key={row.region}>
                  <strong>{row.region}</strong><span>{money.format(row.april)}</span><span>{money.format(row.may)}</span><span>{money.format(row.june)}</span><span>{row.conversion}</span>
                </div>
              ))}
            </div>
            <div className="screen-caption"><span>{t.screenReady}</span><small>{t.screenHelp}</small><ChevronRight size={14} /></div>
          </div>

          <label className="transcript-label" htmlFor="transcript">{t.transcript}</label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder={sessionId ? t.waitingTranscript : undefined}
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

          <div className="dashboard-controls" aria-label="Revenue dashboard controls">
            <div className="region-filters">
              {(["All", "EMEA", "NA", "APAC", "LATAM"] as Region[]).map((region) => (
                <button key={region} className={selectedRegion === region ? "active" : ""} onClick={() => setSelectedRegion(region)}>{region}</button>
              ))}
            </div>
            <div className="period-toggle">
              {(["Monthly", "Weekly"] as const).map((value) => (
                <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{value}</button>
              ))}
            </div>
          </div>

          <div className="metrics-grid">
            {artifact.metrics.map((metric) => (
              <div className="metric-card" key={metric.label}>
                <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
              </div>
            ))}
          </div>

          <div className="revenue-chart-card">
            <div className="chart-heading"><strong>{selectedRegion === "All" ? "All regions" : selectedRegion} · {period.toLowerCase()} revenue</strong><span>Connected to source sheet</span></div>
            <div className="revenue-chart">
              {visibleSales.map((row) => (
                <div className="chart-group" key={row.region}>
                  <div className="bar-stack">
                    <span style={{ height: `${Math.max(18, row.april / 8000)}px` }} />
                    <span style={{ height: `${Math.max(18, row.may / 8000)}px` }} />
                    <span className={row.region === "APAC" ? "alert" : ""} style={{ height: `${Math.max(18, row.june / 8000)}px` }} />
                  </div>
                  <small>{row.region}{row.region === "APAC" ? " ↘" : ""}</small>
                </div>
              ))}
            </div>
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

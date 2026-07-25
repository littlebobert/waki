"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Link2,
  Mic2,
  Sparkles,
} from "lucide-react";
import { sampleArtifact, sampleTranscript } from "@/lib/artifact";

type Locale = "en" | "ja";
type LiveSession = {
  session: { botState: string; errorMessage: string | null };
  transcript: string;
  terminal: boolean;
};
type LiveBuild = {
  id: string;
  status: string;
  stage: string;
  percent: number;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  error: string | null;
};

type Region = "All" | "EMEA" | "NA" | "APAC" | "LATAM";

const salesRows = [
  { region: "EMEA" as const, months: [356200, 382400, 391800, 412300, 398110, 451900], conversion: 3.1 },
  { region: "NA" as const, months: [601500, 624800, 655200, 688020, 702450, 731200], conversion: 4.2 },
  { region: "APAC" as const, months: [272100, 285900, 294600, 301540, 355890, 340760], conversion: 2.7 },
  { region: "LATAM" as const, months: [82100, 88600, 94200, 98700, 121300, 134050], conversion: 2.2 },
];

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const copy = {
  en: {
    home: "Waki home",
    canvas: "Meeting canvas",
    headline: "Ideas, made present.",
    intro: "Waki listens from the side, then quietly turns the room's intent into something everyone can use.",
    conversation: "Example meeting",
    listening: "Sample",
    exampleTitle: "Example meeting",
    viewDashboard: "View the dashboard Waki made",
    joinTitle: "Try it with your meeting",
    meetingUrl: "Google Meet URL",
    join: "Join with Waki",
    joining: "Joining meeting…",
    botState: "Bot state",
    waitingTranscript: "Waki joined. Waiting for someone to speak…",
    joinError: "Could not join this meeting.",
    build: "Build this app",
    building: "Building your app…",
    openApp: "Open app",
    retryBuild: "Try build again",
    previewExpires: "Preview expires",
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
    genericError: "Something went wrong.",
  },
  ja: {
    home: "Waki ホーム",
    canvas: "ミーティングキャンバス",
    headline: "アイデアを、かたちに。",
    intro: "Wakiは会話のそばで耳を傾け、みんなの想いを静かに使えるかたちへ変えていきます。",
    conversation: "ミーティング例",
    listening: "サンプル",
    exampleTitle: "ミーティング例",
    viewDashboard: "Wakiが作ったダッシュボードを見る",
    joinTitle: "自分のミーティングで試す",
    meetingUrl: "Google MeetのURL",
    join: "Wakiを参加させる",
    joining: "ミーティングに参加中…",
    botState: "ボットの状態",
    waitingTranscript: "Wakiが参加しました。発言を待っています…",
    joinError: "このミーティングに参加できませんでした。",
    build: "このアプリを作る",
    building: "アプリを作成中…",
    openApp: "アプリを開く",
    retryBuild: "もう一度試す",
    previewExpires: "プレビュー期限",
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
    genericError: "問題が発生しました。",
  },
} as const;

export function MeetingStudio() {
  const [locale, setLocale] = useState<Locale>("en");
  const [transcript, setTranscript] = useState(sampleTranscript);
  const artifact = sampleArtifact;
  const [error, setError] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [botState, setBotState] = useState("idle");
  const [isJoining, setIsJoining] = useState(false);
  const [build, setBuild] = useState<LiveBuild | null>(null);
  const [isStartingBuild, setIsStartingBuild] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region>("All");
  const [period, setPeriod] = useState<"Monthly" | "Weekly">("Monthly");
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
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

  useEffect(() => {
    if (!build || build.status === "PREVIEW_READY" || build.status === "FAILED") return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/builds/${build.id}`, { cache: "no-store" });
        const data = await response.json() as { build?: LiveBuild; error?: string };
        if (!response.ok || !data.build) throw new Error(data.error || t.genericError);
        setBuild(data.build);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : t.genericError);
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [build, t.genericError]);

  async function startBuild() {
    if (!sessionId) return;
    setIsStartingBuild(true);
    setError("");
    try {
      const response = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json() as { build?: LiveBuild; error?: string };
      if (!response.ok || !data.build) throw new Error(data.error || t.genericError);
      setBuild(data.build);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.genericError);
    } finally {
      setIsStartingBuild(false);
    }
  }

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
      setBuild(null);
      setSessionId(data.sessionId);
      setBotState(data.state || "joining");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.joinError);
    } finally {
      setIsJoining(false);
    }
  }

  const visibleSales = selectedRegion === "All"
    ? salesRows
    : salesRows.filter((row) => row.region === selectedRegion);
  const monthlyRevenue = monthLabels.map((_, index) =>
    visibleSales.reduce((total, row) => total + row.months[index], 0),
  );
  const peakRevenue = Math.max(...monthlyRevenue);
  const trendPoints = monthlyRevenue
    .map((value, index) => `${index * 20},${36 - (value / peakRevenue) * 30}`)
    .join(" ");
  const latestRevenue = visibleSales.reduce((total, row) => total + row.months.at(-1)!, 0);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label={t.home}>
          <span className="brand-mark">脇</span>
          <span>Waki</span>
        </a>
        <div />
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t.locale}>
            <button className={locale === "en" ? "active" : ""} onClick={() => changeLocale("en")} aria-pressed={locale === "en"}>EN</button>
            <button className={locale === "ja" ? "active" : ""} onClick={() => changeLocale("ja")} aria-pressed={locale === "ja"}>日本語</button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> {t.canvas}</div>
          <h1>{t.headline}</h1>
          <p>{t.intro}</p>
        </div>
      </section>

      <section className="live-meeting-section" aria-labelledby="live-meeting-title">
        <div className="meeting-join-card">
          <div className="meeting-join-heading">
            <h2 id="live-meeting-title">{t.joinTitle}</h2>
          </div>
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
          {sessionId && transcript.trim() && (
            <div className="live-build-card">
              {!build && <button onClick={startBuild} disabled={isStartingBuild}>{isStartingBuild ? t.building : t.build} <ArrowRight size={14} /></button>}
              {build && build.status !== "PREVIEW_READY" && build.status !== "FAILED" && (
                <div className="build-progress">
                  <div><strong>{build.stage || t.building}</strong><span>{build.percent}%</span></div>
                  <progress max="100" value={build.percent} />
                </div>
              )}
              {build?.status === "PREVIEW_READY" && build.previewUrl && (
                <div className="preview-ready">
                  <a href={build.previewUrl} target="_blank" rel="noopener noreferrer">{t.openApp} <ArrowRight size={14} /></a>
                  {build.previewExpiresAt && <small>{t.previewExpires}: {new Date(build.previewExpiresAt).toLocaleString()}</small>}
                </div>
              )}
              {build?.status === "FAILED" && (
                <div className="build-failed"><span>{build.error || t.genericError}</span><button onClick={() => { setBuild(null); void startBuild(); }}>{t.retryBuild}</button></div>
              )}
            </div>
          )}
          {error && <p className="error-message">{error}</p>}
        </div>
      </section>

      <div className="example-divider"><span>{t.exampleTitle}</span></div>

      <section className={`studio-grid ${isDashboardOpen ? "dashboard-open" : "dashboard-closed"}`}>
        <aside className="conversation-panel panel">
          <div className="panel-header">
            <div>
              <h2>{t.conversation}</h2>
            </div>
            <div className="listening-pill"><Mic2 size={13} /> {t.listening}</div>
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
                  <strong>{row.region}</strong><span>{money.format(row.months[3])}</span><span>{money.format(row.months[4])}</span><span>{money.format(row.months[5])}</span><span>{row.conversion}</span>
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
          {!isDashboardOpen && (
            <button className="reveal-dashboard-button" onClick={() => setIsDashboardOpen(true)}>
              {t.viewDashboard} <ArrowRight size={15} />
            </button>
          )}
        </aside>

        {isDashboardOpen && <section className="artifact-panel panel">
          <div className="artifact-topline">
            <div className="artifact-badge"><span>脇</span> {t.madeThis}</div>
            <div className="mode-badge">{t.demoMode}</div>
          </div>

          <div className="artifact-heading">
            <div>
              <span className="section-label">{t.artifact}</span>
              <h2>{artifact.title}</h2>
              <p>{artifact.subtitle}</p>
            </div>
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
            <div className="chart-heading"><strong>{selectedRegion === "All" ? "All regions" : selectedRegion} · {period.toLowerCase()} revenue</strong><span>Jan–Jun · connected to source sheet</span></div>
            <div className={`revenue-chart ${visibleSales.length === 1 ? "single-region" : ""}`}>
              {visibleSales.map((row) => (
                <div className="chart-group" key={row.region}>
                  <div className="bar-stack">
                    {row.months.map((value, index) => (
                      <span
                        className={row.region === "APAC" && index === row.months.length - 1 ? "alert" : ""}
                        style={{ height: `${Math.max(18, value / 8000)}px` }}
                        key={`${row.region}-${monthLabels[index]}`}
                        title={`${row.region} ${monthLabels[index]}: ${money.format(value)}`}
                      />
                    ))}
                  </div>
                  <small>{row.region}{row.region === "APAC" ? " ↘" : ""}</small>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              {monthLabels.map((month, index) => <span key={month}><i style={{ opacity: .42 + index * .1 }} />{month}</span>)}
            </div>
          </div>

          <div className="dashboard-detail-grid">
            <div className="trend-card">
              <div className="detail-heading"><span>Revenue trend</span><strong>{money.format(latestRevenue)}</strong></div>
              <svg className="trend-line" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Six month revenue trend">
                <defs>
                  <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#52634d" stopOpacity=".2" />
                    <stop offset="100%" stopColor="#52634d" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,40 ${trendPoints} 100,40`} fill="url(#trend-fill)" />
                <polyline points={trendPoints} fill="none" stroke="#52634d" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                {monthlyRevenue.map((value, index) => {
                  const x = index * 20;
                  const y = 36 - (value / peakRevenue) * 30;
                  return <line key={monthLabels[index]} x1={x} x2={x} y1={y} y2={y} stroke="#52634d" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
                })}
              </svg>
              <div className="trend-labels">{monthLabels.map((month) => <span key={month}>{month}</span>)}</div>
            </div>

            <div className="mix-card">
              <div className="detail-heading"><span>Regional mix · Jun</span><strong>100%</strong></div>
              <div className="mix-list">
                {visibleSales.map((row) => {
                  const share = row.months.at(-1)! / latestRevenue * 100;
                  return <div className="mix-row" key={row.region}>
                    <span>{row.region}</span><div><i style={{ width: `${share}%` }} /></div><strong>{share.toFixed(0)}%</strong>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </section>}
      </section>

      <footer><span>{t.footer}</span><span>Prototype · Tokyo · 2026</span></footer>
    </main>
  );
}

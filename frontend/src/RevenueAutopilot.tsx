import { useCallback, useEffect, useMemo, useState } from "react";
import "./RevenueAutopilot.css";

type RevenueEvent = {
  event_id: string;
  payment_id?: string | null;
  source: "checkout" | "subscription" | "invoice" | string;
  event_type: string;
  customer: string;
  amount: number;
  status: "at_risk" | "recovered" | "completed" | string;
  recoverable: boolean;
  description: string;
  created_at?: string;
  updated_at?: string;
};

type AutopilotState = {
  expected_revenue: number;
  revenue_at_risk: number;
  recoverable_revenue: number;
  recovered_revenue: number;
  events: RevenueEvent[];
  updated_at?: string;
};

type ScenarioKey =
  | "payment_failure_spike"
  | "renewal_day"
  | "checkout_dropoff"
  | "revenue_shock";

type PlanAction = {
  action_id: string;
  event_id: string;
  title: string;
  action: string;
  reason: string;
  amount: number;
};

type ActionStatus = "queued" | "working" | "done";
type Stage = "detect" | "analyze" | "decide" | "act" | "recover" | "complete";

const API_URL = "http://127.0.0.1:5000";

const scenarios: Array<{
  key: ScenarioKey;
  label: string;
  kicker: string;
  description: string;
  icon: string;
}> = [
  {
    key: "payment_failure_spike",
    label: "Payment failure spike",
    kicker: "CHECKOUT",
    description: "A sudden wave of failed payments hits high-intent customers.",
    icon: "↯",
  },
  {
    key: "renewal_day",
    label: "Renewal day",
    kicker: "SUBSCRIPTIONS",
    description: "Recurring renewals start failing across the merchant base.",
    icon: "↻",
  },
  {
    key: "checkout_dropoff",
    label: "Checkout drop-off",
    kicker: "CONVERSION",
    description: "High-value shoppers abandon checkout before paying.",
    icon: "◇",
  },
  {
    key: "revenue_shock",
    label: "Revenue shock",
    kicker: "CHAOS MODE",
    description: "Checkout, subscription and invoice risk arrive together.",
    icon: "✦",
  },
];

const stageMeta: Array<{ key: Stage; label: string; sub: string }> = [
  { key: "detect", label: "Detect", sub: "Signal found" },
  { key: "analyze", label: "Analyze", sub: "Exposure measured" },
  { key: "decide", label: "Decide", sub: "Plan prioritized" },
  { key: "act", label: "Act", sub: "Recovery executing" },
  { key: "recover", label: "Recover", sub: "Revenue returning" },
  { key: "complete", label: "Complete", sub: "Run finished" },
];

function formatRupees(value: number, compact = false) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (compact) {
    if (safe >= 10000000) return `₹${(safe / 10000000).toFixed(2)}Cr`;
    if (safe >= 100000) return `₹${(safe / 100000).toFixed(2)}L`;
    if (safe >= 1000) return `₹${(safe / 1000).toFixed(1)}K`;
  }
  return `₹${Math.round(safe).toLocaleString("en-IN")}`;
}

function formatEventType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function sourceLabel(source: string) {
  if (source === "subscription") return "Subscriptions";
  if (source === "invoice") return "Invoices";
  return "Checkout";
}

function Icon({ name }: { name: "arrow" | "sparkle" | "trend" | "refresh" | "warning" | "check" | "play" | "close" }) {
  const paths = {
    arrow: "M5 12h13M13 6l6 6-6 6",
    sparkle: "M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z",
    trend: "M4 17l6-6 4 4 6-8M20 7h-5M20 7v5",
    refresh: "M20 11a8 8 0 0 0-14.9-4M5 4v4h4M4 13a8 8 0 0 0 14.9 4M19 20v-4h-4",
    warning: "M12 3l9 17H3L12 3zM12 9v5M12 17h.01",
    check: "M5 12l4 4L19 6",
    play: "M8 5l11 7-11 7V5z",
    close: "M6 6l12 12M18 6L6 18",
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function AnimatedNumber({ value, compact = true, prefix = "" }: { value: number; compact?: boolean; prefix?: string }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const from = display;
    const to = Number.isFinite(value) ? value : 0;
    if (Math.abs(to - from) < 1) {
      setDisplay(to);
      return;
    }

    const started = performance.now();
    const duration = 650;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // display is intentionally captured as the animation start value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{prefix}{formatRupees(display, compact)}</>;
}

function Metric({ label, value, description, tone, icon }: { label: string; value: number; description: string; tone: "neutral" | "risk" | "recover" | "done"; icon: "trend" | "warning" | "sparkle" | "check" }) {
  return (
    <div className={`autopilot-metric ${tone}`}>
      <div className="autopilot-metric-top">
        <span>{label}</span>
        <div className="autopilot-metric-icon"><Icon name={icon} /></div>
      </div>
      <strong><AnimatedNumber value={value} /></strong>
      <p>{description}</p>
    </div>
  );
}

function stageMessage(stage: Stage, plan: PlanAction[], actionStatuses: Record<string, ActionStatus>, state: AutopilotState | null) {
  const activeAction = plan.find((item) => actionStatuses[item.action_id] === "working");
  if (stage === "detect") return "Monitoring incoming payment signals for an unusual concentration of revenue exposure.";
  if (stage === "analyze") return `Exposure identified across ${plan.length || 1} recovery signal${plan.length === 1 ? "" : "s"}. Measuring value, urgency and recovery probability.`;
  if (stage === "decide") return "Prioritizing the actions with the strongest recovery potential while keeping uncertain accounts under merchant control.";
  if (stage === "act") return activeAction ? `${activeAction.title}. ${activeAction.reason}` : "Executing the prioritized recovery plan.";
  if (stage === "recover") return `Revenue model updated. Current exposure is ${formatRupees(state?.revenue_at_risk ?? 0, true)} and the recovery queue is being recalculated.`;
  return "The recovery plan has finished. Every action is now reflected in the live revenue model.";
}

export default function RevenueAutopilot({ onOpenRecoveryLab }: { onOpenRecoveryLab: () => void }) {
  const [state, setState] = useState<AutopilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>("revenue_shock");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<Stage>("detect");
  const [plan, setPlan] = useState<PlanAction[]>([]);
  const [actionStatuses, setActionStatuses] = useState<Record<string, ActionStatus>>({});
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [simulationTitle, setSimulationTitle] = useState("");
  const [runStartedAt, setRunStartedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/revenue-autopilot`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);
      const data = (await response.json()) as AutopilotState;
      if (typeof data.expected_revenue !== "number" || !Array.isArray(data.events)) throw new Error("Invalid Revenue Autopilot response");
      setState(data);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Unable to load Revenue Autopilot:", err);
      setError("Unable to connect to the Revenue Autopilot engine. Make sure Flask is running on port 5000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!running) void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load, running]);

  const breakdown = useMemo(() => {
    const events = state?.events ?? [];
    return ["checkout", "subscription", "invoice"].map((source) => ({
      source,
      amount: events.filter((event) => event.source === source && event.status === "at_risk").reduce((sum, event) => sum + Number(event.amount || 0), 0),
    }));
  }, [state]);

  const forecast = useMemo(() => {
    const risk = state?.revenue_at_risk ?? 0;
    return [
      { label: "24h", value: risk * 0.18 },
      { label: "48h", value: risk * 0.35 },
      { label: "72h", value: risk * 0.53 },
      { label: "7d", value: risk * 0.82 },
    ];
  }, [state]);

  const recentEvents = useMemo(() => {
    return [...(state?.events ?? [])].sort((a, b) => {
      const aTime = new Date(a.updated_at ?? a.created_at ?? "").getTime();
      const bTime = new Date(b.updated_at ?? b.created_at ?? "").getTime();
      return bTime - aTime;
    }).slice(0, 7);
  }, [state]);

  const resetSimulation = () => {
    setRunning(false);
    setStage("detect");
    setPlan([]);
    setActionStatuses({});
    setSimulationComplete(false);
    setSimulationTitle("");
    setRunStartedAt(null);
  };

  const executeAction = async (action: PlanAction, index: number) => {
    setActionStatuses((current) => ({ ...current, [action.action_id]: "working" }));
    setStage("act");
    await new Promise((resolve) => window.setTimeout(resolve, 800));

    const response = await fetch(`${API_URL}/revenue-autopilot/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: action.event_id, action: action.action, scenario: selectedScenario, index }),
    });
    if (!response.ok) throw new Error(`Action ${action.action_id} failed`);

    const result = (await response.json()) as { state: AutopilotState };
    setState(result.state);
    setLastUpdated(new Date());
    setActionStatuses((current) => ({ ...current, [action.action_id]: "done" }));
    setStage("recover");
    await new Promise((resolve) => window.setTimeout(resolve, 700));
  };

  const startSimulation = async () => {
    if (running) return;
    resetSimulation();
    setRunning(true);
    setRunStartedAt(new Date());
    const scenario = scenarios.find((item) => item.key === selectedScenario);
    setSimulationTitle(scenario?.label ?? "Revenue Shock");

    try {
      setStage("detect");
      await new Promise((resolve) => window.setTimeout(resolve, 700));

      const response = await fetch(`${API_URL}/revenue-autopilot/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: selectedScenario }),
      });
      if (!response.ok) throw new Error(`Simulation returned ${response.status}`);

      const result = (await response.json()) as { success: boolean; plan?: PlanAction[]; state: AutopilotState };
      if (!result.success || !Array.isArray(result.plan)) throw new Error("Simulation did not return a recovery plan");

      setState(result.state);
      setPlan(result.plan);
      setActionStatuses(Object.fromEntries(result.plan.map((action) => [action.action_id, "queued"])));

      setStage("analyze");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      setStage("decide");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));

      for (let index = 0; index < result.plan.length; index += 1) {
        await executeAction(result.plan[index], index);
      }

      setStage("complete");
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      await load();
      setSimulationComplete(true);
    } catch (err) {
      console.error("Revenue Autopilot simulation failed:", err);
      setError("The simulation hit an error. Check that the latest Flask server.py is running.");
      setStage("act");
    } finally {
      setRunning(false);
    }
  };

  const currentStageIndex = stageMeta.findIndex((item) => item.key === stage);
  const simulationOpen = running || simulationComplete;
  const selectedScenarioData = scenarios.find((item) => item.key === selectedScenario) ?? scenarios[3];

  if (loading && !state) {
    return <section className="autopilot-page"><div className="autopilot-loading"><div className="autopilot-loading-orbit"><span /><span /><span /></div><strong>Connecting to Revenue Autopilot</strong><span>Reading the live revenue model…</span></div></section>;
  }

  return (
    <section className="autopilot-page">
      <div className="autopilot-heading">
        <div>
          <div className="eyebrow"><span className="live-dot" /> LIVE REVENUE INTELLIGENCE</div>
          <h2>Revenue Autopilot</h2>
          <p>See revenue before it becomes lost revenue — and decide what to do next.</p>
        </div>
        <div className="autopilot-heading-actions">
          <button className="autopilot-secondary" type="button" onClick={() => void load()} disabled={loading}><Icon name="refresh" /> Refresh</button>
          <button className="autopilot-primary" type="button" onClick={onOpenRecoveryLab}>Open Recovery Lab <Icon name="arrow" /></button>
        </div>
      </div>

      {error && <div className="autopilot-error"><Icon name="warning" /><span>{error}</span><button type="button" onClick={() => void load()}>Retry</button></div>}

      <div className="autopilot-metrics">
        <Metric label="Expected revenue" value={state?.expected_revenue ?? 0} description="Current revenue baseline" tone="neutral" icon="trend" />
        <Metric label="Revenue at risk" value={state?.revenue_at_risk ?? 0} description="Needs a recovery decision" tone="risk" icon="warning" />
        <Metric label="Recoverable revenue" value={state?.recoverable_revenue ?? 0} description="Potentially recoverable" tone="recover" icon="sparkle" />
        <Metric label="Recovered revenue" value={state?.recovered_revenue ?? 0} description="Already brought back" tone="done" icon="check" />
      </div>

      <div className="autopilot-main-grid">
        <section className="autopilot-panel risk-panel">
          <div className="autopilot-panel-header"><div><h3>Where revenue is at risk</h3><p>Current exposure across recovery origins</p></div><span className="panel-live">LIVE</span></div>
          <div className="risk-total-row"><strong><AnimatedNumber value={state?.revenue_at_risk ?? 0} compact={false} /></strong><span>{state?.expected_revenue ? ((state.revenue_at_risk / state.expected_revenue) * 100).toFixed(1) : "0.0"}% of expected revenue</span></div>
          <div className="risk-bars">
            {breakdown.map((item) => {
              const total = state?.revenue_at_risk ?? 0;
              const width = total ? Math.max(2, (item.amount / total) * 100) : 0;
              return <div className="risk-item" key={item.source}><div className="risk-item-label"><span>{sourceLabel(item.source)}</span><b>{formatRupees(item.amount, true)}</b></div><div className="risk-track"><span style={{ width: `${width}%` }} /></div></div>;
            })}
          </div>
        </section>

        <section className="autopilot-panel forecast-panel">
          <div className="autopilot-panel-header"><div><h3>If you do nothing</h3><p>Estimated revenue likely to be lost over time</p></div><span className="forecast-label">FORECAST</span></div>
          <div className="forecast-grid">{forecast.map((item) => <div className="forecast-cell" key={item.label}><span>{item.label}</span><strong>{formatRupees(item.value, true)}</strong><small>likely lost</small></div>)}</div>
        </section>
      </div>

      <section className="autopilot-launcher">
        <div className="launcher-top">
          <div>
            <div className="eyebrow"><Icon name="sparkle" /> AGENT PLAYGROUND</div>
            <h3>Put Revenue Autopilot under pressure.</h3>
            <p>Choose a merchant-level crisis. The agent will detect the exposure, build a recovery plan and execute it against the live revenue model.</p>
          </div>
          <div className="launcher-ready"><span /> READY TO RUN</div>
        </div>

        <div className="launcher-label">Choose a scenario</div>
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button key={scenario.key} type="button" className={`scenario-card ${selectedScenario === scenario.key ? "selected" : ""}`} onClick={() => setSelectedScenario(scenario.key)}>
              <span className="scenario-icon">{scenario.icon}</span>
              <span className="scenario-copy"><small>{scenario.kicker}</small><strong>{scenario.label}</strong><em>{scenario.description}</em></span>
              <span className="scenario-radio">{selectedScenario === scenario.key ? "✓" : ""}</span>
            </button>
          ))}
        </div>

        <div className="launcher-footer">
          <div><span>Selected scenario</span><strong>{selectedScenarioData.label}</strong></div>
          <button className="start-simulation-button" type="button" onClick={() => void startSimulation()}><span className="start-button-icon"><Icon name="play" /></span>START SIMULATION<Icon name="arrow" /></button>
        </div>
      </section>

      <div className="autopilot-grid-bottom">
        <section className="autopilot-panel plan-panel">
          <div className="autopilot-panel-header"><div><h3>Autopilot recovery logic</h3><p>What the agent is trying to protect</p></div><span className="panel-live">DECISION LAYER</span></div>
          <div className="plan-list">
            <div className="plan-item"><span>01</span><div><strong>Recover high-intent checkout</strong><small>Retry or recover the payment while intent is fresh.</small></div><b>RETRY</b></div>
            <div className="plan-item"><span>02</span><div><strong>Protect recurring revenue</strong><small>Prompt payment-method recovery before churn.</small></div><b>UPDATE</b></div>
            <div className="plan-item"><span>03</span><div><strong>Escalate uncertain accounts</strong><small>Preserve merchant control when automation is risky.</small></div><b>REVIEW</b></div>
          </div>
        </section>

        <section className="autopilot-panel event-panel">
          <div className="autopilot-panel-header"><div><h3>Live recovery events</h3><p>Latest signals flowing into Autopilot</p></div>{lastUpdated && <span className="updated-label">Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}</div>
          <div className="event-list">
            {recentEvents.length === 0 ? <div className="empty-autopilot">No revenue events yet.</div> : recentEvents.map((event) => <div className="event-row" key={event.event_id}><span className={`event-dot ${event.status === "recovered" ? "recovered" : event.status === "completed" ? "completed" : "risk"}`} /><div className="event-main"><strong>{event.description}</strong><span>{event.customer} · {formatEventType(event.event_type)}</span></div><b>{formatRupees(event.amount)}</b><time>{formatTime(event.updated_at ?? event.created_at)}</time></div>)}
          </div>
        </section>
      </div>

      {simulationOpen && (
        <div className="simulation-overlay" role="dialog" aria-modal="true" aria-label="Revenue Autopilot simulation">
          <div className="simulation-screen">
            <div className="simulation-topbar">
              <div className="simulation-brand"><span className="brand-mark"><Icon name="sparkle" /></span><div><strong>Revenue Autopilot</strong><span>Agent run</span></div></div>
              <div className="simulation-topbar-center"><span className="run-live-dot" /> LIVE SIMULATION</div>
              <div className="simulation-topbar-right">{runStartedAt && <span>Started {runStartedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}{simulationComplete && <button type="button" className="simulation-close" onClick={resetSimulation} aria-label="Close simulation"><Icon name="close" /></button>}</div>
            </div>

            <div className="simulation-hero">
              <div className="simulation-hero-copy">
                <span className="simulation-kicker">{selectedScenarioData.kicker} · {selectedScenarioData.label}</span>
                <h1>{simulationTitle}</h1>
                <p>Autopilot is autonomously working through the revenue exposure. Watch each decision land in the live model.</p>
              </div>
              <div className="simulation-hero-values">
                <div><span>REVENUE AT RISK</span><strong className="hero-risk"><AnimatedNumber value={state?.revenue_at_risk ?? 0} compact={true} /></strong></div>
                <div><span>RECOVERED</span><strong className="hero-recovered"><AnimatedNumber value={state?.recovered_revenue ?? 0} compact={true} prefix="+" /></strong></div>
              </div>
            </div>

            <div className="simulation-stage-wrap">
              <div className="stage-line" style={{ width: `${Math.min(100, ((currentStageIndex + 1) / stageMeta.length) * 100)}%` }} />
              <div className="simulation-stage-track">
                {stageMeta.map((item, index) => {
                  const complete = index < currentStageIndex;
                  const active = item.key === stage;
                  return <div key={item.key} className={`simulation-stage ${active ? "active" : ""} ${complete ? "complete" : ""}`}><div className="simulation-stage-dot">{complete ? "✓" : index + 1}</div><strong>{item.label}</strong><span>{active ? item.sub : complete ? "Done" : "Waiting"}</span></div>;
                })}
              </div>
            </div>

            <div className="simulation-content-grid">
              <section className="simulation-card action-card">
                <div className="simulation-card-header"><div><span>AGENT ACTIONS</span><h2>Recovery plan</h2></div><span className="card-live"><i /> LIVE</span></div>
                <div className="action-list">
                  {plan.length === 0 ? <div className="action-empty"><div className="scanner" /><strong>Scanning revenue signals…</strong><span>Looking for unusual exposure</span></div> : plan.map((action, index) => { const status = actionStatuses[action.action_id] ?? "queued"; return <div className={`action-row ${status}`} key={action.action_id}><div className="action-number">{String(index + 1).padStart(2, "0")}</div><div className="action-copy"><strong>{action.title}</strong><p>{action.reason}</p><span>{formatRupees(action.amount)} exposure</span></div><div className={`action-status ${status}`}>{status === "working" ? "WORKING" : status === "done" ? "DONE" : "QUEUED"}</div></div>; })}
                </div>
              </section>

              <section className="simulation-card reasoning-card">
                <div className="simulation-card-header"><div><span>AGENT REASONING</span><h2>Why Autopilot is acting</h2></div><span className="reasoning-badge">DECISION LAYER</span></div>
                <div className="reasoning-body">
                  <div className="reasoning-icon"><Icon name={stage === "complete" ? "check" : stage === "act" ? "trend" : "sparkle"} /></div>
                  <p>{stageMessage(stage, plan, actionStatuses, state)}</p>
                </div>
                <div className="reasoning-metrics"><div><span>Current exposure</span><strong><AnimatedNumber value={state?.revenue_at_risk ?? 0} /></strong></div><div><span>Potential recovery</span><strong><AnimatedNumber value={state?.recoverable_revenue ?? 0} /></strong></div></div>
              </section>
            </div>

            <div className="simulation-bottom-grid">
              <div className="simulation-feed"><div className="feed-title"><span className="run-live-dot" /> EVENT STREAM</div><div className="feed-lines"><div><span>01</span><b>Revenue anomaly detected</b><em>{selectedScenarioData.label}</em></div><div><span>02</span><b>Recovery plan prioritized</b><em>{plan.length || "—"} actions</em></div><div><span>03</span><b>Live revenue model updated</b><em>{formatRupees(state?.revenue_at_risk ?? 0, true)} at risk</em></div></div></div>
              <div className={`simulation-result ${simulationComplete ? "complete" : ""}`}><div><span>{simulationComplete ? "RUN COMPLETE" : "AUTOPILOT STATUS"}</span><strong>{simulationComplete ? "Revenue protection run finished" : stageMeta[currentStageIndex]?.label}</strong></div>{simulationComplete ? <button type="button" onClick={resetSimulation}>Run another <Icon name="arrow" /></button> : <span className="result-live"><i /> Processing</span>}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

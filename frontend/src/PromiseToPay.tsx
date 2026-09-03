import { useMemo, useState } from "react";
import "./PromiseToPay.css";

type PromiseToPayProps = {
  onAgentStateChange?: (running: boolean) => void;
};

type Strategy =
  | "SEND_REMINDER"
  | "REQUEST_NEW_COMMITMENT"
  | "WAIT_AND_RETRY"
  | "ESCALATE"
  | "MANUAL_REVIEW";

type Scenario = {
  id: string;
  number: string;
  status: string;
  statusClass: string;
  customer: string;
  invoiceId: string;
  description: string;
  amount: number;
  invoiceDate: string;
  promiseDate: string;
  daysOverdue: number;
  previousPromises: number;
  promisesKept: number;
  promisesMissed: number;
  previousRecoveryAttempts: number;
  customerTenure: string;
  averagePaymentDelayDays: number;
  lastPaymentAmount: number;
  paymentHistory: string[];
};

type AgentResult = {
  payment_id?: string;
  decision?: Strategy | string;
  action?: string;
  reason?: string;
  result?: string;
  retry_attempt?: string | number;
  customer_intervention?: {
    title?: string;
    message?: string;
    suggested_action?: string;
    suggested_action_label?: string;
  };
};

const SCENARIOS: Scenario[] = [
  {
    id: "reliable",
    number: "01",
    status: "FIRST MISS",
    statusClass: "neutral",
    customer: "Nova Technologies",
    invoiceId: "INV-2048",
    description: "Enterprise workspace renewal",
    amount: 18000,
    invoiceDate: "24 Aug 2026",
    promiseDate: "30 Aug 2026",
    daysOverdue: 4,
    previousPromises: 3,
    promisesKept: 3,
    promisesMissed: 0,
    previousRecoveryAttempts: 0,
    customerTenure: "2 years",
    averagePaymentDelayDays: 1,
    lastPaymentAmount: 17500,
    paymentHistory: [
      "₹17,500 · paid 1 day late",
      "₹18,000 · paid on time",
      "₹16,800 · paid on time",
    ],
  },
  {
    id: "friction",
    number: "02",
    status: "REPEATED DELAY",
    statusClass: "warning",
    customer: "Acme Systems",
    invoiceId: "INV-3172",
    description: "Annual software services",
    amount: 42000,
    invoiceDate: "18 Aug 2026",
    promiseDate: "28 Aug 2026",
    daysOverdue: 7,
    previousPromises: 4,
    promisesKept: 2,
    promisesMissed: 2,
    previousRecoveryAttempts: 1,
    customerTenure: "14 months",
    averagePaymentDelayDays: 6,
    lastPaymentAmount: 39000,
    paymentHistory: [
      "₹39,000 · paid 8 days late",
      "₹42,000 · promise missed",
      "₹41,500 · paid on time",
      "₹38,000 · promise missed",
    ],
  },
  {
    id: "risk",
    number: "03",
    status: "HIGH RISK",
    statusClass: "danger",
    customer: "Vertex Labs",
    invoiceId: "INV-4419",
    description: "Enterprise platform contract",
    amount: 85000,
    invoiceDate: "12 Aug 2026",
    promiseDate: "25 Aug 2026",
    daysOverdue: 10,
    previousPromises: 5,
    promisesKept: 2,
    promisesMissed: 3,
    previousRecoveryAttempts: 3,
    customerTenure: "8 months",
    averagePaymentDelayDays: 11,
    lastPaymentAmount: 22000,
    paymentHistory: [
      "₹22,000 · partial payment",
      "₹85,000 · promise missed",
      "₹60,000 · promise missed",
      "₹48,000 · paid 12 days late",
    ],
  },
];

const STRATEGIES: Array<{
  key: Strategy;
  title: string;
  description: string;
}> = [
  {
    key: "SEND_REMINDER",
    title: "Send reminder",
    description: "Ask the customer to complete the outstanding payment.",
  },
  {
    key: "REQUEST_NEW_COMMITMENT",
    title: "Request new commitment",
    description: "Ask for a revised payment date.",
  },
  {
    key: "WAIT_AND_RETRY",
    title: "Wait and retry",
    description: "Hold another intervention until a better time.",
  },
  {
    key: "ESCALATE",
    title: "Escalate account",
    description: "Move the account beyond basic automated recovery.",
  },
  {
    key: "MANUAL_REVIEW",
    title: "Manual review",
    description: "Pause automation when evidence is insufficient.",
  },
];

const API_URL = "http://127.0.0.1:5000";

function formatAmount(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function decisionLabel(decision?: string) {
  if (!decision) return "Awaiting decision";

  return decision
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PromiseToPay({
  onAgentStateChange,
}: PromiseToPayProps) {
  const [selectedId, setSelectedId] = useState("reliable");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState("");

  const selected = useMemo(
    () =>
      SCENARIOS.find((scenario) => scenario.id === selectedId) ||
      SCENARIOS[0],
    [selectedId]
  );

  const startEvaluation = async () => {
    if (running) return;

    setRunning(true);
    setResult(null);
    setError("");
    onAgentStateChange?.(true);

    try {
      const response = await fetch(
        `${API_URL}/lab-simulate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "promise_missed",
            amount: selected.amount,
            promise: {
              outstanding_amount: selected.amount,
              invoice_id: selected.invoiceId,
              invoice_date: selected.invoiceDate,
              promise_date: selected.promiseDate,
              days_overdue: selected.daysOverdue,
              previous_promises: selected.previousPromises,
              promises_kept: selected.promisesKept,
              promises_missed: selected.promisesMissed,
              previous_recovery_attempts:
                selected.previousRecoveryAttempts,
              customer_tenure: selected.customerTenure,
              average_payment_delay_days:
                selected.averagePaymentDelayDays,
              last_payment_amount:
                selected.lastPaymentAmount,
              payment_history: selected.paymentHistory,
            },
          }),
        }
      );

      const data: AgentResult & {
        success?: boolean;
        message?: string;
        error?: string;
      } = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(
          data.error ||
            data.message ||
            "The recovery agent could not evaluate this account."
        );
      }

      setResult(data);
    } catch (requestError) {
      console.error("Promise-to-pay evaluation error:", requestError);

      setError(
        requestError instanceof Error
          ? requestError.message
          : "The recovery agent could not evaluate this account."
      );
    } finally {
      setRunning(false);
      onAgentStateChange?.(false);
    }
  };

  const selectScenario = (id: string) => {
    if (running) return;

    setSelectedId(id);
    setResult(null);
    setError("");
  };

  const resetEvaluation = () => {
    setResult(null);
    setError("");
  };

  return (
    <div className="promise-page">
      <div className="promise-heading">
        <div className="promise-heading-copy">
          <div className="simulation-label">
            SIMULATION 03
          </div>

          <h1>Promise to Pay</h1>

          <p>
            Track missed customer commitments and let the
            recovery agent decide what should happen next.
          </p>
        </div>

        <div className="promise-heading-status">
          <span className="promise-live-dot" />
          Recovery agent ready
        </div>
      </div>

      <section className="promise-scenario-strip">
        {SCENARIOS.map((scenario) => (
          <button
            className={
              selected.id === scenario.id
                ? "promise-scenario selected"
                : "promise-scenario"
            }
            type="button"
            key={scenario.id}
            onClick={() => selectScenario(scenario.id)}
          >
            <div className="promise-scenario-top">
              <span>{scenario.number}</span>

              <span
                className={`promise-status ${scenario.statusClass}`}
              >
                {scenario.status}
              </span>
            </div>

            <strong>{scenario.customer}</strong>

            <div className="promise-scenario-bottom">
              <span>
                {formatAmount(scenario.amount)}
              </span>

              <span>
                {scenario.daysOverdue}d overdue
              </span>
            </div>
          </button>
        ))}
      </section>

      <div className="promise-grid">
        <section className="promise-account-card">
          <div className="promise-card-header">
            <div>
              <span className="promise-eyebrow">
                OUTSTANDING ACCOUNT
              </span>

              <h2>{selected.customer}</h2>

              <p>{selected.description}</p>
            </div>

            <span
              className={`promise-status large ${selected.statusClass}`}
            >
              {selected.status}
            </span>
          </div>

          <div className="promise-amount-row">
            <div>
              <span>Outstanding</span>
              <strong>{formatAmount(selected.amount)}</strong>
            </div>

            <div>
              <span>Invoice</span>
              <strong>{selected.invoiceId}</strong>
            </div>

            <div>
              <span>Days overdue</span>
              <strong>{selected.daysOverdue} days</strong>
            </div>
          </div>

          <div className="promise-details">
            <div>
              <span>Invoice date</span>
              <strong>{selected.invoiceDate}</strong>
            </div>

            <div>
              <span>Promised payment</span>
              <strong>{selected.promiseDate}</strong>
            </div>

            <div>
              <span>Customer tenure</span>
              <strong>{selected.customerTenure}</strong>
            </div>

            <div>
              <span>Avg. payment delay</span>
              <strong>
                {selected.averagePaymentDelayDays} days
              </strong>
            </div>
          </div>

          <div className="promise-section">
            <div className="promise-section-heading">
              <div>
                <span className="promise-eyebrow">
                  COMMITMENT HISTORY
                </span>

                <h3>Has this customer kept their word?</h3>
              </div>

              <span className="promise-history-count">
                {selected.promisesKept}/
                {selected.previousPromises} kept
              </span>
            </div>

            <div className="promise-metrics">
              <div>
                <strong>{selected.previousPromises}</strong>
                <span>Promises made</span>
              </div>

              <div>
                <strong>{selected.promisesKept}</strong>
                <span>Kept</span>
              </div>

              <div>
                <strong>{selected.promisesMissed}</strong>
                <span>Missed</span>
              </div>

              <div>
                <strong>
                  {selected.previousRecoveryAttempts}
                </strong>
                <span>Recovery attempts</span>
              </div>
            </div>

            <div className="promise-history-list">
              {selected.paymentHistory.map((entry, index) => (
                <div key={`${selected.id}-${index}`}>
                  <span className="history-dot" />
                  <span>{entry}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="promise-timeline">
            <div className="promise-timeline-heading">
              <span className="promise-eyebrow">
                ACCOUNT TIMELINE
              </span>
            </div>

            <div className="promise-timeline-track">
              <div className="promise-timeline-item complete">
                <span>✓</span>
                <div>
                  <strong>Invoice issued</strong>
                  <p>{selected.invoiceDate}</p>
                </div>
              </div>

              <div className="promise-timeline-line" />

              <div className="promise-timeline-item complete">
                <span>✓</span>
                <div>
                  <strong>Payment promise received</strong>
                  <p>
                    Customer committed to{" "}
                    {selected.promiseDate}.
                  </p>
                </div>
              </div>

              <div className="promise-timeline-line" />

              <div className="promise-timeline-item warning">
                <span>!</span>
                <div>
                  <strong>Promise missed</strong>
                  <p>
                    {selected.daysOverdue} days have passed
                    since the commitment.
                  </p>
                </div>
              </div>

              <div className="promise-timeline-line" />

              <div
                className={
                  result
                    ? "promise-timeline-item complete"
                    : "promise-timeline-item pending"
                }
              >
                <span>{result ? "✓" : "○"}</span>
                <div>
                  <strong>
                    {result
                      ? "Recovery decision selected"
                      : "Recovery decision pending"}
                  </strong>
                  <p>
                    {result
                      ? "Agent has evaluated the account."
                      : "Run the agent to evaluate the next step."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="promise-error">
              <strong>Agent unavailable</strong>
              <span>{error}</span>
            </div>
          )}

          <div className="promise-action-row">
            <button
              className="promise-primary-button"
              type="button"
              disabled={running}
              onClick={startEvaluation}
            >
              {running
                ? "Agent is evaluating..."
                : result
                  ? "Evaluate again →"
                  : "Evaluate account →"}
            </button>

            {result && (
              <button
                className="promise-secondary-button"
                type="button"
                onClick={resetEvaluation}
              >
                Clear result
              </button>
            )}
          </div>
        </section>

        <aside className="promise-agent-panel">
          <div className="promise-agent-header">
            <div className="promise-agent-mark">✦</div>

            <div>
              <span>RECOVERY AGENT</span>
              <strong>Promise intelligence</strong>
            </div>

            <span
              className={
                running
                  ? "promise-agent-state running"
                  : "promise-agent-state"
              }
            >
              {running ? "ANALYZING" : "READY"}
            </span>
          </div>

          <div className="promise-agent-intro">
            <span className="promise-eyebrow">
              WHAT THE AGENT SEES
            </span>

            <p>
              It evaluates the outstanding amount,
              commitment history, overdue duration and
              previous recovery friction before choosing
              an action.
            </p>
          </div>

          <div className="promise-signals">
            <div>
              <span>Commitments kept</span>
              <strong>
                {selected.promisesKept}/
                {selected.previousPromises}
              </strong>
            </div>

            <div>
              <span>Promises missed</span>
              <strong>{selected.promisesMissed}</strong>
            </div>

            <div>
              <span>Recovery attempts</span>
              <strong>
                {selected.previousRecoveryAttempts}
              </strong>
            </div>

            <div>
              <span>Amount at stake</span>
              <strong>
                {formatAmount(selected.amount)}
              </strong>
            </div>
          </div>

          <div className="promise-strategy-section">
            <span className="promise-eyebrow">
              AVAILABLE STRATEGIES
            </span>

            <div className="promise-strategies">
              {STRATEGIES.map((strategy, index) => (
                <div
                  className={
                    result?.decision === strategy.key
                      ? "promise-strategy active"
                      : "promise-strategy"
                  }
                  key={strategy.key}
                >
                  <span>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div>
                    <strong>{strategy.title}</strong>
                    <p>{strategy.description}</p>
                  </div>

                  {result?.decision === strategy.key && (
                    <b>SELECTED</b>
                  )}
                </div>
              ))}
            </div>
          </div>

          {running && (
            <div className="promise-agent-thinking">
              <div className="promise-thinking-spinner">↻</div>

              <div>
                <strong>Evaluating customer context</strong>
                <span>
                  Comparing payment behaviour and
                  recovery history...
                </span>
              </div>
            </div>
          )}

          {result && !running && (
            <div className="promise-result">
              <div className="promise-result-top">
                <span>AGENT DECISION</span>

                <strong>
                  {decisionLabel(result.decision)}
                </strong>
              </div>

              <div className="promise-result-reason">
                <span>WHY</span>
                <p>
                  {result.reason ||
                    "The agent selected the safest available recovery path from the supplied account context."}
                </p>
              </div>

              <div className="promise-recommended-action">
                <span>RECOMMENDED ACTION</span>

                <strong>
                  {result.action || decisionLabel(result.decision)}
                </strong>

                {result.customer_intervention?.message && (
                  <p>
                    Customer message: “
                    {result.customer_intervention.message}
                    ”
                  </p>
                )}
              </div>
            </div>
          )}

          {!result && !running && (
            <div className="promise-agent-empty">
              <span>01</span>
              <div>
                <strong>Choose an account</strong>
                <p>
                  Select a customer above, then run the
                  recovery agent to see a decision based
                  on their actual history.
                </p>
              </div>
            </div>
          )}

          <p className="promise-agent-disclaimer">
            The final action is determined from customer
            context and payment history.
          </p>
        </aside>
      </div>
    </div>
  );
}

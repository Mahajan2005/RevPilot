import { useEffect, useState } from "react";
import "./App.css";
import RecoveryLab from "./RecoveryLab";

type IconName =
  | "grid"
  | "card"
  | "clock"
  | "sparkle"
  | "settings"
  | "arrow"
  | "trend"
  | "warning"
  | "check"
  | "search"
  | "refresh"
  | "bell";

type PaymentStatus =
  | "Recovered"
  | "At Risk"
  | "Intervention"
  | "Paid"
  | "Pending";

type Payment = {
  id: string;
  customer: string;
  amount: string;
  reason: string;
  action: string;
  status: PaymentStatus;
  time: string;
  decision?: string;
  agentReason?: string;
  retryAttempts: number;
};

type BackendPayment = {
  payment_id?: string;
  id?: string;

  customer?: string;
  customer_id?: string;

  amount?: number | string;

  failure_reason?: string;
  reason?: string;

  action?: string;
  status?: string;

  recovered_by_agent?: boolean;

  decision?: string;
  agent_decision?: string;
  agent_reason?: string;

  retry_attempts?: number;

  event_type?: string;
  customer_action?: string | null;
  recovery_outcome?: string;
};

type AgentResponse = {
  success: boolean;
  recovered: BackendPayment[];
  at_risk: BackendPayment[];
  message: string;
};

type ResetResponse = {
  success: boolean;
  message: string;
};

const API_URL = "http://127.0.0.1:5000";

function Icon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  const paths: Record<IconName, string> = {
    grid:
      "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",

    card:
      "M3 6h18v12H3zM3 10h18",

    clock:
      "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",

    sparkle:
      "M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z",

    settings:
      "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.4v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1z",

    arrow:
      "M5 12h13M13 6l6 6-6 6",

    trend:
      "M4 17l6-6 4 4 6-8M20 7h-5M20 7v5",

    warning:
      "M12 3l9 17H3L12 3zM12 9v5M12 17h.01",

    check:
      "M5 12l4 4L19 6",

    search:
      "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5",

    refresh:
      "M20 11a8 8 0 0 0-14.9-4M5 4v4h4M4 13a8 8 0 0 0 14.9 4M19 20v-4h-4",

    bell:
      "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 21h4",
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function formatAmount(amount: number | string | undefined) {
  if (
    amount === undefined ||
    amount === null ||
    amount === ""
  ) {
    return "—";
  }

  if (typeof amount === "number") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }

  const cleanedAmount = amount
    .replace(/[₹,\s]/g, "")
    .trim();

  const numericAmount = Number(cleanedAmount);

  if (Number.isNaN(numericAmount)) {
    return amount.startsWith("₹")
      ? amount
      : `₹${amount}`;
  }

  return `₹${numericAmount.toLocaleString("en-IN")}`;
}

function parseAmount(amount: string) {
  if (!amount || amount === "—") {
    return 0;
  }

  const cleanedAmount = amount
    .replace(/[₹,\s]/g, "")
    .trim();

  const numericAmount = Number(cleanedAmount);

  return Number.isNaN(numericAmount)
    ? 0
    : numericAmount;
}

function getPaymentId(payment: BackendPayment) {
  return (
    payment.payment_id ??
    payment.id ??
    ""
  );
}

function getTime() {
  return new Date().toLocaleTimeString(
    "en-IN",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function convertBackendPayment(
  payment: BackendPayment,
  status: PaymentStatus
): Payment {
  return {
    id: getPaymentId(payment),

    customer:
      payment.customer ??
      payment.customer_id ??
      "Unknown",

    amount: formatAmount(
      payment.amount
    ),

    reason:
      payment.failure_reason ??
      payment.reason ??
      (status === "Paid"
        ? "Payment completed"
        : status === "Pending"
          ? "Payment in progress"
          : status === "Recovered"
            ? "Recovered payment"
            : status === "Intervention"
              ? "Customer intervention"
              : "Payment requires attention"),

    action:
      payment.action ??
      (status === "Paid"
        ? "Payment completed"
        : status === "Pending"
          ? "Awaiting payment result"
          : status === "Recovered"
            ? "Payment retried"
            : status === "Intervention"
              ? "Customer prompted"
              : "Customer action required"),

    status,

    time: `Today, ${getTime()}`,

    decision:
      payment.decision ??
      payment.agent_decision,

    agentReason:
      payment.agent_reason,

    retryAttempts:
      payment.retry_attempts ?? 0,
  };
}

function App() {
  const [agentRunning, setAgentRunning] =
    useState(false);

  const [resettingDemo, setResettingDemo] =
    useState(false);

  const [agentComplete, setAgentComplete] =
    useState(false);

  const [demoResetComplete, setDemoResetComplete] =
    useState(false);

  const [agentError, setAgentError] =
    useState(false);

  const [agentMessage, setAgentMessage] =
    useState("");

  const [activeView, setActiveView] =
    useState<
      "overview" | "actions"
    >("overview");

  /*
   * MAIN APPLICATION VIEW
   *
   * merchant:
   * Existing merchant dashboard.
   *
   * recovery-lab:
   * New simulation environment containing
   * Checkout, Subscription and Promise to Pay.
   */
  const [viewMode, setViewMode] =
    useState<
      "merchant" | "recovery-lab"
    >("merchant");

  const [payments, setPayments] =
    useState<Payment[]>([]);

  /*
   * Load payment data from Flask.
   */
  const loadPayments = async () => {
    try {
      console.log(
        "Loading payments from backend..."
      );

      const response = await fetch(
        `${API_URL}/payments`
      );

      console.log(
        "Payments endpoint status:",
        response.status
      );

      if (!response.ok) {
        throw new Error(
          `Payments endpoint returned ${response.status}`
        );
      }

      const data: BackendPayment[] =
        await response.json();

      console.log(
        "Payments received:",
        data
      );

      const recoveryPayments: Payment[] =
        data
          .filter((payment) => Boolean(getPaymentId(payment)))
          .map((payment) => {
            // A verified Razorpay success is a normal paid payment,
            // not an agent recovery.
            if (payment.status === "success") {
              return convertBackendPayment(
                payment,
                "Paid"
              );
            }

            // Agent-recovered demo payments remain recovered.
            if (payment.recovered_by_agent === true) {
              return convertBackendPayment(
                payment,
                "Recovered"
              );
            }

            // Checkout/subscription/promise interventions are visible
            // in the activity feed without being counted as failed
            // payment revenue at risk.
            if (
              payment.status === "checkout_abandoned" ||
              payment.status === "subscription_recovery" ||
              payment.status === "promise_missed" ||
              payment.event_type === "checkout_abandonment"
            ) {
              return convertBackendPayment(
                payment,
                "Intervention"
              );
            }

            // Real Razorpay failures and recovery-review states.
            if (
              payment.status === "failed" ||
              payment.status === "payment_recovery_intervention" ||
              payment.status === "payment_pending_review" ||
              payment.status === "payment_recovery_error" ||
              payment.status === "order_creation_failed"
            ) {
              return convertBackendPayment(
                payment,
                "At Risk"
              );
            }

            // An order that has been created but has not yet reached
            // success/failure is still useful merchant activity.
            return convertBackendPayment(
              payment,
              "Pending"
            );
          });

      setPayments(
        recoveryPayments
      );

      setAgentError(false);
    } catch (error) {
      console.error(
        "Unable to load payments:",
        error
      );

      setAgentError(true);

      setAgentMessage(
        "Unable to load payment data from the recovery backend."
      );
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  /*
   * Run the recovery agent.
   */
  const runAgent = async () => {
    if (
      agentRunning ||
      resettingDemo
    ) {
      return;
    }

    setAgentRunning(true);
    setAgentComplete(false);
    setDemoResetComplete(false);
    setAgentError(false);
    setAgentMessage("");

    console.log(
      "Starting recovery agent..."
    );

    try {
      const response = await fetch(
        `${API_URL}/run-agent`,
        {
          method: "POST",
        }
      );

      console.log(
        "Backend status:",
        response.status
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      const data: AgentResponse =
        await response.json();

      console.log(
        "Recovery agent response:",
        data
      );

      await loadPayments();

      const recoveredCount =
        data.recovered?.length ?? 0;

      const atRiskCount =
        data.at_risk?.length ?? 0;

      const reviewedMessage =
        data.message
          ? data.message.replace(
              /\.$/,
              ""
            )
          : "Agent run completed";

      setAgentMessage(
        `${reviewedMessage} · ${recoveredCount} recovered · ${atRiskCount} ${
          atRiskCount === 1
            ? "needs attention"
            : "need attention"
        }.`
      );

      setAgentComplete(true);
    } catch (error) {
      console.error(
        "Recovery agent error:",
        error
      );

      setAgentError(true);

      setAgentMessage(
        "Unable to connect to recovery agent. Make sure Flask is running on port 5000."
      );
    } finally {
      setAgentRunning(false);
    }
  };

  /*
   * Reset the demo.
   */
  const resetDemo = async () => {
    if (
      agentRunning ||
      resettingDemo
    ) {
      return;
    }

    setResettingDemo(true);
    setAgentComplete(false);
    setDemoResetComplete(false);
    setAgentError(false);
    setAgentMessage("");

    try {
      const response = await fetch(
        `${API_URL}/reset-demo`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      const data: ResetResponse =
        await response.json();

      await loadPayments();

      setAgentMessage(
        data.message ||
          "Demo payments reset to the initial scenario."
      );

      setDemoResetComplete(true);
    } catch (error) {
      console.error(
        "Unable to reset demo:",
        error
      );

      setAgentError(true);

      setAgentMessage(
        "Unable to reset the demo. Make sure Flask is running on port 5000."
      );
    } finally {
      setResettingDemo(false);
    }
  };

  /*
   * Metrics
   */
  const recoveredCount =
    payments.filter(
      (payment) =>
        payment.status ===
        "Recovered"
    ).length;

  const atRiskCount =
    payments.filter(
      (payment) =>
        payment.status ===
        "At Risk"
    ).length;

  const recoveredRevenue =
    payments
      .filter(
        (payment) =>
          payment.status ===
          "Recovered"
      )
      .reduce(
        (total, payment) =>
          total +
          parseAmount(
            payment.amount
          ),
        0
      );

  const atRiskRevenue =
    payments
      .filter(
        (payment) =>
          payment.status ===
          "At Risk"
      )
      .reduce(
        (total, payment) =>
          total +
          parseAmount(
            payment.amount
          ),
        0
      );

  const agentActions =
    payments.filter(
      (payment) =>
        payment.decision
    );

  /*
   * =====================================================
   * RECOVERY LAB
   * =====================================================
   *
   * This completely replaces the old customer view.
   *
   * The merchant dashboard remains untouched.
   *
   * RecoveryLab contains:
   *
   * 1. Checkout simulator
   * 2. Subscription simulator
   * 3. Promise to Pay
   */
  if (
    viewMode ===
    "recovery-lab"
  ) {
    return (
      <RecoveryLab
        onBack={() => {
          setViewMode("merchant");
          void loadPayments();
        }}
      />
    );
  }

  return (
    <div className="app-shell">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-mark">
            R
          </div>

          <span>
            Razorpay
          </span>

        </div>

        <div className="sidebar-content">

          <p className="nav-label">
            WORKSPACE
          </p>

          <nav>

            <button
              className={`nav-item ${
                activeView ===
                "overview"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveView(
                  "overview"
                )
              }
              type="button"
            >

              <Icon name="grid" />

              <span>
                Overview
              </span>

            </button>

            <a className="nav-item">

              <Icon name="card" />

              <span>
                Payments
              </span>

            </a>

            <a className="nav-item">

              <Icon name="clock" />

              <span>
                Recovery activity
              </span>

            </a>

          </nav>

          <p className="nav-label agent-label">
            AGENT
          </p>

          <nav>

            <button
              className={`nav-item ${
                activeView ===
                "actions"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveView(
                  "actions"
                )
              }
              type="button"
            >

              <Icon name="sparkle" />

              <span>
                Agent actions
              </span>

            </button>

            <a className="nav-item">

              <Icon name="settings" />

              <span>
                Settings
              </span>

            </a>

          </nav>

        </div>

        <div className="agent-status">

          <div className="status-dot" />

          <div>

            <strong>
              Recovery agent
            </strong>

            <span>
              {agentRunning
                ? "Running"
                : "Active"}
            </span>

          </div>

          <Icon
            name="arrow"
            size={16}
          />

        </div>

      </aside>

      {/* MAIN */}

      <main className="main-content">

        <header className="topbar">

          <div>

            <div className="breadcrumb">

              Workspace{" "}

              <span>
                /
              </span>{" "}

              {activeView ===
              "overview"
                ? "Recovery"
                : "Agent actions"}

            </div>

            <h1>

              {activeView ===
              "overview"
                ? "Revenue recovery"
                : "Agent actions"}

            </h1>

          </div>

          <div className="topbar-right">

            {/* RECOVERY LAB */}

            <button
              className="customer-view-button"
              onClick={() => {
                setViewMode(
                  "recovery-lab"
                );
              }}
              type="button"
            >
              Recovery Lab
            </button>

            <div className="environment">

              <span className="status-dot" />

              Demo environment

            </div>

            <div className="avatar">
              AM
            </div>

          </div>

        </header>

        {/* OVERVIEW */}

        {activeView ===
        "overview" ? (

          <section className="dashboard">

            <div className="section-heading">

              <div>

                <h2>
                  Recovery overview
                </h2>

                <p>
                  Monitor failed payments
                  and actions taken by the
                  recovery agent.
                </p>

              </div>

              <div className="agent-controls">

                <button
                  className="primary-button"
                  onClick={
                    runAgent
                  }
                  disabled={
                    agentRunning ||
                    resettingDemo
                  }
                >

                  {agentRunning
                    ? "Running..."
                    : agentComplete
                      ? "Run again"
                      : "Run agent"}

                  <Icon
                    name={
                      agentRunning
                        ? "refresh"
                        : "arrow"
                    }
                    size={17}
                  />

                </button>

                <button
                  className="secondary-button"
                  onClick={
                    resetDemo
                  }
                  disabled={
                    agentRunning ||
                    resettingDemo
                  }
                  type="button"
                >

                  {resettingDemo
                    ? "Resetting..."
                    : "Reset demo"}

                  <Icon
                    name="refresh"
                    size={16}
                  />

                </button>

                {agentRunning && (

                  <div className="agent-running">

                    <span className="status-dot" />

                    Agent is analyzing
                    payments...

                  </div>

                )}

                {agentComplete &&
                  !agentRunning && (

                    <div className="agent-complete">

                      ✓{" "}
                      {agentMessage ||
                        "Recovery run completed"}

                    </div>

                  )}

                {demoResetComplete &&
                  !resettingDemo && (

                    <div className="agent-complete">

                      ✓{" "}
                      {agentMessage}

                    </div>

                  )}

                {agentError && (

                  <div className="agent-error">

                    {agentMessage}

                  </div>

                )}

              </div>

            </div>

            {/* METRICS */}

            <div className="metrics-grid">

              <MetricCard
                title="Revenue recovered"
                value={`₹${recoveredRevenue.toLocaleString(
                  "en-IN"
                )}`}
                description={`${recoveredCount} payments recovered`}
                icon="trend"
                variant="success"
              />

              <MetricCard
                title="Revenue at risk"
                value={`₹${atRiskRevenue.toLocaleString(
                  "en-IN"
                )}`}
                description="Requires customer action"
                icon="warning"
                variant="warning"
              />

              <MetricCard
                title="Recovered payments"
                value={String(
                  recoveredCount
                )}
                description="Automatically recovered"
                icon="check"
                variant="success"
              />

              <MetricCard
                title="Payments at risk"
                value={String(
                  atRiskCount
                )}
                description="Needs attention"
                icon="warning"
                variant="warning"
              />

            </div>

            {/* ATTENTION */}

            <div className="attention-banner">

              <div className="attention-icon">

                <Icon
                  name="warning"
                  size={19}
                />

              </div>

              <div className="attention-content">

                <strong>

                  {atRiskCount}{" "}

                  {atRiskCount === 1
                    ? "payment"
                    : "payments"}{" "}

                  require attention

                </strong>

                <span>

                  {atRiskRevenue > 0
                    ? `₹${atRiskRevenue.toLocaleString(
                        "en-IN"
                      )} could not be recovered automatically and requires attention.`
                    : "No payments currently require attention."}

                </span>

              </div>

              {/* VIEW PAYMENT → RECOVERY LAB */}

              <button
                className="text-button"
                onClick={() => {
                  setViewMode(
                    "recovery-lab"
                  );
                }}
                type="button"
              >

                View payment

                <Icon
                  name="arrow"
                  size={16}
                />

              </button>

            </div>

            {/* ACTIVITY */}

            <section className="panel activity-panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Recovery activity
                  </h3>

                  <p>
                    Recent actions taken by
                    the recovery agent
                  </p>

                </div>

                <button className="filter-button">

                  All activity

                  <span>
                    ⌄
                  </span>

                </button>

              </div>

              <div className="table-wrapper">

                <div className="table-header">

                  <span>
                    Payment
                  </span>

                  <span>
                    Customer
                  </span>

                  <span>
                    Amount
                  </span>

                  <span>
                    Failure reason
                  </span>

                  <span>
                    Action
                  </span>

                  <span>
                    Status
                  </span>

                  <span>
                    Time
                  </span>

                </div>

                {payments.length === 0 ? (

                  <div className="table-row">

                    <span>
                      No recovery activity yet.
                    </span>

                    <span>
                      —
                    </span>

                    <span>
                      —
                    </span>

                    <span>
                      —
                    </span>

                    <span>
                      —
                    </span>

                    <span>
                      —
                    </span>

                    <span>
                      —
                    </span>

                  </div>

                ) : (

                  payments.map(
                    (payment) => (

                      <div
                        className="table-row"
                        key={payment.id}
                      >

                        <span className="payment-id">
                          {payment.id}
                        </span>

                        <span>
                          {payment.customer}
                        </span>

                        <strong>
                          {payment.amount}
                        </strong>

                        <span>
                          {payment.reason}
                        </span>

                        <span>
                          {payment.action}
                        </span>

                        <span>

                          <StatusBadge
                            status={
                              payment.status
                            }
                          />

                        </span>

                        <span>
                          {payment.time}
                        </span>

                      </div>

                    )
                  )

                )}

              </div>

            </section>

            {/* BOTTOM */}

            <div className="bottom-grid">

              <section className="panel">

                <div className="panel-header compact">

                  <div>

                    <h3>
                      Agent summary
                    </h3>

                    <p>

                      {agentComplete
                        ? "Latest recovery run completed"
                        : "Latest recovery run"}

                    </p>

                  </div>

                </div>

                <div className="summary-stats">

                  <SummaryStat
                    icon="search"
                    value={String(
                      agentComplete
                        ? recoveredCount +
                            atRiskCount
                        : payments.length
                    )}
                    label="Payments reviewed"
                  />

                  <SummaryStat
                    icon="refresh"
                    value={String(
                      recoveredCount
                    )}
                    label="Automatic retries"
                  />

                  <SummaryStat
                    icon="bell"
                    value={String(
                      atRiskCount
                    )}
                    label="Customers notified"
                  />

                  <div className="summary-stat">

                    <div className="summary-icon">

                      <Icon
                        name="trend"
                      />

                    </div>

                    <strong>

                      {recoveredCount + atRiskCount
                        ? `${Math.round(
                            (recoveredCount /
                              (recoveredCount + atRiskCount)) *
                              100
                          )}%`
                        : "0%"}

                    </strong>

                    <span>
                      Recovery rate
                    </span>

                  </div>

                </div>

              </section>

              <section className="panel workflow-panel">

                <div className="panel-header compact">

                  <div>

                    <h3>
                      How the agent works
                    </h3>

                    <p>
                      Current recovery workflow
                    </p>

                  </div>

                </div>

                <div className="workflow">

                  <WorkflowStep
                    number="1"
                    title="Detect failure"
                    text="Identify unsuccessful payments"
                  />

                  <div className="workflow-arrow">
                    →
                  </div>

                  <WorkflowStep
                    number="2"
                    title="Take action"
                    text="Retry, wait, notify or escalate"
                  />

                  <div className="workflow-arrow">
                    →
                  </div>

                  <WorkflowStep
                    number="3"
                    title="Record outcome"
                    text="Update recovery activity"
                  />

                </div>

              </section>

            </div>

          </section>

        ) : (

          /* AGENT ACTIONS */

          <section className="dashboard agent-actions-page">

            <div className="section-heading">

              <div>

                <h2>
                  Agent decision log
                </h2>

                <p>
                  Each recorded recovery decision
                  and its current outcome.
                </p>

              </div>

              <button
                className="secondary-button"
                onClick={() =>
                  setActiveView(
                    "overview"
                  )
                }
                type="button"
              >

                Back to overview

                <Icon
                  name="arrow"
                  size={16}
                />

              </button>

            </div>

            <section className="panel action-log-panel">

              <div className="action-log-header">

                <div>

                  <span className="action-log-count">
                    {agentActions.length}
                  </span>{" "}

                  recorded decisions

                </div>

                <span>
                  Updated from the latest payment data
                </span>

              </div>

              {agentActions.length ===
              0 ? (

                <div className="action-empty-state">

                  <Icon
                    name="sparkle"
                    size={22}
                  />

                  <strong>
                    No agent decisions recorded yet
                  </strong>

                  <span>
                    Run the recovery agent to
                    create a decision log.
                  </span>

                </div>

              ) : (

                <div className="action-list">

                  {agentActions.map(
                    (payment) => (

                      <article
                        className="action-card"
                        key={payment.id}
                      >

                        <div className="action-card-top">

                          <div>

                            <span className="payment-id">
                              {payment.id}
                            </span>

                            <strong>
                              {payment.customer}
                            </strong>

                          </div>

                          <StatusBadge
                            status={
                              payment.status
                            }
                          />

                        </div>

                        <dl className="action-details">

                          <div>

                            <dt>
                              Detected failure
                            </dt>

                            <dd>
                              {payment.reason}
                            </dd>

                          </div>

                          <div>

                            <dt>
                              Agent decision
                            </dt>

                            <dd>
                              {formatDecision(
                                payment.decision
                              )}
                            </dd>

                          </div>

                          <div>

                            <dt>
                              Action taken
                            </dt>

                            <dd>
                              {payment.action}
                            </dd>

                          </div>

                          <div>

                            <dt>
                              Result
                            </dt>

                            <dd>
                              {payment.status}
                            </dd>

                          </div>

                          <div>

                            <dt>
                              Attempt
                            </dt>

                            <dd>

                              {payment.retryAttempts >
                              0
                                ? `Retry ${payment.retryAttempts} of 2`
                                : "No retry attempted"}

                            </dd>

                          </div>

                        </dl>

                        {payment.agentReason && (

                          <p className="action-rationale">

                            <span>
                              Why this action
                            </span>

                            {payment.agentReason}

                          </p>

                        )}

                      </article>

                    )
                  )}

                </div>

              )}

            </section>

          </section>

        )}

      </main>

    </div>
  );
}

/* METRIC CARD */

function MetricCard({
  title,
  value,
  description,
  icon,
  variant,
}: {
  title: string;
  value: string;
  description: string;
  icon: IconName;
  variant:
    | "success"
    | "warning";
}) {
  return (
    <div className="metric-card">

      <div className="metric-top">

        <span>
          {title}
        </span>

        <div
          className={`metric-icon ${variant}`}
        >

          <Icon
            name={icon}
            size={19}
          />

        </div>

      </div>

      <strong className="metric-value">
        {value}
      </strong>

      <div
        className={`metric-description ${variant}`}
      >

        {variant ===
          "success" &&
          "↑ "}

        {description}

      </div>

    </div>
  );
}

/* STATUS BADGE */

function StatusBadge({
  status,
}: {
  status: PaymentStatus;
}) {
  const className =
    status === "Recovered"
      ? "recovered"
      : status === "Paid"
        ? "paid"
        : status === "Intervention"
          ? "intervention"
          : status === "Pending"
            ? "pending"
            : "risk";

  return (
    <span
      className={`status-badge ${className}`}
    >
      <span />
      {status}
    </span>
  );
}

/* AGENT DECISION FORMATTER */

function formatDecision(
  decision?: string
) {
  if (!decision) {
    return "Decision unavailable";
  }

  return decision
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

/* SUMMARY STAT */

function SummaryStat({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: string;
  label: string;
}) {
  return (
    <div className="summary-stat">

      <div className="summary-icon">

        <Icon name={icon} />

      </div>

      <strong>
        {value}
      </strong>

      <span>
        {label}
      </span>

    </div>
  );
}

/* WORKFLOW STEP */

function WorkflowStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="workflow-step">

      <div className="step-number">
        {number}
      </div>

      <div>

        <strong>
          {title}
        </strong>

        <span>
          {text}
        </span>

      </div>

    </div>
  );
}

export default App;
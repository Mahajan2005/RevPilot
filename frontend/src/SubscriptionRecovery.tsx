import { useState } from "react";
import "./SubscriptionRecovery.css";

type SubscriptionRecoveryProps = {
  onAgentStateChange?: (running: boolean) => void;
};

type Scenario = {
  id: string;
  number: string;
  tag: string;
  title: string;
  description: string;
  successfulRenewals: number;
  previousFailures: number;
  recoveryAttempts: number;
  currentAttempt: number;
  paymentMethod: string;
  customerType: string;
  accent: "violet" | "blue" | "orange";
};

type AgentResult = {
  decision?: string;
  action?: string;
  reason?: string;
  customer_title?: string;
  customer_message?: string;
  suggested_action?: string;
  suggested_action_label?: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "healthy",
    number: "01",
    tag: "CLEAN HISTORY",
    title: "Loyal Subscriber",
    description:
      "A long-term subscriber with a strong renewal history and no previous recovery attempts.",
    successfulRenewals: 8,
    previousFailures: 0,
    recoveryAttempts: 0,
    currentAttempt: 1,
    paymentMethod: "Visa •••• 4242",
    customerType: "Established customer",
    accent: "violet",
  },
  {
    id: "friction",
    number: "02",
    tag: "SOME FRICTION",
    title: "Payment Friction",
    description:
      "A regular subscriber who has experienced a few recent payment issues.",
    successfulRenewals: 8,
    previousFailures: 2,
    recoveryAttempts: 1,
    currentAttempt: 2,
    paymentMethod: "Visa •••• 4242",
    customerType: "Returning customer",
    accent: "blue",
  },
  {
    id: "repeated",
    number: "03",
    tag: "REPEATED ISSUES",
    title: "Recovery Fatigue",
    description:
      "A subscriber with repeated failures and previous recovery attempts.",
    successfulRenewals: 5,
    previousFailures: 3,
    recoveryAttempts: 2,
    currentAttempt: 3,
    paymentMethod: "Visa •••• 4242",
    customerType: "At-risk customer",
    accent: "orange",
  },
];

const SUBSCRIPTION = {
  planName: "Pro Workspace",
  description:
    "Everything your team needs to collaborate and ship faster.",
  amount: 1499,
  billingCycle: "Monthly",
  customerName: "Demo Customer",
  customerEmail: "customer@demo.test",
  renewalDate: "Today",
};

function formatAmount(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatStrategy(strategy?: string) {
  if (!strategy) return "Recovery action";

  return strategy
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SubscriptionRecovery({
  onAgentStateChange,
}: SubscriptionRecoveryProps) {
  const [selectedId, setSelectedId] = useState(
    SCENARIOS[0].id
  );

  const [started, setStarted] = useState(false);

  const [agentRunning, setAgentRunning] = useState(false);

  const [agentResult, setAgentResult] =
    useState<AgentResult | null>(null);

  const [error, setError] = useState<string | null>(
    null
  );

  const selectedScenario =
    SCENARIOS.find(
      (scenario) => scenario.id === selectedId
    ) || SCENARIOS[0];

  const handleStart = async () => {
    if (started || agentRunning) return;

    setStarted(true);
    setAgentRunning(true);
    setAgentResult(null);
    setError(null);

    onAgentStateChange?.(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:5000/lab-simulate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_type: "subscription_failure",

            amount: SUBSCRIPTION.amount,

            subscription: {
              subscription_id: "sub_demo_001",

              customer_id:
                "lab_subscription_customer",

              plan_name:
                SUBSCRIPTION.planName,

              amount:
                SUBSCRIPTION.amount,

              billing_cycle:
                SUBSCRIPTION.billingCycle,

              payment_method:
                selectedScenario.paymentMethod,

              renewal_due_at:
                SUBSCRIPTION.renewalDate,

              successful_renewals:
                selectedScenario.successfulRenewals,

              previous_failed_renewals:
                selectedScenario.previousFailures,

              previous_recovery_attempts:
                selectedScenario.recoveryAttempts,

              attempt_count:
                selectedScenario.currentAttempt,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      const data = await response.json();

      console.log(
        "Subscription recovery result:",
        data
      );

      /*
       * Flask returns the decision directly at the
       * top level and customer-facing information
       * inside customer_intervention.
       */
      setAgentResult({
        decision: data?.decision,

        action: data?.action,

        reason: data?.reason,

        customer_title:
          data?.customer_intervention?.title,

        customer_message:
          data?.customer_intervention?.message,

        suggested_action:
          data?.customer_intervention
            ?.suggested_action,

        suggested_action_label:
          data?.customer_intervention
            ?.suggested_action_label,
      });
    } catch (err) {
      console.error(
        "Subscription recovery simulation failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the recovery agent."
      );
    } finally {
      setAgentRunning(false);
      onAgentStateChange?.(false);
    }
  };

  const handleReset = () => {
    setStarted(false);
    setAgentRunning(false);
    setAgentResult(null);
    setError(null);

    onAgentStateChange?.(false);
  };

  return (
    <div className="subscription-recovery-page">
      <div className="subscription-heading">
        <div className="subscription-heading-copy">
          <div className="simulation-label">
            SIMULATION 02
          </div>

          <h1>Subscription Recovery</h1>

          <p>
            Explore how the same failed renewal can
            require a different recovery approach
            depending on the customer's history.
          </p>
        </div>

        <div className="subscription-heading-badge">
          <span className="subscription-heading-dot" />
          <span>Scenario simulator</span>
        </div>
      </div>

      {!started ? (
        <>
          <div className="subscription-scenario-intro">
            <div>
              <span className="scenario-eyebrow">
                CHOOSE A CUSTOMER
              </span>

              <h2>
                Every failed renewal tells a
                different story.
              </h2>
            </div>

            <p>
              Select a customer profile. These are
              the facts the recovery agent will
              receive when we connect the AI layer.
            </p>
          </div>

          <div className="subscription-scenario-grid">
            {SCENARIOS.map((scenario) => {
              const selected =
                scenario.id === selectedId;

              return (
                <button
                  key={scenario.id}
                  type="button"
                  aria-pressed={selected}
                  className={`subscription-scenario-card ${
                    scenario.accent
                  } ${
                    selected ? "selected" : ""
                  }`}
                  onClick={() =>
                    setSelectedId(scenario.id)
                  }
                >
                  <div className="scenario-card-glow" />

                  <div className="scenario-card-top">
                    <div className="scenario-card-index">
                      <span>
                        {scenario.number}
                      </span>
                    </div>

                    <div className="scenario-select">
                      {selected ? (
                        <span>✓</span>
                      ) : (
                        <span className="scenario-select-empty" />
                      )}
                    </div>
                  </div>

                  <div
                    className="scenario-icon"
                    aria-hidden="true"
                  >
                    {scenario.id === "healthy"
                      ? "↗"
                      : scenario.id === "friction"
                        ? "◌"
                        : "↻"}
                  </div>

                  <span className="scenario-label">
                    {scenario.tag}
                  </span>

                  <h3>{scenario.title}</h3>

                  <p className="scenario-description">
                    {scenario.description}
                  </p>

                  <div className="scenario-stats">
                    <div className="scenario-stat">
                      <span>
                        Successful renewals
                      </span>

                      <strong>
                        {scenario.successfulRenewals}
                      </strong>
                    </div>

                    <div className="scenario-stat">
                      <span>
                        Previous failures
                      </span>

                      <strong>
                        {scenario.previousFailures}
                      </strong>
                    </div>

                    <div className="scenario-stat">
                      <span>
                        Recovery attempts
                      </span>

                      <strong>
                        {scenario.recoveryAttempts}
                      </strong>
                    </div>

                    <div className="scenario-stat">
                      <span>
                        Current attempt
                      </span>

                      <strong>
                        #{scenario.currentAttempt}
                      </strong>
                    </div>
                  </div>

                  <div className="scenario-card-footer">
                    <span>
                      {scenario.customerType}
                    </span>

                    <span className="scenario-arrow">
                      →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="subscription-start-row">
            <div className="selected-scenario-summary">
              <div
                className={`selected-scenario-dot ${selectedScenario.accent}`}
              />

              <div>
                <span>
                  SELECTED CUSTOMER
                </span>

                <strong>
                  {selectedScenario.title}
                </strong>
              </div>

              <small>
                Renewal attempt #
                {selectedScenario.currentAttempt}
              </small>
            </div>

            <button
              className="primary-lab-button subscription-start-button"
              type="button"
              onClick={handleStart}
            >
              Start simulation
              <span>→</span>
            </button>
          </div>
        </>
      ) : (
        <div className="subscription-active-layout">
          <div className="subscription-active-card">
            <div className="subscription-active-top">
              <div>
                <span className="scenario-eyebrow">
                  ACTIVE SCENARIO
                </span>

                <h2>
                  {selectedScenario.title}
                </h2>

                <p>
                  {selectedScenario.description}
                </p>
              </div>

              <span
                className={`scenario-active-badge ${selectedScenario.accent}`}
              >
                {agentRunning
                  ? "RUNNING"
                  : error
                    ? "ERROR"
                    : "COMPLETE"}
              </span>
            </div>

            <div className="subscription-plan-preview">
              <div className="subscription-icon">
                ↻
              </div>

              <div className="subscription-plan-copy">
                <span>
                  {SUBSCRIPTION.billingCycle.toUpperCase()} PLAN
                </span>

                <strong>
                  {SUBSCRIPTION.planName}
                </strong>

                <p>
                  {SUBSCRIPTION.description}
                </p>
              </div>

              <div className="subscription-plan-price">
                <strong>
                  {formatAmount(
                    SUBSCRIPTION.amount
                  )}
                </strong>

                <span>/ month</span>
              </div>
            </div>

            <div className="subscription-active-details">
              <div>
                <span>Customer</span>

                <strong>
                  {SUBSCRIPTION.customerName}
                </strong>
              </div>

              <div>
                <span>Payment method</span>

                <strong>
                  {selectedScenario.paymentMethod}
                </strong>
              </div>

              <div>
                <span>Renewal</span>

                <strong>
                  {SUBSCRIPTION.renewalDate}
                </strong>
              </div>

              <div>
                <span>Attempt</span>

                <strong>
                  #{selectedScenario.currentAttempt}
                </strong>
              </div>
            </div>

            <div className="subscription-context-panel">
              <div className="context-panel-icon">
                ◎
              </div>

              <div>
                <span>
                  CUSTOMER CONTEXT
                </span>

                <strong>
                  {selectedScenario.successfulRenewals}{" "}
                  successful renewals
                  <i>•</i>{" "}
                  {selectedScenario.previousFailures}{" "}
                  previous failures
                  <i>•</i>{" "}
                  {selectedScenario.recoveryAttempts}{" "}
                  recovery attempts
                </strong>

                <p>
                  This customer history is being
                  evaluated by the recovery agent.
                </p>
              </div>
            </div>

            <div className="subscription-demo-status">
              <div className="status-check">
                {agentRunning ? "…" : "✓"}
              </div>

              <div>
                <strong>
                  {agentRunning
                    ? "Recovery agent is analyzing"
                    : "Scenario processed"}
                </strong>

                <span>
                  {agentRunning
                    ? "Evaluating customer history and selecting the safest recovery path."
                    : "The recovery decision has been returned from the AI layer."}
                </span>
              </div>
            </div>

            {error && (
              <div
                className="subscription-demo-status"
                style={{ marginTop: "12px" }}
              >
                <div className="status-check">
                  !
                </div>

                <div>
                  <strong>
                    Recovery agent unavailable
                  </strong>

                  <span>{error}</span>
                </div>
              </div>
            )}

            <button
              className="reset-button"
              type="button"
              onClick={handleReset}
            >
              ← Choose another scenario
            </button>
          </div>

          <div className="agent-analysis-card subscription-analysis-card">
            <div className="analysis-header">
              <div className="agent-icon">
                ✦
              </div>

              <div>
                <span>
                  RECOVERY AGENT
                </span>

                <strong>
                  Decision pipeline
                </strong>
              </div>
            </div>

            <div className="analysis-steps">
              <div>
                <span>01</span>

                <div>
                  <strong>
                    Detect event
                  </strong>

                  <p>
                    Identify the failed renewal.
                  </p>
                </div>
              </div>

              <div>
                <span>02</span>

                <div>
                  <strong>
                    Understand context
                  </strong>

                  <p>
                    Review payment history and
                    customer behavior.
                  </p>
                </div>
              </div>

              <div>
                <span>03</span>

                <div>
                  <strong>
                    Choose action
                  </strong>

                  <p>
                    Select the safest recovery
                    path.
                  </p>
                </div>
              </div>

              <div>
                <span>04</span>

                <div>
                  <strong>
                    Record outcome
                  </strong>

                  <p>
                    Send the recovery result to
                    the merchant dashboard.
                  </p>
                </div>
              </div>
            </div>

            {agentRunning ? (
              <div className="subscription-ai-placeholder">
                <span>
                  RECOVERY AGENT RUNNING
                </span>

                <p>
                  The agent is evaluating this
                  customer's renewal history and
                  deciding the safest recovery
                  action.
                </p>
              </div>
            ) : agentResult ? (
              <div className="subscription-ai-placeholder">
                <span>
                  AI RECOVERY DECISION
                </span>

                <div
                  style={{
                    marginTop: "18px",
                    display: "grid",
                    gap: "16px",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <small
                      style={{
                        display: "block",
                        marginBottom: "5px",
                        opacity: 0.55,
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                      }}
                    >
                      RECOMMENDED ACTION
                    </small>

                    <strong
                      style={{
                        fontSize: "18px",
                      }}
                    >
                      {formatStrategy(
                        agentResult.decision ||
                          agentResult.suggested_action
                      )}
                    </strong>
                  </div>

                  {agentResult.reason && (
                    <div>
                      <small
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          opacity: 0.55,
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                        }}
                      >
                        WHY
                      </small>

                      <p
                        style={{
                          margin: 0,
                          lineHeight: 1.55,
                        }}
                      >
                        {agentResult.reason}
                      </p>
                    </div>
                  )}

                  {agentResult.customer_message && (
                    <div>
                      <small
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          opacity: 0.55,
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                        }}
                      >
                        CUSTOMER MESSAGE
                      </small>

                      <p
                        style={{
                          margin: 0,
                          lineHeight: 1.55,
                        }}
                      >
                        "{agentResult.customer_message}"
                      </p>
                    </div>
                  )}

                </div>
              </div>
            ) : (
              <div className="subscription-ai-placeholder">
                <span>
                  WAITING FOR DECISION
                </span>

                <p>
                  The recovery agent will return
                  its decision here after evaluating
                  the selected customer profile.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
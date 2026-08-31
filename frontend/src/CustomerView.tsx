import { useEffect, useState } from "react";
import "./CustomerView.css";

declare global {
  interface Window {
    Razorpay: any;
  }
}

type CustomerViewProps = {
  paymentId: string | null;
  onBack: () => void;
};

type PaymentMethod = "card" | "upi" | "netbanking";

type PaymentSet = {
  id: string;
  backendId: string;
  label: string;
  method: PaymentMethod;
  amount: number;
  customer: string;
  card?: {
    number: string;
    expiry: string;
    cvv: string;
    name: string;
  };
  upi?: { id: string };
  netbanking?: { bank: string };
};

type PaymentResult = {
  payment?: {
    payment_id?: string;
    status?: string;
    failure_reason?: string;
    action?: string;
    decision?: string;
    agent_decision?: string;
    agent_reason?: string;
    retry_attempts?: number;
    recovered_by_agent?: boolean;
  };
  decision?: string;
  action?: string;
  reason?: string;
  recovered?: boolean;
  message?: string;
};

type PaymentStage = "payment" | "processing" | "failed" | "agent" | "result";

const API_URL = "http://127.0.0.1:5000";

/*
 * Customer-side demo scenarios.
 *
 * The failure reason is intentionally NOT stored in the UI.
 * The backend owns the failure scenario and the agent decision.
 * The customer only sees the payment method + pre-filled demo data.
 */
const PAYMENT_SETS: PaymentSet[] = [
  {
    id: "001",
    backendId: "pay_001",
    label: "Payment 001",
    method: "upi",
    amount: 5000,
    customer: "Customer 001",
    upi: { id: "customer001@okhdfcbank" },
  },
  {
    id: "002",
    backendId: "pay_002",
    label: "Payment 002",
    method: "upi",
    amount: 12000,
    customer: "Customer 002",
    upi: { id: "customer002@okhdfcbank" },
  },
  {
    id: "003",
    backendId: "pay_003",
    label: "Payment 003",
    method: "upi",
    amount: 8000,
    customer: "Customer 003",
    upi: { id: "customer003@okhdfcbank" },
  },
  {
    id: "004",
    backendId: "pay_004",
    label: "Payment 004",
    method: "card",
    amount: 3200,
    customer: "Customer 004",
    card: {
      number: "4111 1111 1111 1111",
      expiry: "09 / 29",
      cvv: "123",
      name: "CUSTOMER 004",
    },
  },
  {
    id: "005",
    backendId: "pay_005",
    label: "Payment 005",
    method: "upi",
    amount: 6500,
    customer: "Customer 005",
    upi: { id: "customer005@okhdfcbank" },
  },
  {
    id: "006",
    backendId: "pay_006",
    label: "Payment 006",
    method: "upi",
    amount: 4100,
    customer: "Customer 006",
    upi: { id: "customer006@okhdfcbank" },
  },
  {
    id: "007",
    backendId: "pay_007",
    label: "Payment 007",
    method: "card",
    amount: 15000,
    customer: "Customer 007",
    card: {
      number: "5555 5555 5555 4444",
      expiry: "11 / 28",
      cvv: "456",
      name: "CUSTOMER 007",
    },
  },
  {
    id: "008",
    backendId: "pay_008",
    label: "Payment 008",
    method: "card",
    amount: 9800,
    customer: "Customer 008",
    card: {
      number: "4000 0000 0000 0069",
      expiry: "04 / 27",
      cvv: "789",
      name: "CUSTOMER 008",
    },
  },
  {
    id: "009",
    backendId: "pay_009",
    label: "Payment 009",
    method: "card",
    amount: 7200,
    customer: "Customer 009",
    card: {
      number: "4242 4242 4242 4242",
      expiry: "07 / 29",
      cvv: "321",
      name: "CUSTOMER 009",
    },
  },
  {
    id: "010",
    backendId: "pay_010",
    label: "Payment 010",
    method: "card",
    amount: 25000,
    customer: "Customer 010",
    card: {
      number: "4000 0000 0000 0101",
      expiry: "10 / 28",
      cvv: "654",
      name: "CUSTOMER 010",
    },
  },
  {
    id: "011",
    backendId: "pay_011",
    label: "Payment 011",
    method: "upi",
    amount: 11000,
    customer: "Customer 011",
    upi: { id: "customer011@okhdfcbank" },
  },
  {
    id: "012",
    backendId: "pay_012",
    label: "Payment 012",
    method: "card",
    amount: 5600,
    customer: "Customer 012",
    card: {
      number: "4000 0000 0000 0127",
      expiry: "12 / 29",
      cvv: "987",
      name: "CUSTOMER 012",
    },
  },
];

function formatAmount(amount: number | string | undefined) {
  if (amount === undefined || amount === null || amount === "") {
    return "₹0";
  }

  if (typeof amount === "number") {
    return `₹${amount.toLocaleString("en-IN")}`;
  }

  const cleaned = amount.replace(/[₹,\s]/g, "").trim();
  const numericAmount = Number(cleaned);

  if (Number.isNaN(numericAmount)) {
    return amount.startsWith("₹") ? amount : `₹${amount}`;
  }

  return `₹${numericAmount.toLocaleString("en-IN")}`;
}

function CustomerView({ paymentId, onBack }: CustomerViewProps) {
  const initialSetId = paymentId
    ? PAYMENT_SETS.find((item) => item.backendId === paymentId)?.id ?? "001"
    : "001";

  const [selectedSetId, setSelectedSetId] = useState(initialSetId);
  const [stage, setStage] = useState<PaymentStage>("payment");
  const [attemptingPayment, setAttemptingPayment] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedPaymentSet =
    PAYMENT_SETS.find((item) => item.id === selectedSetId) ?? PAYMENT_SETS[0];

  useEffect(() => {
    if (!paymentId) return;

    const matchingSet = PAYMENT_SETS.find(
      (item) => item.backendId === paymentId
    );

    if (matchingSet) {
      setSelectedSetId(matchingSet.id);
    }
  }, [paymentId]);

  const handlePaymentSetChange = (newSetId: string) => {
    setSelectedSetId(newSetId);
    setStage("payment");
    setAttemptingPayment(false);
    setResult(null);
    setErrorMessage("");
  };

  const handlePay = async () => {
    if (attemptingPayment || stage !== "payment") return;

    setAttemptingPayment(true);
    setErrorMessage("");
    setStage("processing");

    try {
      // Load Razorpay Checkout if it is not already available.
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const existingScript = document.querySelector(
            'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
          );

          if (existingScript) {
            existingScript.addEventListener("load", () => resolve(), {
              once: true,
            });
            existingScript.addEventListener("error", () => {
              reject(new Error("Razorpay Checkout failed to load."));
            }, { once: true });
            return;
          }

          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Razorpay Checkout failed to load."));
          document.body.appendChild(script);
        });
      }

      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout is unavailable.");
      }

      // Create the Razorpay order on the backend.
      const response = await fetch(`${API_URL}/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: selectedPaymentSet.amount,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.order) {
        throw new Error(
          data.message || "Unable to create Razorpay order."
        );
      }

      const options = {
        key: data.key_id,
        amount: data.order.amount,
        currency: data.order.currency,
        name: "Acme Store",
        description: `Payment ${selectedPaymentSet.id}`,
        order_id: data.order.id,

        prefill: {
          name: selectedPaymentSet.customer,
          ...(method === "upi" && selectedPaymentSet.upi
            ? { email: `${selectedPaymentSet.id}@demo.test` }
            : {}),
        },

        theme: {
          color: "#2563eb",
        },

        handler: (paymentResponse: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          console.log("Razorpay test payment successful:", paymentResponse);

          // For now, only confirm that Checkout completed.
          // Backend payment verification + merchant activity update
          // will be connected in the next step.
          setStage("recovered");
          setAttemptingPayment(false);
        },

        modal: {
          ondismiss: () => {
            setStage("payment");
            setAttemptingPayment(false);
          },
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on("payment.failed", (paymentError: any) => {
        console.error("Razorpay payment failed:", paymentError);

        setErrorMessage(
          paymentError?.error?.description ||
            "Razorpay payment failed."
        );
        setStage("payment");
        setAttemptingPayment(false);
      });

      razorpay.open();
    } catch (err) {
      console.error("Razorpay checkout error:", err);

      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Unable to start Razorpay Checkout."
      );
      setStage("payment");
      setAttemptingPayment(false);
    }
  };

  const amount = formatAmount(selectedPaymentSet.amount);
  const method = selectedPaymentSet.method;
  const decision = result?.decision ?? result?.payment?.decision ?? "";
  const action = result?.action ?? result?.payment?.action ?? "";
  const agentReason = result?.reason ?? result?.payment?.agent_reason ?? "";
  const recovered = result?.recovered === true;

  const methodName =
    method === "card"
      ? "Card"
      : method === "upi"
        ? "UPI"
        : "Netbanking";

  const methodDescription =
    method === "card"
      ? "Credit or debit card"
      : method === "upi"
        ? "Pay using your UPI ID"
        : "Pay directly from your bank";

  const paymentButtonText =
    method === "card"
      ? `Pay ${amount}`
      : method === "upi"
        ? `Pay ${amount} with UPI`
        : `Continue to payment`;

  return (
    <div className="customer-page">
      <header className="customer-header">
        <div className="customer-brand">
          <div className="customer-brand-mark">R</div>
          <span>Razorpay</span>
        </div>

        <div className="customer-secure">
          <span className="secure-dot" />
          Secure payment
        </div>
      </header>

      <main className="customer-main">
        <div className="customer-card">
          <div
            style={{
              marginBottom: "24px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#f7f8fa",
              border: "1px solid #e7e9ed",
            }}
          >
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "7px",
                fontSize: "11px",
                fontWeight: 600,
                color: "#6b7280",
              }}
            >
              DEMO PAYMENT

              <select
                value={selectedSetId}
                disabled={attemptingPayment}
                onChange={(event) =>
                  handlePaymentSetChange(event.target.value)
                }
                disabled={attemptingPayment || stage !== "payment"}
                style={{
                  width: "100%",
                  height: "40px",
                  padding: "0 10px",
                  borderRadius: "8px",
                  border: "1px solid #dfe2e7",
                  background: "#ffffff",
                  color: "#202124",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {PAYMENT_SETS.map((paymentSet) => (
                  <option key={paymentSet.id} value={paymentSet.id}>
                    {paymentSet.label} · {paymentSet.method.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {stage === "processing" && (
            <div style={{ textAlign: "center", padding: "55px 10px" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  margin: "0 auto 20px",
                  border: "3px solid #e5e7eb",
                  borderTopColor: "#2563eb",
                  borderRadius: "50%",
                  animation: "customer-spin 0.8s linear infinite",
                }}
              />
              <h1 style={{ margin: "0 0 8px", fontSize: "20px", color: "#17191c" }}>
                Processing payment
              </h1>
              <p style={{ margin: 0, color: "#737b87", fontSize: "13px" }}>
                Please wait while we process your payment securely.
              </p>
            </div>
          )}

          {stage === "failed" && (
            <div>
              <div style={{ textAlign: "center", padding: "22px 5px 25px" }}>
                <div
                  style={{
                    width: "52px",
                    height: "52px",
                    margin: "0 auto 16px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: "23px",
                    fontWeight: 700,
                  }}
                >
                  !
                </div>
                <h1 style={{ margin: "0 0 8px", fontSize: "21px", color: "#17191c" }}>
                  Payment failed
                </h1>
                <p
                  style={{
                    margin: "0 auto",
                    maxWidth: "350px",
                    color: "#737b87",
                    fontSize: "13px",
                    lineHeight: 1.5,
                  }}
                >
                  We couldn't complete this payment. Our recovery system is checking the safest next step.
                </p>
              </div>

              <div
                style={{
                  padding: "14px",
                  borderRadius: "10px",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  color: "#9a3412",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  marginBottom: "18px",
                }}
              >
                <strong>Don't worry.</strong> The recovery agent is reviewing this payment.
              </div>
            </div>
          )}

          {stage === "agent" && (
            <div>
              <div style={{ padding: "4px 0 22px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "18px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#eff6ff",
                      color: "#2563eb",
                      fontWeight: 700,
                    }}
                  >
                    ✦
                  </div>
                  <div>
                    <strong style={{ display: "block", fontSize: "14px", color: "#202124" }}>
                      Recovery agent
                    </strong>
                    <span style={{ display: "block", marginTop: "3px", fontSize: "11px", color: "#737b87" }}>
                      Analyzing the failed payment
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: "#f7f8fa",
                    color: "#596170",
                    fontSize: "12px",
                    lineHeight: 1.55,
                  }}
                >
                  The agent identified the safest recovery action for this payment.
                </div>
              </div>

              <div
                style={{
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  marginBottom: "18px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "10px",
                    color: "#9299a3",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: "6px",
                  }}
                >
                  Agent action
                </span>
                <strong style={{ fontSize: "13px", color: "#202124" }}>
                  {action || "Reviewing payment"}
                </strong>
              </div>
            </div>
          )}

          {stage === "result" && (
            <div style={{ textAlign: "center", padding: "22px 5px 20px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  margin: "0 auto 18px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: recovered ? "#dcfce7" : "#fff7ed",
                  color: recovered ? "#16a34a" : "#c2410c",
                  fontSize: "25px",
                  fontWeight: 700,
                }}
              >
                {recovered ? "✓" : "!"}
              </div>

              <h1 style={{ margin: "0 0 8px", fontSize: "22px", color: "#17191c" }}>
                {recovered ? "Payment recovered" : "Payment needs attention"}
              </h1>

              <p
                style={{
                  margin: "0 auto",
                  maxWidth: "360px",
                  color: "#737b87",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {recovered
                  ? `Your payment of ${amount} was successfully recovered by the recovery agent.`
                  : `Your payment of ${amount} could not be recovered automatically.`}
              </p>

              <div
                style={{
                  marginTop: "22px",
                  padding: "14px",
                  borderRadius: "10px",
                  background: "#f7f8fa",
                  textAlign: "left",
                }}
              >
                <span style={{ display: "block", fontSize: "10px", color: "#9299a3", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
                  Agent decision
                </span>
                <strong style={{ display: "block", fontSize: "13px", color: "#202124", marginBottom: "5px" }}>
                  {decision || "Decision recorded"}
                </strong>
                <span style={{ display: "block", fontSize: "11px", color: "#737b87", lineHeight: 1.5 }}>
                  {agentReason || action || "The payment outcome has been recorded."}
                </span>
              </div>
            </div>
          )}

          {stage === "payment" && (
            <>
              <div className="customer-merchant">
                <span className="merchant-label">PAYING TO</span>
                <strong>Acme Store</strong>
                <span className="customer-payment-id">
                  {selectedPaymentSet.backendId}
                </span>
              </div>

              <div className="customer-amount">
                <span>Amount</span>
                <strong>{amount}</strong>
              </div>

              <div className="customer-divider" />

              <div className="customer-payment-heading">
                <h1>Complete your payment</h1>
                <p>Choose a payment method to continue.</p>
              </div>

              <div className="payment-method-list">
                <div className="customer-method selected" style={{ cursor: "default" }}>
                  <div className="method-left">
                    <div className="method-icon">
                      {method === "card" ? "▣" : method === "upi" ? "U" : "🏦"}
                    </div>
                    <div>
                      <strong>{methodName}</strong>
                      <span>{methodDescription}</span>
                    </div>
                  </div>
                  <div className="method-check">✓</div>
                </div>
              </div>

              <div className="selected-method-description">
                Demo payment <strong>{selectedPaymentSet.id}</strong> · details are pre-filled
              </div>

              {method === "card" && selectedPaymentSet.card && (
                <div className="customer-form">
                  <label>
                    Card number
                    <div className="input-wrap">
                      <input type="text" value={selectedPaymentSet.card.number} readOnly />
                    </div>
                  </label>

                  <div className="customer-form-row">
                    <label>
                      Expiry date
                      <div className="input-wrap">
                        <input type="text" value={selectedPaymentSet.card.expiry} readOnly />
                      </div>
                    </label>
                    <label>
                      CVV
                      <div className="input-wrap">
                        <input type="password" value={selectedPaymentSet.card.cvv} readOnly />
                      </div>
                    </label>
                  </div>

                  <label>
                    Cardholder name
                    <div className="input-wrap">
                      <input type="text" value={selectedPaymentSet.card.name} readOnly />
                    </div>
                  </label>
                </div>
              )}

              {method === "upi" && selectedPaymentSet.upi && (
                <div className="customer-form">
                  <label>
                    UPI ID
                    <div className="input-wrap">
                      <input type="text" value={selectedPaymentSet.upi.id} readOnly />
                    </div>
                  </label>
                  <div className="method-helper">
                    Payment details are already filled for this demo payment.
                  </div>
                </div>
              )}

              {method === "netbanking" && selectedPaymentSet.netbanking && (
                <div className="customer-form">
                  <label>
                    Select your bank
                    <div className="input-wrap">
                      <select className="customer-select" value={selectedPaymentSet.netbanking.bank} disabled>
                        <option>{selectedPaymentSet.netbanking.bank}</option>
                      </select>
                    </div>
                  </label>
                  <div className="method-helper">
                    Payment details are already filled for this demo payment.
                  </div>
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    marginTop: "15px",
                    padding: "12px 13px",
                    borderRadius: "9px",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: "11px",
                  }}
                >
                  {errorMessage}
                </div>
              )}

              <button
                className="customer-pay-button"
                type="button"
                onClick={handlePay}
                disabled={attemptingPayment}
              >
                <span>{paymentButtonText}</span>
                <span>→</span>
              </button>

              <div className="customer-footer">
                <span>🔒</span>
                Payments are securely processed by Razorpay
              </div>
            </>
          )}
        </div>

        <button className="customer-back-button" onClick={onBack} type="button">
          ← Back to merchant dashboard
        </button>
      </main>

      <style>
        {`
          @keyframes customer-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default CustomerView;

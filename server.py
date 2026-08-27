from flask import Flask, jsonify
from flask_cors import CORS
import json
import os
from copy import deepcopy

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data", "payments.json")
RECOVERY_LOG_FILE = os.path.join(BASE_DIR, "data", "recovery_log.json")

MAX_RETRIES = 2


# ---------------------------------------------------------
# 12-PAYMENT DEMO BASELINE
# ---------------------------------------------------------

INITIAL_DEMO_PAYMENTS = [
    {
        "payment_id": "pay_001",
        "customer_id": "cust_001",
        "amount": 5000,
        "status": "success",
        "bank": "HDFC",
        "method": "upi"
    },
    {
        "payment_id": "pay_002",
        "customer_id": "cust_002",
        "amount": 12000,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "bank_server_error"
    },
    {
        "payment_id": "pay_003",
        "customer_id": "cust_003",
        "amount": 8000,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "network_error"
    },
    {
        "payment_id": "pay_004",
        "customer_id": "cust_004",
        "amount": 3200,
        "status": "failed",
        "bank": "ICICI",
        "method": "card",
        "failure_reason": "gateway_timeout"
    },
    {
        "payment_id": "pay_005",
        "customer_id": "cust_005",
        "amount": 6500,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "upi_timeout"
    },
    {
        "payment_id": "pay_006",
        "customer_id": "cust_006",
        "amount": 4100,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "upi_pending"
    },
    {
        "payment_id": "pay_007",
        "customer_id": "cust_007",
        "amount": 15000,
        "status": "failed",
        "bank": "SBI",
        "method": "card",
        "failure_reason": "insufficient_funds"
    },
    {
        "payment_id": "pay_008",
        "customer_id": "cust_008",
        "amount": 9800,
        "status": "failed",
        "bank": "ICICI",
        "method": "card",
        "failure_reason": "expired_card"
    },
    {
        "payment_id": "pay_009",
        "customer_id": "cust_009",
        "amount": 7200,
        "status": "failed",
        "bank": "HDFC",
        "method": "card",
        "failure_reason": "authentication_failed"
    },
    {
        "payment_id": "pay_010",
        "customer_id": "cust_010",
        "amount": 25000,
        "status": "failed",
        "bank": "SBI",
        "method": "card",
        "failure_reason": "payment_limit_exceeded"
    },
    {
        "payment_id": "pay_011",
        "customer_id": "cust_011",
        "amount": 11000,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "duplicate_payment_risk"
    },
    {
        "payment_id": "pay_012",
        "customer_id": "cust_012",
        "amount": 5600,
        "status": "failed",
        "bank": "UNKNOWN",
        "method": "card",
        "failure_reason": "unrecognized_processor_error"
    }
]


# ---------------------------------------------------------
# FILE HELPERS
# ---------------------------------------------------------

def load_payments():
    if not os.path.exists(DATA_FILE):
        reset_demo_data()

    with open(DATA_FILE, "r") as file:
        return json.load(file)


def save_payments(payments):
    with open(DATA_FILE, "w") as file:
        json.dump(payments, file, indent=2)


def load_recovery_log():
    if not os.path.exists(RECOVERY_LOG_FILE):
        return []

    try:
        with open(RECOVERY_LOG_FILE, "r") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return []


def save_recovery_log(log):
    with open(RECOVERY_LOG_FILE, "w") as file:
        json.dump(log, file, indent=2)


def reset_demo_data():
    payments = deepcopy(INITIAL_DEMO_PAYMENTS)

    save_payments(payments)
    save_recovery_log([])

    return payments


# ---------------------------------------------------------
# AGENT DECISION ENGINE
# ---------------------------------------------------------

def decide_action(payment):
    reason = payment.get("failure_reason", "").lower()
    retry_attempts = payment.get("retry_attempts", 0)

    # Temporary bank/server failures
    if reason in {
        "bank_server_error",
        "network_error"
    }:
        if retry_attempts < MAX_RETRIES:
            return {
                "decision": "RETRY",
                "action": "Payment retried",
                "reason": "Temporary bank or network failure can be safely retried."
            }

        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": "Maximum retry limit reached; another immediate retry could be unsafe."
        }

    # Gateway timeout
    if reason == "gateway_timeout":
        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": "Gateway response timed out, so the final payment state is uncertain."
        }

    # UPI timeout
    if reason == "upi_timeout":
        if retry_attempts < MAX_RETRIES:
            return {
                "decision": "RETRY",
                "action": "Retry payment once",
                "reason": "Temporary UPI timeout can be retried without immediately requiring customer action."
            }

        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": "Retry limit reached; the agent will avoid repeated payment attempts."
        }

    # UPI pending
    if reason == "upi_pending":
        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": "The UPI payment may still complete, so another payment attempt could create a duplicate."
        }

    # Customer needs to resolve funding
    if reason == "insufficient_funds":
        return {
            "decision": "NOTIFY_CUSTOMER",
            "action": "Notify customer to retry payment",
            "reason": "Insufficient funds require customer action before another payment attempt."
        }

    # Expired card
    if reason == "expired_card":
        return {
            "decision": "REQUEST_PAYMENT_METHOD_UPDATE",
            "action": "Request a new payment method",
            "reason": "The card has expired, so the customer needs to provide another payment method."
        }

    # Authentication issue
    if reason == "authentication_failed":
        return {
            "decision": "NOTIFY_CUSTOMER",
            "action": "Notify customer to complete payment authentication",
            "reason": "Customer authentication must be completed before the payment can proceed."
        }

    # Payment limit
    if reason == "payment_limit_exceeded":
        return {
            "decision": "NOTIFY_CUSTOMER",
            "action": "Notify customer to complete payment action",
            "reason": "The payment limit must be resolved before another automated attempt."
        }

    # Duplicate protection
    if reason == "duplicate_payment_risk":
        return {
            "decision": "STOP",
            "action": "Stop recovery to prevent duplicate charge",
            "reason": "Possible duplicate-payment risk requires no further automated retry."
        }

    # Unknown/unrecognized issue
    return {
        "decision": "MANUAL_REVIEW",
        "action": "Send to manual review",
        "reason": "The failure type is not recognized as safe for automated recovery."
    }


# ---------------------------------------------------------
# HEALTH
# ---------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "success": True,
        "message": "Recovery agent backend is running"
    })


# ---------------------------------------------------------
# GET PAYMENTS
# ---------------------------------------------------------

@app.route("/payments", methods=["GET"])
def get_payments():
    return jsonify(load_payments())


# ---------------------------------------------------------
# RUN AGENT
# ---------------------------------------------------------

@app.route("/run-agent", methods=["POST"])
def run_agent():

    payments = load_payments()
    # The decision log represents the latest agent run.
    recovery_log = []

    recovered = []
    at_risk = []

    for payment in payments:

        # Only process failed payments
        if payment.get("status") != "failed":
            continue

        # Existing retry count
        retry_attempts = payment.get("retry_attempts", 0)

        decision = decide_action(payment)

        # ---------------------------------------------
        # RETRY
        # ---------------------------------------------

        if decision["decision"] == "RETRY":

            if retry_attempts >= MAX_RETRIES:
                decision = {
                    "decision": "CHECK_LATER",
                    "action": "Wait and check payment status later",
                    "reason": "Maximum retry limit reached."
                }

            else:
                payment["retry_attempts"] = retry_attempts + 1

                # Demo simulation:
                # successful retry means payment becomes recovered.
                payment["status"] = "success"
                payment["recovered_by_agent"] = True
                payment["action"] = decision["action"]
                payment["decision"] = decision["decision"]
                payment["agent_decision"] = decision["decision"]
                payment["agent_reason"] = decision["reason"]

                recovered.append(payment)

                recovery_log.append({
                    "payment_id": payment["payment_id"],
                    "customer_id": payment.get("customer_id"),
                    "decision": decision["decision"],
                    "action": decision["action"],
                    "result": "Recovered",
                    "retry_attempt": payment["retry_attempts"],
                    "reason": decision["reason"]
                })

                continue

        # ---------------------------------------------
        # ALL OTHER DECISIONS
        # ---------------------------------------------

        payment["decision"] = decision["decision"]
        payment["agent_decision"] = decision["decision"]
        payment["action"] = decision["action"]
        payment["agent_reason"] = decision["reason"]

        if decision["decision"] == "CHECK_LATER":
            payment["status"] = "failed"

        else:
            payment["status"] = "failed"

        at_risk.append(payment)

        recovery_log.append({
            "payment_id": payment["payment_id"],
            "customer_id": payment.get("customer_id"),
            "decision": decision["decision"],
            "action": decision["action"],
            "result": "At Risk",
            "retry_attempt": (
                f"Retry {payment.get('retry_attempts', 0)} of {MAX_RETRIES}"
                if payment.get("retry_attempts", 0) > 0
                else "No retry attempted"
            ),
            "reason": decision["reason"]
        })

    save_payments(payments)
    save_recovery_log(recovery_log)

    # Keep the API contract consistent for the frontend.
    for payment in payments:
        if payment.get("decision") and not payment.get("agent_decision"):
            payment["agent_decision"] = payment["decision"]

    # Return the normalized objects as part of the response.
    recovered = [p for p in payments if p.get("recovered_by_agent") is True]
    at_risk = [p for p in payments if p.get("status") == "failed"]
    save_payments(payments)

    return jsonify({
        "success": True,
        "recovered": recovered,
        "at_risk": at_risk,
        "message": f"Agent reviewed {len(payments)} payments.",
        "summary": {
            "payments_reviewed": len(payments),
            "recovered": len(recovered),
            "needs_attention": len(at_risk)
        }
    })


# ---------------------------------------------------------
# RESET DEMO
# ---------------------------------------------------------

@app.route("/reset-demo", methods=["POST"])
def reset_demo():

    payments = reset_demo_data()

    return jsonify({
        "success": True,
        "payments": payments,
        "message": "Demo data reset successfully."
    })


# ---------------------------------------------------------
# START SERVER
# ---------------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
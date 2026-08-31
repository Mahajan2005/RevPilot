import os
import json
from copy import deepcopy
from datetime import datetime

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from groq import Groq
import razorpay


# =========================================================
# APP SETUP
# =========================================================

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Always load the .env file beside server.py, regardless
# of the terminal's current working directory.
load_dotenv(os.path.join(BASE_DIR, ".env"))


# =========================================================
# API CLIENTS
# =========================================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

groq_client = (
    Groq(api_key=GROQ_API_KEY)
    if GROQ_API_KEY
    else None
)

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

razorpay_client = (
    razorpay.Client(
        auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
    )
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
    else None
)


# =========================================================
# CONFIGURATION
# =========================================================

DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "payments.json")
RECOVERY_LOG_FILE = os.path.join(DATA_DIR, "recovery_log.json")

MAX_RETRIES = 2


# =========================================================
# CUSTOMER-SIDE DEMO PAYMENT CATALOG
# =========================================================

INITIAL_DEMO_PAYMENTS = [
    {
        "payment_id": "pay_001",
        "customer_id": "cust_001",
        "amount": 5000,
        "status": "success",
        "bank": "HDFC",
        "method": "upi",
    },
    {
        "payment_id": "pay_002",
        "customer_id": "cust_002",
        "amount": 12000,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "bank_server_error",
    },
    {
        "payment_id": "pay_003",
        "customer_id": "cust_003",
        "amount": 8000,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "network_error",
    },
    {
        "payment_id": "pay_004",
        "customer_id": "cust_004",
        "amount": 3200,
        "status": "failed",
        "bank": "ICICI",
        "method": "card",
        "failure_reason": "gateway_timeout",
    },
    {
        "payment_id": "pay_005",
        "customer_id": "cust_005",
        "amount": 6500,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "upi_timeout",
    },
    {
        "payment_id": "pay_006",
        "customer_id": "cust_006",
        "amount": 4100,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "upi_pending",
    },
    {
        "payment_id": "pay_007",
        "customer_id": "cust_007",
        "amount": 15000,
        "status": "failed",
        "bank": "SBI",
        "method": "card",
        "failure_reason": "insufficient_funds",
    },
    {
        "payment_id": "pay_008",
        "customer_id": "cust_008",
        "amount": 9800,
        "status": "failed",
        "bank": "ICICI",
        "method": "card",
        "failure_reason": "expired_card",
    },
    {
        "payment_id": "pay_009",
        "customer_id": "cust_009",
        "amount": 7200,
        "status": "failed",
        "bank": "HDFC",
        "method": "card",
        "failure_reason": "authentication_failed",
    },
    {
        "payment_id": "pay_010",
        "customer_id": "cust_010",
        "amount": 25000,
        "status": "failed",
        "bank": "SBI",
        "method": "card",
        "failure_reason": "payment_limit_exceeded",
    },
    {
        "payment_id": "pay_011",
        "customer_id": "cust_011",
        "amount": 11000,
        "status": "failed",
        "bank": "HDFC",
        "method": "upi",
        "failure_reason": "duplicate_payment_risk",
    },
    {
        "payment_id": "pay_012",
        "customer_id": "cust_012",
        "amount": 5600,
        "status": "failed",
        "bank": "UNKNOWN",
        "method": "card",
        "failure_reason": "unrecognized_processor_error",
    },
]


# =========================================================
# FILE HELPERS
# =========================================================

def ensure_data_directory():
    os.makedirs(DATA_DIR, exist_ok=True)


def load_payments():
    ensure_data_directory()

    if not os.path.exists(DATA_FILE):
        reset_demo_data()

    try:
        with open(DATA_FILE, "r") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return []


def save_payments(payments):
    ensure_data_directory()

    with open(DATA_FILE, "w") as file:
        json.dump(payments, file, indent=2)


def load_recovery_log():
    ensure_data_directory()

    if not os.path.exists(RECOVERY_LOG_FILE):
        return []

    try:
        with open(RECOVERY_LOG_FILE, "r") as file:
            return json.load(file)
    except (json.JSONDecodeError, OSError):
        return []


def save_recovery_log(log):
    ensure_data_directory()

    with open(RECOVERY_LOG_FILE, "w") as file:
        json.dump(log, file, indent=2)


def reset_demo_data():
    """
    Merchant activity starts empty.

    Customer scenarios remain available through
    INITIAL_DEMO_PAYMENTS.
    """

    payments = []

    save_payments(payments)
    save_recovery_log([])

    return payments


# =========================================================
# CHECKOUT RECOVERY — GROQ
# =========================================================

def generate_checkout_recovery(payment):
    """
    Uses Groq to decide the best customer-facing
    recovery intervention for an abandoned checkout.
    """

    cart = payment.get("cart", [])
    amount = payment.get("amount", 0)

    item_count = 0

    for item in cart:
        try:
            quantity = int(item.get("quantity", 1))
        except (TypeError, ValueError):
            quantity = 1

        item_count += quantity

    cart_summary = []

    for item in cart:
        name = (
            item.get("name")
            or item.get("title")
            or "Product"
        )

        quantity = item.get("quantity", 1)

        price = (
            item.get("price")
            or item.get("unit_price")
            or 0
        )

        cart_summary.append({
            "name": name,
            "quantity": quantity,
            "price": price,
        })

    if not groq_client:
        raise RuntimeError(
            "Groq is not configured; the recovery agent cannot generate "
            "a customer intervention."
        )


    prompt = f"""
You are a checkout recovery agent for an ecommerce store.

A customer started checkout but abandoned it before payment.

Your job is to decide the most appropriate,
NON-PUSHY way to bring the customer back.

CUSTOMER CHECKOUT DATA:

Cart value: ₹{amount}

Number of items: {item_count}

Cart items:
{json.dumps(cart_summary, ensure_ascii=False)}

IMPORTANT RULES:

1. Do NOT mention AI, agents, models, algorithms,
   prediction, backend systems, or merchant dashboards.

2. The customer should receive a natural,
   thoughtful message from the store.

3. Do NOT invent discounts, coupons, free shipping,
   stock scarcity, deadlines, or benefits.

4. Do not guilt-trip the customer.

5. Keep the message short and human.

6. Base the message on the actual cart.

7. Choose ONE suggested action:

   RETURN_TO_CHECKOUT
   KEEP_CART_SAVED
   ABANDON

8. Prefer RETURN_TO_CHECKOUT when there is strong
   purchase intent.

9. Use KEEP_CART_SAVED when the customer may simply
   need more time.

10. Use ABANDON only when recovery would clearly
    be inappropriate.

Return ONLY valid JSON in exactly this structure:

{{
    "decision": "RE_ENGAGE",
    "action": "short internal action description",
    "reason": "short internal reason",
    "customer_title": "short customer-facing title",
    "customer_message": "natural customer-facing message",
    "suggested_action": "RETURN_TO_CHECKOUT",
    "suggested_action_label": "short button label"
}}
"""

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a careful ecommerce recovery "
                        "decision engine. Return valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.7,
            max_completion_tokens=800,
            response_format={
                "type": "json_object"
            },
        )

        content = response.choices[0].message.content.strip()

        if content.startswith("```"):
            content = content.replace("```json", "")
            content = content.replace("```", "")
            content = content.strip()

        result = json.loads(content)

        required_fields = [
            "decision",
            "action",
            "reason",
            "customer_title",
            "customer_message",
            "suggested_action",
            "suggested_action_label",
        ]

        for field in required_fields:
            if not result.get(field):
                raise ValueError(
                    f"Missing LLM field: {field}"
                )

        allowed_actions = {
            "RETURN_TO_CHECKOUT",
            "KEEP_CART_SAVED",
            "ABANDON",
        }

        if result["suggested_action"] not in allowed_actions:
            raise ValueError(
                "The recovery agent returned an unsupported customer action."
            )

        return result

    except Exception as error:
        print(
            "Checkout recovery LLM error:",
            error
        )
        raise RuntimeError(
            "The recovery agent could not generate a customer intervention."
        ) from error


# =========================================================
# SUBSCRIPTION RECOVERY
# =========================================================

def generate_subscription_recovery(payment):
    """
    Handles a failed subscription renewal.

    The demo intentionally avoids automatically charging
    the customer again. The agent recommends a safe
    customer-facing recovery action.
    """

    return {
        "decision": "NOTIFY_CUSTOMER",
        "action": "Ask customer to update or retry payment",
        "reason": (
            "The recurring renewal failed. The safest recovery "
            "path is to notify the customer and let them resolve "
            "the payment issue."
        ),
        "customer_title": "Your subscription needs attention",
        "customer_message": (
            "Your Pro Workspace renewal didn't go through. "
            "Update your payment method or try again to keep "
            "your plan active."
        ),
        "suggested_action": "UPDATE_PAYMENT_METHOD",
        "suggested_action_label": "Fix payment",
    }


# =========================================================
# PROMISE TO PAY RECOVERY
# =========================================================

def generate_promise_recovery(payment):
    """
    Evaluates a missed promise-to-pay event.
    """

    return {
        "decision": "NOTIFY_CUSTOMER",
        "action": "Send a payment reminder",
        "reason": (
            "The customer committed to a payment but the "
            "promised payment was not received."
        ),
        "customer_title": "Payment reminder",
        "customer_message": (
            "Your promised payment is still pending. "
            "Please complete the payment when you're ready."
        ),
        "suggested_action": "SEND_REMINDER",
        "suggested_action_label": "Send reminder",
    }


# =========================================================
# AGENT DECISION ENGINE
# =========================================================

def decide_action(payment):

    reason = payment.get(
        "failure_reason",
        ""
    ).lower()

    retry_attempts = payment.get(
        "retry_attempts",
        0
    )

    # -----------------------------------------------------
    # CHECKOUT ABANDONMENT
    # -----------------------------------------------------

    if reason == "checkout_abandoned":
        return generate_checkout_recovery(payment)

    # -----------------------------------------------------
    # SUBSCRIPTION FAILURE
    # -----------------------------------------------------

    if reason == "subscription_payment_failed":
        return generate_subscription_recovery(payment)

    # -----------------------------------------------------
    # PROMISE TO PAY
    # -----------------------------------------------------

    if reason == "promise_missed":
        return generate_promise_recovery(payment)

    # -----------------------------------------------------
    # TEMPORARY BANK/SERVER FAILURES
    # -----------------------------------------------------

    if reason in {
        "bank_server_error",
        "network_error",
    }:

        if retry_attempts < MAX_RETRIES:
            return {
                "decision": "RETRY",
                "action": "Payment retried",
                "reason": (
                    "Temporary bank or network failure can "
                    "be safely retried."
                ),
            }

        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": (
                "Maximum retry limit reached; another immediate "
                "retry could be unsafe."
            ),
        }

    # -----------------------------------------------------
    # GATEWAY TIMEOUT
    # -----------------------------------------------------

    if reason == "gateway_timeout":
        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": (
                "Gateway response timed out, so the final "
                "payment state is uncertain."
            ),
        }

    # -----------------------------------------------------
    # UPI TIMEOUT
    # -----------------------------------------------------

    if reason == "upi_timeout":

        if retry_attempts < MAX_RETRIES:
            return {
                "decision": "RETRY",
                "action": "Retry payment once",
                "reason": (
                    "Temporary UPI timeout can be retried "
                    "without immediately requiring customer action."
                ),
            }

        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": (
                "Retry limit reached; the agent will avoid "
                "repeated payment attempts."
            ),
        }

    # -----------------------------------------------------
    # UPI PENDING
    # -----------------------------------------------------

    if reason == "upi_pending":
        return {
            "decision": "CHECK_LATER",
            "action": "Wait and check payment status later",
            "reason": (
                "The UPI payment may still complete, so another "
                "payment attempt could create a duplicate."
            ),
        }

    # -----------------------------------------------------
    # INSUFFICIENT FUNDS
    # -----------------------------------------------------

    if reason == "insufficient_funds":
        return {
            "decision": "NOTIFY_CUSTOMER",
            "action": "Notify customer to retry payment",
            "reason": (
                "Insufficient funds require customer action "
                "before another payment attempt."
            ),
        }

    # -----------------------------------------------------
    # EXPIRED CARD
    # -----------------------------------------------------

    if reason == "expired_card":
        return {
            "decision": "REQUEST_PAYMENT_METHOD_UPDATE",
            "action": "Request a new payment method",
            "reason": (
                "The card has expired, so the customer needs "
                "to provide another payment method."
            ),
        }

    # -----------------------------------------------------
    # AUTHENTICATION
    # -----------------------------------------------------

    if reason == "authentication_failed":
        return {
            "decision": "NOTIFY_CUSTOMER",
            "action": (
                "Notify customer to complete payment authentication"
            ),
            "reason": (
                "Customer authentication must be completed "
                "before the payment can proceed."
            ),
        }

    # -----------------------------------------------------
    # PAYMENT LIMIT
    # -----------------------------------------------------

    if reason == "payment_limit_exceeded":
        return {
            "decision": "NOTIFY_CUSTOMER",
            "action": "Notify customer to complete payment action",
            "reason": (
                "The payment limit must be resolved before "
                "another automated attempt."
            ),
        }

    # -----------------------------------------------------
    # DUPLICATE PROTECTION
    # -----------------------------------------------------

    if reason == "duplicate_payment_risk":
        return {
            "decision": "STOP",
            "action": (
                "Stop recovery to prevent duplicate charge"
            ),
            "reason": (
                "Possible duplicate-payment risk requires "
                "no further automated retry."
            ),
        }

    # -----------------------------------------------------
    # UNKNOWN ISSUE
    # -----------------------------------------------------

    return {
        "decision": "MANUAL_REVIEW",
        "action": "Send to manual review",
        "reason": (
            "The failure type is not recognized as safe "
            "for automated recovery."
        ),
    }


# =========================================================
# PROCESS ONE PAYMENT
# =========================================================

def process_payment_with_agent(payment):

    retry_attempts = payment.get(
        "retry_attempts",
        0
    )

    decision = decide_action(payment)

    # -----------------------------------------------------
    # CHECKOUT ABANDONMENT
    # -----------------------------------------------------

    if payment.get("failure_reason") == "checkout_abandoned":

        payment["decision"] = decision["decision"]
        payment["agent_decision"] = decision["decision"]
        payment["action"] = decision["action"]
        payment["agent_reason"] = decision["reason"]

        payment["customer_title"] = decision.get(
            "customer_title"
        )

        payment["customer_message"] = decision.get(
            "customer_message"
        )

        payment["suggested_action"] = decision.get(
            "suggested_action"
        )

        payment["suggested_action_label"] = decision.get(
            "suggested_action_label"
        )

        payment["recovered_by_agent"] = False
        payment["status"] = "checkout_abandoned"

        return {
            "result": "Recovery Intervention",
            "retry_attempt": "No payment retry",
            **decision,
        }

    # -----------------------------------------------------
    # SUBSCRIPTION RECOVERY
    # -----------------------------------------------------

    if payment.get("failure_reason") == "subscription_payment_failed":

        payment["decision"] = decision["decision"]
        payment["agent_decision"] = decision["decision"]
        payment["action"] = decision["action"]
        payment["agent_reason"] = decision["reason"]

        payment["customer_title"] = decision.get(
            "customer_title"
        )

        payment["customer_message"] = decision.get(
            "customer_message"
        )

        payment["suggested_action"] = decision.get(
            "suggested_action"
        )

        payment["suggested_action_label"] = decision.get(
            "suggested_action_label"
        )

        payment["status"] = "subscription_recovery"
        payment["recovered_by_agent"] = False

        return {
            "result": "Recovery Intervention",
            "retry_attempt": "No automatic retry",
            **decision,
        }

    # -----------------------------------------------------
    # PROMISE TO PAY
    # -----------------------------------------------------

    if payment.get("failure_reason") == "promise_missed":

        payment["decision"] = decision["decision"]
        payment["agent_decision"] = decision["decision"]
        payment["action"] = decision["action"]
        payment["agent_reason"] = decision["reason"]

        payment["customer_title"] = decision.get(
            "customer_title"
        )

        payment["customer_message"] = decision.get(
            "customer_message"
        )

        payment["suggested_action"] = decision.get(
            "suggested_action"
        )

        payment["suggested_action_label"] = decision.get(
            "suggested_action_label"
        )

        payment["status"] = "promise_missed"
        payment["recovered_by_agent"] = False

        return {
            "result": "Recovery Intervention",
            "retry_attempt": "No automatic retry",
            **decision,
        }

    # -----------------------------------------------------
    # RETRY
    # -----------------------------------------------------

    if decision["decision"] == "RETRY":

        if retry_attempts >= MAX_RETRIES:

            decision = {
                "decision": "CHECK_LATER",
                "action": "Wait and check payment status later",
                "reason": "Maximum retry limit reached.",
            }

        else:

            payment["retry_attempts"] = (
                retry_attempts + 1
            )

            # Demo behavior:
            # successful retry = immediately recovered

            payment["status"] = "success"
            payment["recovered_by_agent"] = True
            payment["action"] = decision["action"]
            payment["decision"] = decision["decision"]
            payment["agent_decision"] = decision["decision"]
            payment["agent_reason"] = decision["reason"]

            return {
                "result": "Recovered",
                "retry_attempt": payment["retry_attempts"],
                **decision,
            }

    # -----------------------------------------------------
    # PAYMENT REMAINS AT RISK
    # -----------------------------------------------------

    payment["decision"] = decision["decision"]
    payment["agent_decision"] = decision["decision"]
    payment["action"] = decision["action"]
    payment["agent_reason"] = decision["reason"]

    payment["status"] = "failed"
    payment["recovered_by_agent"] = False

    return {
        "result": "At Risk",
        "retry_attempt": (
            f"Retry {payment.get('retry_attempts', 0)} "
            f"of {MAX_RETRIES}"
            if payment.get("retry_attempts", 0) > 0
            else "No retry attempted"
        ),
        **decision,
    }


# =========================================================
# HEALTH
# =========================================================

@app.route("/health", methods=["GET"])
def health():

    return jsonify({
        "success": True,
        "message": "Recovery agent backend is running",
        "llm_enabled": groq_client is not None,
        "razorpay_enabled": razorpay_client is not None,
    })


# =========================================================
# GET MERCHANT PAYMENTS
# =========================================================

@app.route("/payments", methods=["GET"])
def get_payments():

    return jsonify(load_payments())


# =========================================================
# CREATE REAL RAZORPAY ORDER
# =========================================================

@app.route("/create-order", methods=["POST"])
def create_order():

    payload = request.get_json(
        silent=True
    ) or {}

    amount = payload.get("amount")

    if not amount:
        return jsonify({
            "success": False,
            "message": "amount is required."
        }), 400

    if not razorpay_client:
        return jsonify({
            "success": False,
            "message": "Razorpay is not configured."
        }), 500

    try:

        amount_paise = int(
            float(amount) * 100
        )

        order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": (
                f"demo_receipt_"
                f"{os.urandom(4).hex()}"
            ),
        })

        return jsonify({
            "success": True,
            "order": order,
            "key_id": RAZORPAY_KEY_ID
        })

    except Exception as error:

        print(
            "Razorpay order creation error:",
            error
        )

        return jsonify({
            "success": False,
            "message": (
                "Unable to create Razorpay order."
            ),
            "error": str(error)
        }), 500


# =========================================================
# REAL RAZORPAY PAYMENT RESULT
# =========================================================

@app.route(
    "/razorpay-payment-result",
    methods=["POST"]
)
def razorpay_payment_result():

    payload = request.get_json(
        silent=True
    ) or {}

    payment_id = payload.get("payment_id")
    status = payload.get("status")

    razorpay_payment_id = payload.get(
        "razorpay_payment_id"
    )

    razorpay_order_id = payload.get(
        "razorpay_order_id"
    )

    razorpay_signature = payload.get(
        "razorpay_signature"
    )

    failure_reason = payload.get(
        "failure_reason"
    )

    failure_code = payload.get(
        "failure_code"
    )

    failure_description = payload.get(
        "failure_description"
    )

    if not payment_id:

        return jsonify({
            "success": False,
            "message": "payment_id is required."
        }), 400

    if status not in {
        "success",
        "failed"
    }:

        return jsonify({
            "success": False,
            "message": (
                "status must be success or failed."
            )
        }), 400

    # -----------------------------------------------------
    # FIND CUSTOMER SCENARIO
    # -----------------------------------------------------

    scenario = next(
        (
            item
            for item in INITIAL_DEMO_PAYMENTS
            if item.get("payment_id") == payment_id
        ),
        None,
    )

    if scenario is None:

        return jsonify({
            "success": False,
            "message": (
                f"Payment scenario {payment_id} "
                "was not found."
            )
        }), 404

    payment = deepcopy(scenario)

    payment["razorpay_payment_id"] = (
        razorpay_payment_id
    )

    payment["razorpay_order_id"] = (
        razorpay_order_id
    )

    payment["source"] = "razorpay"

    # =====================================================
    # SUCCESS
    # =====================================================

    if status == "success":

        if (
            not razorpay_payment_id
            or not razorpay_order_id
        ):

            return jsonify({
                "success": False,
                "message": (
                    "Missing Razorpay payment information."
                )
            }), 400

        if not razorpay_signature:

            return jsonify({
                "success": False,
                "message": (
                    "Missing Razorpay signature."
                )
            }), 400

        if not razorpay_client:

            return jsonify({
                "success": False,
                "message": (
                    "Razorpay is not configured."
                )
            }), 500

        try:

            razorpay_client.utility.verify_payment_signature({
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
            })

        except Exception as error:

            print(
                "Razorpay signature verification failed:",
                error
            )

            return jsonify({
                "success": False,
                "message": (
                    "Razorpay payment verification failed."
                ),
                "error": str(error),
            }), 400

        payment["status"] = "success"
        payment["recovered_by_agent"] = False

        payments = load_payments()

        existing_index = next(
            (
                index
                for index, item in enumerate(payments)
                if item.get("payment_id") == payment_id
            ),
            None,
        )

        if existing_index is not None:
            payments[existing_index] = payment
        else:
            payments.append(payment)

        save_payments(payments)

        return jsonify({
            "success": True,
            "payment": payment,
            "decision": "PAYMENT_SUCCESS",
            "action": (
                "Payment completed successfully"
            ),
            "reason": (
                "Razorpay payment was completed "
                "and verified."
            ),
            "recovered": False,
            "message": (
                "Razorpay payment recorded successfully."
            ),
        })

    # =====================================================
    # FAILURE
    # =====================================================

    raw_reason = (
        failure_reason
        or failure_code
        or failure_description
        or "unrecognized_processor_error"
    ).lower()

    if "timeout" in raw_reason:

        normalized_reason = (
            "upi_timeout"
            if scenario.get("method") == "upi"
            else "gateway_timeout"
        )

    elif "network" in raw_reason:

        normalized_reason = "network_error"

    elif "insufficient" in raw_reason:

        normalized_reason = "insufficient_funds"

    elif "expired" in raw_reason:

        normalized_reason = "expired_card"

    elif "authentication" in raw_reason:

        normalized_reason = "authentication_failed"

    elif "duplicate" in raw_reason:

        normalized_reason = "duplicate_payment_risk"

    else:

        normalized_reason = (
            "unrecognized_processor_error"
        )

    payment["status"] = "failed"

    payment["failure_reason"] = normalized_reason

    payment["razorpay_failure_code"] = (
        failure_code
    )

    payment["razorpay_failure_description"] = (
        failure_description
    )

    payment["recovered_by_agent"] = False
    payment["retry_attempts"] = 0

    payments = load_payments()

    existing_index = next(
        (
            index
            for index, item in enumerate(payments)
            if item.get("payment_id") == payment_id
        ),
        None,
    )

    if existing_index is not None:
        payments[existing_index] = payment
    else:
        payments.append(payment)

    agent_result = process_payment_with_agent(
        payment
    )

    recovery_log = load_recovery_log()

    recovery_log.append({
        "payment_id": payment["payment_id"],
        "customer_id": payment.get("customer_id"),
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "result": agent_result["result"],
        "retry_attempt": agent_result["retry_attempt"],
        "reason": agent_result["reason"],
        "source": "razorpay",
        "created_at": datetime.utcnow().isoformat(),
    })

    save_payments(payments)
    save_recovery_log(recovery_log)

    return jsonify({
        "success": True,
        "payment": payment,
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "reason": agent_result["reason"],
        "recovered": (
            agent_result["result"]
            == "Recovered"
        ),
        "message": (
            "Razorpay payment failure was handled "
            "by the recovery agent."
        ),
    })


# =========================================================
# CUSTOMER PAYMENT — SIMULATED DEMO FLOW
# =========================================================

@app.route("/customer-pay", methods=["POST"])
def customer_pay():

    payload = request.get_json(
        silent=True
    ) or {}

    payment_id = payload.get(
        "payment_id"
    )

    if not payment_id:

        return jsonify({
            "success": False,
            "message": (
                "payment_id is required."
            ),
        }), 400

    scenario = next(
        (
            item
            for item in INITIAL_DEMO_PAYMENTS
            if item.get("payment_id") == payment_id
        ),
        None,
    )

    if scenario is None:

        return jsonify({
            "success": False,
            "message": (
                f"Payment scenario {payment_id} "
                "was not found."
            ),
        }), 404

    payment = deepcopy(scenario)

    payment["status"] = "failed"
    payment["recovered_by_agent"] = False
    payment["retry_attempts"] = 0

    payment.pop("decision", None)
    payment.pop("agent_decision", None)
    payment.pop("agent_reason", None)
    payment.pop("action", None)

    if not payment.get("failure_reason"):

        payment["failure_reason"] = (
            "bank_server_error"
        )

    payments = load_payments()

    existing_index = next(
        (
            index
            for index, item in enumerate(payments)
            if item.get("payment_id") == payment_id
        ),
        None,
    )

    if existing_index is not None:
        payments[existing_index] = payment
    else:
        payments.append(payment)

    agent_result = process_payment_with_agent(
        payment
    )

    recovery_log = load_recovery_log()

    recovery_log.append({
        "payment_id": payment["payment_id"],
        "customer_id": payment.get("customer_id"),
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "result": agent_result["result"],
        "retry_attempt": agent_result["retry_attempt"],
        "reason": agent_result["reason"],
        "source": "customer_payment",
        "created_at": datetime.utcnow().isoformat(),
    })

    save_payments(payments)
    save_recovery_log(recovery_log)

    return jsonify({
        "success": True,
        "payment": payment,
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "reason": agent_result["reason"],
        "recovered": (
            agent_result["result"]
            == "Recovered"
        ),
        "message": (
            "Customer payment failed and the "
            "recovery agent handled the outcome."
        ),
    })


# =========================================================
# RECOVERY LAB
# =========================================================

@app.route("/lab-simulate", methods=["POST"])
def lab_simulate():

    payload = request.get_json(
        silent=True
    ) or {}

    event_type = payload.get(
        "event_type"
    )

    amount = payload.get(
        "amount",
        0
    )

    cart = payload.get(
        "cart",
        []
    )

    supported_events = {
        "checkout_abandonment",
        "subscription_failure",
        "promise_missed",
    }

    if event_type not in supported_events:

        return jsonify({
            "success": False,
            "message": (
                "event_type must be one of: "
                "checkout_abandonment, "
                "subscription_failure, "
                "promise_missed."
            ),
        }), 400

    try:

        numeric_amount = float(amount)

    except (TypeError, ValueError):

        return jsonify({
            "success": False,
            "message": (
                "amount must be a valid number."
            ),
        }), 400

    if numeric_amount <= 0:

        return jsonify({
            "success": False,
            "message": (
                "amount must be greater than zero."
            ),
        }), 400

    if not isinstance(cart, list):

        return jsonify({
            "success": False,
            "message": (
                "cart must be an array."
            ),
        }), 400

    # -----------------------------------------------------
    # EVENT CONFIG
    # -----------------------------------------------------

    event_config = {

        "checkout_abandonment": {
            "customer_id": "lab_checkout_customer",
            "failure_reason": "checkout_abandoned",
            "method": "checkout",
            "bank": "DEMO",
            "source": "recovery_lab_checkout",
        },

        "subscription_failure": {
            "customer_id": "lab_subscription_customer",
            "failure_reason": (
                "subscription_payment_failed"
            ),
            "method": "subscription",
            "bank": "DEMO",
            "source": "recovery_lab_subscription",
        },

        "promise_missed": {
            "customer_id": "lab_promise_customer",
            "failure_reason": "promise_missed",
            "method": "invoice",
            "bank": "DEMO",
            "source": "recovery_lab_promise",
        },

    }[event_type]

    payment_id = (
        f"lab_{event_type}_"
        f"{os.urandom(4).hex()}"
    )

    payment = {
        "payment_id": payment_id,
        "customer_id": event_config["customer_id"],
        "amount": numeric_amount,
        "status": "failed",
        "bank": event_config["bank"],
        "method": event_config["method"],
        "failure_reason": event_config["failure_reason"],
        "retry_attempts": 0,
        "recovered_by_agent": False,
        "source": event_config["source"],
        "created_at": datetime.utcnow().isoformat(),
    }

    if event_type == "checkout_abandonment":

        payment["cart"] = cart
        payment["event_type"] = (
            "checkout_abandonment"
        )

    # -----------------------------------------------------
    # RUN AGENT
    # -----------------------------------------------------

    try:
        agent_result = process_payment_with_agent(
            payment
        )
    except Exception as error:
        print(
            "Recovery Lab agent error:",
            error
        )

        return jsonify({
            "success": False,
            "message": (
                "The recovery agent could not generate "
                "the requested intervention."
            ),
            "error": str(error),
        }), 503

    # -----------------------------------------------------
    # SAVE PAYMENT
    # -----------------------------------------------------

    payments = load_payments()

    payments.append(payment)

    save_payments(payments)

    # -----------------------------------------------------
    # SAVE RECOVERY LOG
    # -----------------------------------------------------

    recovery_log = load_recovery_log()

    recovery_entry = {
        "payment_id": payment["payment_id"],
        "customer_id": payment["customer_id"],
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "result": agent_result["result"],
        "retry_attempt": agent_result["retry_attempt"],
        "reason": agent_result["reason"],
        "source": event_config["source"],
        "created_at": datetime.utcnow().isoformat(),
    }

    # -----------------------------------------------------
    # CUSTOMER-FACING DATA
    # -----------------------------------------------------

    if event_type in {
        "checkout_abandonment",
        "subscription_failure",
        "promise_missed",
    }:

        recovery_entry["customer_title"] = (
            payment.get("customer_title")
        )

        recovery_entry["customer_message"] = (
            payment.get("customer_message")
        )

        recovery_entry["suggested_action"] = (
            payment.get("suggested_action")
        )

        recovery_entry["suggested_action_label"] = (
            payment.get("suggested_action_label")
        )

        recovery_entry["customer_action"] = None
        recovery_entry["customer_action_at"] = None

    recovery_log.append(recovery_entry)

    save_recovery_log(recovery_log)

    # -----------------------------------------------------
    # RESPONSE
    # -----------------------------------------------------

    response = {
    "success": True,

    # IMPORTANT:
    # Return payment_id at the top level so the
    # frontend can use it when recording the
    # customer's recovery action.
    "payment_id": payment["payment_id"],

    "payment": payment,

    "decision": agent_result["decision"],

    "action": agent_result["action"],

    "reason": agent_result["reason"],

    "result": agent_result["result"],

    "retry_attempt": agent_result["retry_attempt"],

    "recovered": (
        agent_result["result"]
        == "Recovered"
    ),

    "message": (
        "Recovery Lab event was processed "
        "by the recovery agent."
    ),
}

    # -----------------------------------------------------
    # CUSTOMER INTERVENTION
    # -----------------------------------------------------

    response["customer_intervention"] = {

        "title": payment.get(
            "customer_title"
        ),

        "message": payment.get(
            "customer_message"
        ),

        "suggested_action": payment.get(
            "suggested_action"
        ),

        "suggested_action_label": payment.get(
            "suggested_action_label"
        ),

    }

    return jsonify(response)


# =========================================================
# CHECKOUT ACTION
# =========================================================

@app.route(
    "/checkout-action",
    methods=["POST"]
)
def checkout_action():

    payload = request.get_json(
        silent=True
    ) or {}

    payment_id = payload.get(
        "payment_id"
    )

    customer_action = payload.get(
        "customer_action"
    )

    allowed_actions = {
        "RETURN_TO_CHECKOUT",
        "KEEP_CART_SAVED",
        "ABANDON",
    }

    if not payment_id:

        return jsonify({
            "success": False,
            "message": (
                "payment_id is required."
            ),
        }), 400

    if customer_action not in allowed_actions:

        return jsonify({
            "success": False,
            "message": (
                "customer_action must be one of: "
                "RETURN_TO_CHECKOUT, "
                "KEEP_CART_SAVED, ABANDON."
            ),
        }), 400

    payments = load_payments()

    payment_index = next(
        (
            index
            for index, item in enumerate(payments)
            if item.get("payment_id") == payment_id
        ),
        None,
    )

    if payment_index is None:

        return jsonify({
            "success": False,
            "message": (
                "Checkout event was not found."
            ),
        }), 404

    payment = payments[payment_index]

    if payment.get(
        "failure_reason"
    ) != "checkout_abandoned":

        return jsonify({
            "success": False,
            "message": (
                "This payment is not a "
                "checkout-abandonment event."
            ),
        }), 400

    action_time = (
        datetime.utcnow().isoformat()
    )

    payment["customer_action"] = (
        customer_action
    )

    payment["customer_action_at"] = (
        action_time
    )

    if customer_action == "RETURN_TO_CHECKOUT":

        payment["recovery_outcome"] = (
            "customer_returned"
        )

    elif customer_action == "KEEP_CART_SAVED":

        payment["recovery_outcome"] = (
            "cart_saved"
        )

    else:

        payment["recovery_outcome"] = (
            "customer_abandoned"
        )

    payments[payment_index] = payment

    save_payments(payments)

    # -----------------------------------------------------
    # UPDATE LOG
    # -----------------------------------------------------

    recovery_log = load_recovery_log()

    matching_index = None

    for index in range(
        len(recovery_log) - 1,
        -1,
        -1
    ):

        if (
            recovery_log[index].get(
                "payment_id"
            )
            == payment_id
            and recovery_log[index].get(
                "source"
            )
            == "recovery_lab_checkout"
        ):

            matching_index = index
            break

    if matching_index is not None:

        recovery_log[
            matching_index
        ]["customer_action"] = (
            customer_action
        )

        recovery_log[
            matching_index
        ]["customer_action_at"] = (
            action_time
        )

        recovery_log[
            matching_index
        ]["recovery_outcome"] = (
            payment.get(
                "recovery_outcome"
            )
        )

    else:

        recovery_log.append({

            "payment_id": payment_id,

            "customer_id": payment.get(
                "customer_id"
            ),

            "decision": payment.get(
                "decision"
            ),

            "action": payment.get(
                "action"
            ),

            "result": "Customer Response",

            "reason": payment.get(
                "agent_reason"
            ),

            "source": "recovery_lab_checkout",

            "customer_action": customer_action,

            "customer_action_at": action_time,

            "recovery_outcome": payment.get(
                "recovery_outcome"
            ),

        })

    save_recovery_log(
        recovery_log
    )

    return jsonify({

        "success": True,

        "payment_id": payment_id,

        "customer_action": customer_action,

        "recovery_outcome": payment.get(
            "recovery_outcome"
        ),

        "message": (
            "Customer checkout action recorded."
        ),

    })


# =========================================================
# RUN AGENT MANUALLY
# =========================================================

@app.route(
    "/run-agent",
    methods=["POST"]
)
def run_agent():

    payments = load_payments()

    recovery_log = load_recovery_log()

    processed_count = 0

    for payment in payments:

        if payment.get("status") != "failed":
            continue

        if (
            payment.get("failure_reason")
            == "checkout_abandoned"
        ):
            continue

        agent_result = process_payment_with_agent(
            payment
        )

        processed_count += 1

        recovery_log.append({

            "payment_id": payment["payment_id"],

            "customer_id": payment.get(
                "customer_id"
            ),

            "decision": agent_result["decision"],

            "action": agent_result["action"],

            "result": agent_result["result"],

            "retry_attempt": agent_result[
                "retry_attempt"
            ],

            "reason": agent_result["reason"],

            "created_at": datetime.utcnow().isoformat(),

        })

    save_payments(payments)

    save_recovery_log(
        recovery_log
    )

    recovered = [
        payment
        for payment in payments
        if payment.get(
            "recovered_by_agent"
        ) is True
    ]

    at_risk = [
        payment
        for payment in payments
        if payment.get(
            "status"
        ) == "failed"
    ]

    return jsonify({

        "success": True,

        "recovered": recovered,

        "at_risk": at_risk,

        "message": (
            f"Agent reviewed "
            f"{processed_count} payments."
        ),

        "summary": {

            "payments_reviewed": processed_count,

            "recovered": len(
                recovered
            ),

            "needs_attention": len(
                at_risk
            ),

        },

    })


# =========================================================
# RESET DEMO
# =========================================================

@app.route(
    "/reset-demo",
    methods=["POST"]
)
def reset_demo():

    payments = reset_demo_data()

    return jsonify({

        "success": True,

        "payments": payments,

        "message": (
            "Demo data reset successfully."
        ),

    })


# =========================================================
# START SERVER
# =========================================================

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
    )
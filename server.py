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

# Always load the .env file beside server.py.
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
REVENUE_AUTOPILOT_FILE = os.path.join(DATA_DIR, "revenue_autopilot.json")

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


# =========================================================
# REVENUE AUTOPILOT STATE
# =========================================================

AUTOPILOT_SEED_EVENTS = [
    {
        "event_id": "seed_checkout_001",
        "payment_id": "autopilot_checkout_001",
        "source": "checkout",
        "event_type": "checkout_failed",
        "customer": "Nova Technologies",
        "amount": 4999,
        "status": "at_risk",
        "recoverable": True,
        "description": "Checkout payment failed",
    },
    {
        "event_id": "seed_checkout_002",
        "payment_id": "autopilot_checkout_002",
        "source": "checkout",
        "event_type": "checkout_abandoned",
        "customer": "Acme Systems",
        "amount": 2499,
        "status": "at_risk",
        "recoverable": True,
        "description": "Checkout abandoned",
    },
    {
        "event_id": "seed_subscription_001",
        "payment_id": "autopilot_subscription_001",
        "source": "subscription",
        "event_type": "subscription_failure",
        "customer": "Vertex Labs",
        "amount": 1499,
        "status": "at_risk",
        "recoverable": True,
        "description": "Subscription renewal failed",
    },
    {
        "event_id": "seed_subscription_002",
        "payment_id": "autopilot_subscription_002",
        "source": "subscription",
        "event_type": "subscription_failure",
        "customer": "BrightDesk",
        "amount": 3999,
        "status": "at_risk",
        "recoverable": True,
        "description": "Subscription payment method needs attention",
    },
    {
        "event_id": "seed_invoice_001",
        "payment_id": "autopilot_invoice_001",
        "source": "invoice",
        "event_type": "invoice_overdue",
        "customer": "Orion Systems",
        "amount": 28000,
        "status": "at_risk",
        "recoverable": True,
        "description": "Invoice became overdue",
    },
    {
        "event_id": "seed_invoice_002",
        "payment_id": "autopilot_invoice_002",
        "source": "invoice",
        "event_type": "promise_missed",
        "customer": "PixelWorks",
        "amount": 12500,
        "status": "at_risk",
        "recoverable": True,
        "description": "Promise-to-pay was missed",
    },
    {
        "event_id": "seed_checkout_003",
        "payment_id": "autopilot_checkout_003",
        "source": "checkout",
        "event_type": "checkout_success",
        "customer": "Zenith Retail",
        "amount": 7499,
        "status": "recovered",
        "recoverable": False,
        "description": "Checkout payment recovered",
    },
]

AUTOPILOT_BASE_EXPECTED_REVENUE = 184200


def save_revenue_autopilot(state):
    ensure_data_directory()

    with open(REVENUE_AUTOPILOT_FILE, "w") as file:
        json.dump(state, file, indent=2)


def build_revenue_autopilot_state(events=None):
    events = events if isinstance(events, list) else []

    at_risk = sum(
        float(event.get("amount", 0) or 0)
        for event in events
        if event.get("status") == "at_risk"
    )

    recoverable = sum(
        float(event.get("amount", 0) or 0)
        for event in events
        if event.get("status") == "at_risk"
        and event.get("recoverable") is True
    )

    recovered = sum(
        float(event.get("amount", 0) or 0)
        for event in events
        if event.get("status") == "recovered"
    )

    return {
        "expected_revenue": AUTOPILOT_BASE_EXPECTED_REVENUE,
        "revenue_at_risk": round(at_risk, 2),
        "recoverable_revenue": round(recoverable, 2),
        "recovered_revenue": round(recovered, 2),
        "events": events,
        "updated_at": datetime.utcnow().isoformat(),
    }


def load_revenue_autopilot():
    ensure_data_directory()

    if not os.path.exists(REVENUE_AUTOPILOT_FILE):
        state = build_revenue_autopilot_state(
            deepcopy(AUTOPILOT_SEED_EVENTS)
        )
        save_revenue_autopilot(state)
        return state

    try:
        with open(REVENUE_AUTOPILOT_FILE, "r") as file:
            state = json.load(file)

        if not isinstance(state, dict):
            raise ValueError("Invalid Revenue Autopilot state")

        events = state.get("events", [])
        if not isinstance(events, list):
            events = []

        return build_revenue_autopilot_state(events)

    except (json.JSONDecodeError, OSError, ValueError):
        state = build_revenue_autopilot_state(
            deepcopy(AUTOPILOT_SEED_EVENTS)
        )
        save_revenue_autopilot(state)
        return state


def reset_revenue_autopilot():
    state = build_revenue_autopilot_state(
        deepcopy(AUTOPILOT_SEED_EVENTS)
    )
    save_revenue_autopilot(state)
    return state


def record_revenue_event(
    source,
    event_type,
    amount,
    payment_id=None,
    customer=None,
    description=None,
    status="at_risk",
    recoverable=True,
):
    state = load_revenue_autopilot()
    events = state.get("events", [])

    now = datetime.utcnow().isoformat()

    # A real payment can move from failed -> recovered. Reuse its
    # existing Autopilot event instead of creating a duplicate.
    if payment_id:
        for event in reversed(events):
            if event.get("payment_id") == payment_id:
                previous_status = event.get("status")
                next_status = status

                # A payment that was previously at risk and then
                # succeeds is a recovered payment. A first-time
                # successful checkout is simply completed revenue.
                if (
                    previous_status == "at_risk"
                    and status == "completed"
                ):
                    next_status = "recovered"

                event.update({
                    "source": source,
                    "event_type": event_type,
                    "amount": float(amount or 0),
                    "customer": customer or event.get("customer"),
                    "description": description or event.get("description"),
                    "status": next_status,
                    "recoverable": bool(recoverable),
                    "updated_at": now,
                })
                state = build_revenue_autopilot_state(events)
                save_revenue_autopilot(state)
                return event

    event = {
        "event_id": f"evt_{os.urandom(6).hex()}",
        "payment_id": payment_id,
        "source": source,
        "event_type": event_type,
        "customer": customer or "Demo customer",
        "amount": float(amount or 0),
        "status": status,
        "recoverable": bool(recoverable),
        "description": description or event_type.replace("_", " ").title(),
        "created_at": now,
    }

    events.append(event)
    state = build_revenue_autopilot_state(events)
    save_revenue_autopilot(state)
    return event


def reset_demo_data():
    """
    Merchant activity starts empty.

    Customer scenarios remain available through
    INITIAL_DEMO_PAYMENTS.
    """

    payments = []

    save_payments(payments)
    save_recovery_log([])
    reset_revenue_autopilot()

    return payments


# =========================================================
# SMALL HELPERS
# =========================================================

def safe_retry_count(payment):
    value = payment.get("retry_attempts", 0)

    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def build_cart_summary(payment):
    cart = payment.get("cart", [])

    if not isinstance(cart, list):
        return []

    summary = []

    for item in cart:
        if not isinstance(item, dict):
            continue

        summary.append({
            "name": (
                item.get("name")
                or item.get("title")
                or "Product"
            ),
            "description": (
                item.get("description")
                or item.get("subtitle")
                or ""
            ),
            "badge": item.get("badge") or "",
            "quantity": item.get("quantity", 1),
            "price": (
                item.get("price")
                or item.get("unit_price")
                or 0
            ),
        })

    return summary


def clean_llm_json(content):
    content = (content or "").strip()

    if content.startswith("```"):
        content = content.replace("```json", "", 1)
        content = content.replace("```", "")
        content = content.strip()

    return content


def validate_payment_recovery_result(result):
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

    allowed_strategies = {
        "RETRY_PAYMENT",
        "CHANGE_PAYMENT_METHOD",
        "WAIT_AND_RETRY",
        "CHECK_PAYMENT_STATUS",
        "UPDATE_PAYMENT_METHOD",
        "MANUAL_REVIEW",
    }

    if result["decision"] not in allowed_strategies:
        raise ValueError(
            "The recovery agent returned an unsupported payment strategy."
        )

    if result["suggested_action"] not in allowed_strategies:
        raise ValueError(
            "The recovery agent returned an unsupported customer action."
        )

    return result


def find_payment_by_id(payment_id):
    """
    Finds persisted Recovery Lab / merchant activity first.
    Falls back to the original demo catalog.
    """

    payments = load_payments()

    for payment in payments:
        if payment.get("payment_id") == payment_id:
            return deepcopy(payment)

    for payment in INITIAL_DEMO_PAYMENTS:
        if payment.get("payment_id") == payment_id:
            return deepcopy(payment)

    return None


def upsert_payment(payment):
    payments = load_payments()

    payment_id = payment.get("payment_id")

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


def append_recovery_log(payment, agent_result, source):
    recovery_log = load_recovery_log()

    recovery_log.append({
        "payment_id": payment.get("payment_id"),
        "customer_id": payment.get("customer_id"),
        "decision": agent_result.get("decision"),
        "action": agent_result.get("action"),
        "result": agent_result.get("result"),
        "retry_attempt": agent_result.get("retry_attempt"),
        "reason": agent_result.get("reason"),
        "customer_title": payment.get("customer_title"),
        "customer_message": payment.get("customer_message"),
        "suggested_action": payment.get("suggested_action"),
        "suggested_action_label": payment.get(
            "suggested_action_label"
        ),
        "customer_action": payment.get("customer_action"),
        "customer_action_at": payment.get(
            "customer_action_at"
        ),
        "recovery_outcome": payment.get(
            "recovery_outcome"
        ),
        "failure_reason": payment.get(
            "failure_reason"
        ),
        "razorpay_failure_code": payment.get(
            "razorpay_failure_code"
        ),
        "razorpay_failure_description": payment.get(
            "razorpay_failure_description"
        ),
        "razorpay_failure_source": payment.get(
            "razorpay_failure_source"
        ),
        "razorpay_failure_step": payment.get(
            "razorpay_failure_step"
        ),
        "retry_attempts": payment.get(
            "retry_attempts"
        ),
        "source": source,
        "created_at": datetime.utcnow().isoformat(),
    })

    save_recovery_log(recovery_log)


# =========================================================
# CHECKOUT RECOVERY — GROQ
# =========================================================

def generate_checkout_recovery(payment):
    if not groq_client:
        raise RuntimeError(
            "Groq is not configured; the recovery agent cannot "
            "generate a customer intervention."
        )

    cart = payment.get("cart", [])
    amount = payment.get("amount", 0)

    item_count = 0

    if isinstance(cart, list):
        for item in cart:
            try:
                item_count += int(item.get("quantity", 1))
            except (TypeError, ValueError):
                item_count += 1

    cart_summary = build_cart_summary(payment)

    prompt = f"""
You are an ecommerce revenue recovery specialist.

A high-intent customer reached checkout but did not complete payment.
Your goal is to create the most compelling truthful reason for them to
return and finish the purchase.

This is NOT a generic reminder. Treat the cart like a real shopping
conversation: understand what the customer chose, surface a useful
benefit of the actual product, remove friction, and give them a clear
next step.

CUSTOMER CHECKOUT DATA
----------------------

Cart value: ₹{amount}
Number of items: {item_count}

Cart items:
{json.dumps(cart_summary, ensure_ascii=False)}

RECOVERY GOAL
-------------

Maximize the probability of a completed purchase while staying truthful.
The customer already showed purchase intent by reaching checkout.

MESSAGE RULES
-------------

1. Write a message that feels written specifically for THIS cart.
2. Mention the most relevant product or products by their real names.
3. Use the real product description/attributes supplied above when useful.
4. Lead with a genuine product benefit, convenience, or the fact that the
   cart is saved — whichever is most persuasive from the supplied data.
5. Make the next step obvious and low-friction.
6. Make the copy warm, concise, and conversion-oriented.
7. Avoid generic phrases such as "your cart is waiting" unless they are
   combined with something specific from the cart.
8. Do not repeat a fixed template. Vary the opening and phrasing based on
   the cart contents.
9. Never invent discounts, coupons, free shipping, stock scarcity,
   deadlines, rewards, guarantees, reviews, or product benefits that are
   not present in the supplied data.
10. Never guilt-trip or pressure the customer.
11. Do not mention AI, agents, models, algorithms, dashboards, or internal
    systems.
12. Keep customer_message to 1-3 short sentences.
13. customer_title should be specific and attractive, not generic.

CONVERSION GUIDANCE
-------------------

- For one strong product: spotlight its actual benefit and invite the
  customer to finish checkout.
- For multiple products: mention the strongest or most distinctive item,
  while acknowledging the saved cart.
- For a low-friction purchase: use a simple, confident return-to-checkout
  invitation.
- If the cart information is sparse: focus on the saved cart and easy
  completion rather than inventing product claims.

CHOOSE ONE CUSTOMER ACTION
--------------------------

RETURN_TO_CHECKOUT
The customer appears to have strong purchase intent and should be brought
back to checkout immediately.

KEEP_CART_SAVED
The customer may need more time. Preserve the cart and make returning easy.

ABANDON
Use only when recovery would clearly be inappropriate.

Return ONLY valid JSON:

{{
  "decision": "RE_ENGAGE",
  "action": "short internal action description",
  "reason": "short internal reason based on the cart",
  "customer_title": "specific attractive customer-facing title",
  "customer_message": "1-3 sentence persuasive customer-facing message",
  "suggested_action": "RETURN_TO_CHECKOUT",
  "suggested_action_label": "short clear button label"
}}
"""

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a high-converting but truthful ecommerce "
                        "recovery decision engine. Personalize every message "
                        "from the supplied cart. Never invent offers or facts. "
                        "Return valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.9,
            max_completion_tokens=800,
            response_format={"type": "json_object"},
        )

        result = json.loads(
            clean_llm_json(response.choices[0].message.content)
        )

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
                raise ValueError(f"Missing LLM field: {field}")

        if result["suggested_action"] not in {
            "RETURN_TO_CHECKOUT",
            "KEEP_CART_SAVED",
            "ABANDON",
        }:
            raise ValueError("Unsupported checkout customer action.")

        return result

    except Exception as error:
        print("Checkout recovery LLM error:", error)
        raise RuntimeError(
            "The recovery agent could not generate a customer intervention."
        ) from error


# =========================================================
# SUBSCRIPTION RECOVERY
# =========================================================

def generate_subscription_recovery(payment):
    """
    Use the subscriber's renewal history to choose a context-aware
    recovery strategy instead of returning the same decision for every
    failed renewal.
    """
    if not groq_client:
        raise RuntimeError(
            "Groq is not configured; the recovery agent cannot "
            "analyze the subscription failure."
        )

    subscription = payment.get("subscription") or {}

    plan_name = subscription.get("plan_name") or "subscription"
    amount = subscription.get("amount", payment.get("amount", 0))
    billing_cycle = subscription.get("billing_cycle") or "billing cycle"
    payment_method = subscription.get("payment_method") or "unknown"
    successful_renewals = subscription.get("successful_renewals", 0)
    previous_failures = subscription.get("previous_failed_renewals", 0)
    previous_recovery_attempts = subscription.get(
        "previous_recovery_attempts", 0
    )
    attempt_count = subscription.get("attempt_count", 1)
    renewal_due_at = subscription.get("renewal_due_at") or "today"

    prompt = f"""
You are an autonomous subscription revenue recovery agent.

A customer's recurring subscription renewal has failed. Decide the
BEST NEXT recovery action using the customer's actual renewal history.
Do not give the same recommendation to every subscriber.

SUBSCRIPTION CONTEXT
--------------------
Plan: {plan_name}
Amount: ₹{amount}
Billing cycle: {billing_cycle}
Payment method: {payment_method}
Renewal due: {renewal_due_at}
Successful renewals: {successful_renewals}
Previous failed renewals: {previous_failures}
Previous recovery attempts: {previous_recovery_attempts}
Current failed attempt: #{attempt_count}

DECISION LOGIC
--------------

1. LOYAL / CLEAN HISTORY
If the subscriber has many successful renewals, no previous failures,
and no recovery attempts, prefer a low-friction action such as RETRY_PAYMENT.
Do not create unnecessary friction for a normally reliable customer.

2. SOME PAYMENT FRICTION
If there are a few previous failures or one previous recovery attempt,
consider UPDATE_PAYMENT_METHOD or RETRY_PAYMENT depending on the evidence.
Avoid blindly repeating the same path.

3. REPEATED FAILURE / RECOVERY FATIGUE
If failures and recovery attempts are repeated, become more conservative.
Prefer UPDATE_PAYMENT_METHOD, CONTACT_CUSTOMER, or MANUAL_REVIEW rather
than endlessly retrying the same payment path.

4. ATTEMPT COUNT MATTERS
The current attempt number should influence the decision. A later attempt
should generally require stronger evidence before another automatic retry.

5. NO INVENTED CAUSES
The supplied history does not prove why the payment failed. Do not invent
an expired card, insufficient funds, bank outage, or any other cause.

AVAILABLE STRATEGIES
--------------------

RETRY_PAYMENT
Ask the customer to try the renewal payment again now.

UPDATE_PAYMENT_METHOD
Ask the customer to update or replace the payment method before retrying.

CONTACT_CUSTOMER
Ask the customer to contact the merchant/support because repeated friction
makes another automatic attempt less appropriate.

MANUAL_REVIEW
Escalate for merchant review when automated recovery is not sufficiently safe.

CUSTOMER MESSAGE RULES
----------------------

The customer-facing message must:
- sound natural and specific to the subscription;
- mention the real plan name;
- explain the useful next step clearly;
- be calm and non-blaming;
- preserve the value of keeping the subscription active;
- avoid unsupported claims about the failure;
- never invent discounts, penalties, urgency, scarcity, rewards, or causes;
- never mention AI, agents, models, algorithms, dashboards, or internal systems;
- avoid using the exact same wording for every scenario.

BUTTON LABELS
-------------
RETRY_PAYMENT -> "Try renewal again"
UPDATE_PAYMENT_METHOD -> "Update payment method"
CONTACT_CUSTOMER -> "Contact support"
MANUAL_REVIEW -> "Continue"

Return ONLY valid JSON:

{{
  "decision": "one recovery strategy",
  "action": "short internal description",
  "reason": "short evidence-based explanation",
  "customer_title": "short natural title",
  "customer_message": "short personalized customer-facing message",
  "suggested_action": "same recovery strategy",
  "suggested_action_label": "matching button label"
}}
"""

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a careful subscription revenue recovery "
                        "decision engine. Adapt the strategy to renewal history, "
                        "avoid invented causes, and return valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.5,
            max_completion_tokens=800,
            response_format={"type": "json_object"},
        )

        result = json.loads(
            clean_llm_json(response.choices[0].message.content)
        )

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
                raise ValueError(f"Missing LLM field: {field}")

        allowed = {
            "RETRY_PAYMENT",
            "UPDATE_PAYMENT_METHOD",
            "CONTACT_CUSTOMER",
            "MANUAL_REVIEW",
        }

        if result["decision"] not in allowed:
            raise ValueError("Unsupported subscription recovery strategy.")

        if result["suggested_action"] not in allowed:
            raise ValueError("Unsupported subscription customer action.")

        return result

    except Exception as error:
        print("Subscription recovery LLM error:", error)
        raise RuntimeError(
            "The recovery agent could not analyze the subscription failure."
        ) from error


# =========================================================
# PROMISE TO PAY RECOVERY
# =========================================================

def generate_promise_recovery(payment):
    """
    Uses Groq to decide how to recover a missed promise-to-pay.

    The agent receives the customer's payment commitment history,
    overdue amount, promise history and previous recovery attempts.
    """

    if not groq_client:
        raise RuntimeError(
            "Groq is not configured; the recovery agent cannot "
            "analyze the missed payment promise."
        )

    promise = payment.get("promise") or {}

    amount = payment.get("amount", 0)

    outstanding_amount = promise.get(
        "outstanding_amount",
        amount
    )

    invoice_id = promise.get(
        "invoice_id",
        "unknown"
    )

    invoice_date = promise.get(
        "invoice_date",
        "unknown"
    )

    promise_date = promise.get(
        "promise_date",
        "unknown"
    )

    days_overdue = promise.get(
        "days_overdue",
        0
    )

    previous_promises = promise.get(
        "previous_promises",
        0
    )

    promises_kept = promise.get(
        "promises_kept",
        0
    )

    promises_missed = promise.get(
        "promises_missed",
        0
    )

    previous_recovery_attempts = promise.get(
        "previous_recovery_attempts",
        0
    )

    customer_tenure = promise.get(
        "customer_tenure",
        "unknown"
    )

    average_payment_delay = promise.get(
        "average_payment_delay_days",
        "unknown"
    )

    last_payment_amount = promise.get(
        "last_payment_amount",
        "unknown"
    )

    payment_history = promise.get(
        "payment_history",
        []
    )

    prompt = f"""
You are an autonomous accounts receivable
and revenue recovery agent.

A customer made a promise to pay an outstanding invoice
by a specific date, but that promise has now been missed.

Your job is to decide the safest and most useful NEXT
recovery action based on the customer's actual payment
history and promise-to-pay behaviour.

IMPORTANT:

Different customer histories should produce different
recovery decisions.

Do NOT automatically send the same reminder to everyone.

CUSTOMER / INVOICE CONTEXT
--------------------------

Outstanding amount:
₹{outstanding_amount}

Invoice ID:
{invoice_id}

Invoice date:
{invoice_date}

Promised payment date:
{promise_date}

Days overdue:
{days_overdue}

Previous promises made:
{previous_promises}

Promises previously kept:
{promises_kept}

Promises previously missed:
{promises_missed}

Previous recovery attempts:
{previous_recovery_attempts}

Customer tenure:
{customer_tenure}

Average payment delay:
{average_payment_delay} days

Last payment amount:
₹{last_payment_amount}

Recent payment history:
{json.dumps(payment_history, ensure_ascii=False)}

DECISION FRAMEWORK
------------------

Think about the customer's behaviour before deciding.

A. RELIABLE CUSTOMER

If the customer has historically paid successfully
and this is their first missed promise, a calm reminder
or request for a revised commitment may be appropriate.

B. REPEATED DELAYS

If the customer has repeatedly missed promises,
do not blindly send another identical reminder.

Consider requesting a new commitment or escalating
the account depending on the available evidence.

C. HIGH RECOVERY FRICTION

If several recovery attempts have already occurred,
become more conservative.

Avoid creating an endless automated reminder loop.

D. CUSTOMER PAYMENT HISTORY

A strong history of successful payments can support
a lower-friction recovery action.

Repeated missed commitments should make the recovery
strategy more cautious.

E. DAYS OVERDUE

A newly missed promise may justify a softer intervention.

A significantly overdue account may require escalation
or manual review.

F. INSUFFICIENT EVIDENCE

If the available information is insufficient to justify
a safe automated action, choose MANUAL_REVIEW.

AVAILABLE STRATEGIES
--------------------

SEND_REMINDER

Send a concise reminder asking the customer to complete
the outstanding payment.

REQUEST_NEW_COMMITMENT

Ask the customer to choose or confirm a new payment date.

WAIT_AND_RETRY

Use when the available evidence suggests that waiting
before another intervention is more appropriate.

ESCALATE

Escalate the account because repeated missed commitments
or recovery attempts suggest that another basic reminder
is unlikely to help.

MANUAL_REVIEW

Use when the available evidence is insufficient for a safe
automated recovery decision.

IMPORTANT RULES
---------------

- Use only the supplied evidence.
- Do not invent facts.
- Do not invent a reason for the missed payment.
- Do not assume the customer is unwilling to pay.
- Do not shame or blame the customer.
- Do not promise that payment will happen.
- Do not invent discounts, penalties, rewards or fees.
- Do not encourage endless reminders.
- Consider the customer's actual history.
- A later recovery attempt should generally become
  more conservative.
- The decision must be defensible from the supplied data.

CUSTOMER-FACING RULES
---------------------

The customer should receive a normal payment-related
message from the merchant.

Do NOT mention:

- AI
- LLM
- agent
- model
- algorithm
- backend
- merchant dashboard
- internal reasoning
- payment processor internals

Do NOT invent:

- discounts
- coupons
- rewards
- penalties
- fees
- urgency
- scarcity
- guarantees
- unsupported causes

The message should:

- be concise
- sound human
- be calm and respectful
- clearly explain the next useful step
- match the selected strategy
- avoid blaming the customer

BUTTON LABEL RULES
------------------

SEND_REMINDER -> "Pay now"

REQUEST_NEW_COMMITMENT -> "Choose new date"

WAIT_AND_RETRY -> "I'll pay later"

ESCALATE -> "Contact us"

MANUAL_REVIEW -> "Continue"

Return ONLY valid JSON in exactly this structure:

{{
  "decision": "one recovery strategy",
  "action": "short internal description of what the system should do",
  "reason": "short internal explanation based on actual customer history",
  "customer_title": "short natural customer-facing title",
  "customer_message": "short natural customer-facing message",
  "suggested_action": "same recovery strategy",
  "suggested_action_label": "short customer-facing button label"
}}
"""

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a careful accounts receivable "
                        "recovery decision engine. "
                        "Reason only from supplied customer history "
                        "and payment evidence. "
                        "Adapt the recovery strategy to the context, "
                        "never invent facts, and return valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.3,
            max_completion_tokens=800,
            response_format={"type": "json_object"},
        )

        result = json.loads(
            clean_llm_json(
                response.choices[0].message.content
            )
        )

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

        allowed_strategies = {
            "SEND_REMINDER",
            "REQUEST_NEW_COMMITMENT",
            "WAIT_AND_RETRY",
            "ESCALATE",
            "MANUAL_REVIEW",
        }

        if result["decision"] not in allowed_strategies:
            raise ValueError(
                "The promise recovery agent returned "
                "an unsupported strategy."
            )

        if result["suggested_action"] not in allowed_strategies:
            raise ValueError(
                "The promise recovery agent returned "
                "an unsupported customer action."
            )

        return result

    except Exception as error:
        print(
            "Promise-to-pay recovery LLM error:",
            error
        )

        raise RuntimeError(
            "The recovery agent could not analyze "
            "the missed payment promise."
        ) from error


# =========================================================
# PAYMENT FAILURE RECOVERY — GROQ
# =========================================================

def generate_payment_recovery(payment):
    """
    Uses Groq to reason over the complete supplied payment context.

    There is intentionally NO hard-coded mapping such as:
        expired_card -> change card
        bank_down -> retry

    The LLM receives the actual failure information, Razorpay
    source/step, cart and retry history and chooses the next action.
    """

    if not groq_client:
        raise RuntimeError(
            "Groq is not configured; the recovery agent cannot "
            "analyze the payment failure."
        )

    amount = payment.get("amount", 0)
    method = payment.get("method") or "unknown"
    bank = payment.get("bank") or "unknown"

    failure_reason = (
        payment.get("failure_reason")
        or "unknown"
    )

    raw_failure_reason = (
        payment.get("razorpay_failure_reason")
        or "unknown"
    )

    failure_code = (
        payment.get("razorpay_failure_code")
        or "unknown"
    )

    failure_description = (
        payment.get("razorpay_failure_description")
        or "No failure description was provided."
    )

    failure_source = (
        payment.get("razorpay_failure_source")
        or "unknown"
    )

    failure_step = (
        payment.get("razorpay_failure_step")
        or "unknown"
    )

    retry_attempts = safe_retry_count(payment)
    cart_summary = build_cart_summary(payment)

    prompt = f"""
You are an autonomous revenue recovery agent
for an ecommerce payment system.

A customer attempted to make a payment, but the payment failed.

Your job is to reason about the available evidence and choose
the safest, most useful NEXT action.

Do NOT blindly choose the same response for every failure.
The decision should change when the evidence changes.

PAYMENT CONTEXT
---------------

Amount: ₹{amount}

Payment method:
{method}

Bank:
{bank}

Normalized failure reason:
{failure_reason}

Raw Razorpay failure reason:
{raw_failure_reason}

Razorpay failure code:
{failure_code}

Razorpay failure description:
{failure_description}

Razorpay failure source:
{failure_source}

Razorpay failure step:
{failure_step}

Failed attempts for this payment:
{retry_attempts}

Cart:
{json.dumps(cart_summary, ensure_ascii=False)}

DECISION FRAMEWORK
------------------

Think through these questions before selecting a strategy.

A. Does the supplied evidence suggest the problem may be temporary?
   If yes, retrying may be useful.

B. Does the evidence suggest the current payment method is invalid,
   unavailable, rejected, or otherwise unlikely to work?
   If yes, changing or updating the payment method may be better.

C. Does the evidence indicate that the payment state might be uncertain?
   If yes, avoid encouraging an immediate duplicate payment.

D. How many failed attempts have occurred?
   A later attempt should generally be more conservative.

E. Is there enough evidence to safely automate a recommendation?
   If not, choose MANUAL_REVIEW.

IMPORTANT
---------

- Use the actual evidence supplied above.
- Do not invent information.
- Do not assume a cause merely because a payment failed.
- Razorpay source and step are contextual evidence, not proof of a cause.
- A generic error must remain generic.
- If a failure is clearly temporary, retry can be appropriate.
- If the current method appears unusable from the supplied evidence,
  another method can be appropriate.
- If the state is uncertain, protect the customer from duplicate payment.
- Do not encourage endless retries.
- Previous attempts matter.
- Never claim that the payment succeeded.

RETRY GUIDANCE
--------------

This is guidance, not a fixed mapping.

0 failed attempts:
A reasonable retry may be considered when the evidence supports it.

1 failed attempt:
Consider whether repeating the same method still makes sense.

2 or more failed attempts:
Prefer a different recovery path unless the evidence strongly
supports another retry.

If the payment may already be processing or its final state is unclear:
prefer CHECK_PAYMENT_STATUS.

AVAILABLE STRATEGIES
--------------------

RETRY_PAYMENT
Ask the customer to try the payment again now.

CHANGE_PAYMENT_METHOD
Ask the customer to use another payment method.

WAIT_AND_RETRY
Tell the customer the issue appears temporary and suggest trying again later.

CHECK_PAYMENT_STATUS
Use when the payment state may be uncertain and another attempt could
create duplicate-payment risk.

UPDATE_PAYMENT_METHOD
Use when the current payment method appears invalid or unusable.

MANUAL_REVIEW
Use when the available evidence is insufficient for a safe automated recovery.

CUSTOMER-FACING RULES
---------------------

The customer should see a normal store message.

Do NOT mention:
- AI
- LLM
- agent
- model
- algorithm
- backend
- payment processor internals
- merchant dashboard
- internal reasoning

Do NOT invent:
- discounts
- coupons
- free shipping
- rewards
- urgency
- scarcity
- refunds
- guarantees
- unsupported causes

The message should:
- be concise
- sound human
- explain what the customer can do next
- match the chosen strategy
- avoid blaming the customer
- avoid claiming something is definitely wrong when the evidence
  does not establish that

BUTTON RULES
------------

The button label must match the selected strategy.

RETRY_PAYMENT -> "Try again"
CHANGE_PAYMENT_METHOD -> "Use another method"
WAIT_AND_RETRY -> "Try again later"
CHECK_PAYMENT_STATUS -> "Check payment status"
UPDATE_PAYMENT_METHOD -> "Update payment"
MANUAL_REVIEW -> "Continue"

Return ONLY valid JSON in exactly this structure:

{{
  "decision": "one recovery strategy",
  "action": "short internal description of what the system should do",
  "reason": "short internal explanation based on actual evidence",
  "customer_title": "short natural customer-facing title",
  "customer_message": "short natural customer-facing message",
  "suggested_action": "same recovery strategy",
  "suggested_action_label": "short customer-facing button label"
}}
"""

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a careful ecommerce payment "
                        "recovery decision engine. "
                        "Reason from supplied evidence only, "
                        "adapt to retry history, never invent facts, "
                        "and return valid JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.3,
            max_completion_tokens=800,
            response_format={"type": "json_object"},
        )

        result = json.loads(
            clean_llm_json(
                response.choices[0].message.content
            )
        )

        return validate_payment_recovery_result(result)

    except Exception as error:
        print("Payment recovery LLM error:", error)
        raise RuntimeError(
            "The recovery agent could not analyze the payment failure."
        ) from error


# =========================================================
# AGENT DECISION ENGINE
# =========================================================

def decide_action(payment):
    reason = (
        payment.get("failure_reason")
        or ""
    ).lower()

    if reason == "checkout_abandoned":
        return generate_checkout_recovery(payment)

    if reason == "subscription_payment_failed":
        return generate_subscription_recovery(payment)

    if reason == "promise_missed":
        return generate_promise_recovery(payment)

    return generate_payment_recovery(payment)


# =========================================================
# PROCESS ONE PAYMENT
# =========================================================

def process_payment_with_agent(payment):
    retry_attempts = safe_retry_count(payment)

    decision = decide_action(payment)

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

    # -----------------------------------------------------
    # CHECKOUT ABANDONMENT
    # -----------------------------------------------------

    if payment.get("failure_reason") == "checkout_abandoned":
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
        payment["recovered_by_agent"] = False
        payment["status"] = "subscription_recovery"

        return {
            "result": "Recovery Intervention",
            "retry_attempt": "No automatic retry",
            **decision,
        }

    # -----------------------------------------------------
    # PROMISE TO PAY
    # -----------------------------------------------------

    if payment.get("failure_reason") == "promise_missed":
        payment["recovered_by_agent"] = False
        payment["status"] = "promise_missed"

        return {
            "result": "Recovery Intervention",
            "retry_attempt": "No automatic retry",
            **decision,
        }

    # -----------------------------------------------------
    # ACTUAL PAYMENT FAILURE
    # -----------------------------------------------------
    #
    # IMPORTANT:
    # The agent recommends an action.
    # It does NOT mark the payment successful.
    #
    # A real successful Razorpay payment can only be recorded
    # through the verified Razorpay success callback.
    # -----------------------------------------------------

    payment["recovered_by_agent"] = False

    if decision["decision"] == "CHECK_PAYMENT_STATUS":
        payment["status"] = "payment_pending_review"
    else:
        payment["status"] = "payment_recovery_intervention"

    return {
        "result": "Recovery Intervention",
        "retry_attempt": (
            f"Failed attempt {retry_attempts} "
            f"of {MAX_RETRIES}"
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
# REVENUE AUTOPILOT
# =========================================================

@app.route("/revenue-autopilot", methods=["GET"])
def get_revenue_autopilot():
    return jsonify(load_revenue_autopilot())


# =========================================================
# CREATE REAL RAZORPAY ORDER
# =========================================================

@app.route("/create-order", methods=["POST"])
def create_order():
    """
    Create a Razorpay order AND create/update the internal payment
    record that represents the same checkout attempt.

    The internal payment record is deliberately created here instead
    of only during checkout abandonment. This means a customer can
    reach checkout and pay normally without first triggering recovery.
    """
    payload = request.get_json(silent=True) or {}

    amount = payload.get("amount")
    payment_id = payload.get("payment_id")
    customer_id = payload.get("customer_id") or "lab_checkout_customer"
    cart = payload.get("cart") or []

    if not amount:
        return jsonify({
            "success": False,
            "message": "amount is required."
        }), 400

    try:
        numeric_amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "amount must be a valid number."
        }), 400

    if numeric_amount <= 0:
        return jsonify({
            "success": False,
            "message": "amount must be greater than zero."
        }), 400

    if not isinstance(cart, list):
        cart = []

    if not razorpay_client:
        return jsonify({
            "success": False,
            "message": "Razorpay is not configured."
        }), 500

    # Reuse the same internal payment record for retries.
    # A completely normal first checkout gets a new ID here.
    if not payment_id:
        payment_id = (
            f"lab_checkout_payment_"
            f"{os.urandom(4).hex()}"
        )

    payment = find_payment_by_id(payment_id)

    if payment is None:
        payment = {
            "payment_id": payment_id,
            "customer_id": customer_id,
            "amount": numeric_amount,
            "status": "initiated",
            "bank": "UNKNOWN",
            "method": "checkout",
            "retry_attempts": 0,
            "recovered_by_agent": False,
            "source": "razorpay",
            "event_type": "checkout_payment",
            "created_at": datetime.utcnow().isoformat(),
        }
    else:
        # Keep the recovery history, but move the current payment
        # record back to an active attempt.
        payment["amount"] = numeric_amount
        payment["customer_id"] = customer_id or payment.get(
            "customer_id",
            "lab_checkout_customer"
        )
        payment["source"] = "razorpay"
        payment["event_type"] = "checkout_payment"
        payment["status"] = "initiated"
        payment["recovered_by_agent"] = False

    if cart:
        payment["cart"] = cart

    try:
        amount_paise = int(round(numeric_amount * 100))

        order = razorpay_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": (
                f"demo_receipt_"
                f"{os.urandom(4).hex()}"
            ),
        })

        payment["razorpay_order_id"] = order.get("id")
        payment["payment_attempt_started_at"] = datetime.utcnow().isoformat()
        upsert_payment(payment)

        return jsonify({
            "success": True,
            "order": order,
            "key_id": RAZORPAY_KEY_ID,
            "payment_id": payment_id,
            "payment": payment,
        })

    except Exception as error:
        payment["status"] = "order_creation_failed"
        payment["order_error"] = str(error)
        payment["payment_attempt_failed_at"] = datetime.utcnow().isoformat()
        upsert_payment(payment)

        print(
            "Razorpay order creation error:",
            error
        )

        return jsonify({
            "success": False,
            "message": "Unable to create Razorpay order.",
            "error": str(error),
            "payment_id": payment_id,
        }), 500


# =========================================================
# REAL RAZORPAY PAYMENT RESULT
# =========================================================

@app.route(
    "/razorpay-payment-result",
    methods=["POST"]
)
def razorpay_payment_result():
    """
    Receives the actual result from Razorpay Checkout.

    SUCCESS:
        Verify signature and record the successful payment.
        The recovery agent is NOT called.

    FAILURE:
        Preserve Razorpay failure context, increment the
        failed-attempt count, call the LLM recovery agent,
        and return its customer-facing intervention.
    """

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

    # These two fields come from Razorpay's payment.failed
    # event and give the recovery agent more context.
    failure_source = payload.get(
        "razorpay_failure_source"
    ) or ""

    failure_step = payload.get(
        "razorpay_failure_step"
    ) or ""

    if not payment_id:
        return jsonify({
            "success": False,
            "message": "payment_id is required.",
        }), 400

    if status not in {"success", "failed"}:
        return jsonify({
            "success": False,
            "message": (
                "status must be success or failed."
            ),
        }), 400

    # -----------------------------------------------------
    # FIND PAYMENT
    # -----------------------------------------------------

    payment = find_payment_by_id(payment_id)

    if payment is None:
        return jsonify({
            "success": False,
            "message": (
                f"Payment {payment_id} "
                "was not found."
            ),
        }), 404

    payment["source"] = "razorpay"

    if razorpay_payment_id:
        payment["razorpay_payment_id"] = (
            razorpay_payment_id
        )

    if razorpay_order_id:
        payment["razorpay_order_id"] = (
            razorpay_order_id
        )

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
                ),
            }), 400

        if not razorpay_signature:
            return jsonify({
                "success": False,
                "message": (
                    "Missing Razorpay signature."
                ),
            }), 400

        if not razorpay_client:
            return jsonify({
                "success": False,
                "message": (
                    "Razorpay is not configured."
                ),
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

        # SUCCESS = NO AGENT INTERVENTION.
        payment["status"] = "success"
        payment["recovered_by_agent"] = False
        payment["recovery_outcome"] = "payment_success"
        payment["customer_action"] = "PAYMENT_SUCCESS"
        payment["customer_action_at"] = (
            datetime.utcnow().isoformat()
        )

        upsert_payment(payment)

        record_revenue_event(
            source="checkout",
            event_type="checkout_success",
            amount=payment.get("amount", 0),
            payment_id=payment.get("payment_id"),
            customer=payment.get("customer_id"),
            description="Checkout payment completed",
            status="completed",
            recoverable=False,
        )

        return jsonify({
            "success": True,
            "payment": payment,
            "decision": "PAYMENT_SUCCESS",
            "action": "Payment completed successfully",
            "reason": (
                "Razorpay payment was completed "
                "and verified."
            ),
            "recovered": False,
            "agent_intervened": False,
            "message": (
                "Payment completed successfully."
            ),
        })

    # =====================================================
    # FAILURE
    # =====================================================

    raw_reason = str(
        failure_reason
        or failure_code
        or failure_description
        or "unrecognized_processor_error"
    )

    normalized_input = raw_reason.lower()

    # Preserve the raw Razorpay values.
    payment["razorpay_failure_code"] = (
        failure_code
    )

    payment["razorpay_failure_description"] = (
        failure_description
    )

    payment["razorpay_failure_reason"] = (
        failure_reason
    )

    payment["razorpay_failure_source"] = (
        failure_source
    )

    payment["razorpay_failure_step"] = (
        failure_step
    )

    # -----------------------------------------------------
    # NORMALIZE ONLY FOR INTERNAL CATEGORY REPORTING
    # -----------------------------------------------------

    if "timeout" in normalized_input:
        normalized_reason = (
            "upi_timeout"
            if payment.get("method") == "upi"
            else "gateway_timeout"
        )

    elif "network" in normalized_input:
        normalized_reason = "network_error"

    elif "insufficient" in normalized_input:
        normalized_reason = "insufficient_funds"

    elif "expired" in normalized_input:
        normalized_reason = "expired_card"

    elif "authentication" in normalized_input:
        normalized_reason = "authentication_failed"

    elif "duplicate" in normalized_input:
        normalized_reason = "duplicate_payment_risk"

    elif (
        "limit" in normalized_input
        or "exceeded" in normalized_input
    ):
        normalized_reason = "payment_limit_exceeded"

    elif (
        "bank" in normalized_input
        and "server" in normalized_input
    ):
        normalized_reason = "bank_server_error"

    else:
        normalized_reason = "unrecognized_processor_error"

    payment["failure_reason"] = normalized_reason

    # -----------------------------------------------------
    # INCREMENT FAILED ATTEMPT COUNT
    # -----------------------------------------------------
    #
    # First failure  -> retry_attempts = 1
    # Second failure -> retry_attempts = 2
    #
    # This lets the LLM adapt its decision over repeated attempts.
    # -----------------------------------------------------

    previous_attempts = safe_retry_count(payment)

    current_attempt = previous_attempts + 1

    payment["retry_attempts"] = current_attempt

    payment["last_payment_failure_at"] = (
        datetime.utcnow().isoformat()
    )

    payment["status"] = "failed"
    payment["recovered_by_agent"] = False

    # Save the actual failure before calling the agent.
    upsert_payment(payment)

    # -----------------------------------------------------
    # RUN RECOVERY AGENT
    # -----------------------------------------------------

    try:
        agent_result = process_payment_with_agent(
            payment
        )

    except Exception as error:
        print(
            "Payment recovery agent error:",
            error
        )

        payment["status"] = "payment_recovery_error"
        payment["recovered_by_agent"] = False
        payment["recovery_error"] = str(error)

        upsert_payment(payment)

        return jsonify({
            "success": False,
            "message": (
                "Payment failed, but the recovery "
                "agent could not analyze the failure."
            ),
            "payment": payment,
            "agent_intervened": False,
            "error": str(error),
        }), 503

    # -----------------------------------------------------
    # SAVE AGENT RESULT
    # -----------------------------------------------------

    upsert_payment(payment)

    append_recovery_log(
        payment,
        agent_result,
        "razorpay"
    )

    record_revenue_event(
        source="checkout",
        event_type="checkout_failed",
        amount=payment.get("amount", 0),
        payment_id=payment.get("payment_id"),
        customer=payment.get("customer_id"),
        description="Checkout payment failed",
        status="at_risk",
        recoverable=True,
    )

    return jsonify({
        "success": True,
        "payment": payment,
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "reason": agent_result["reason"],
        "result": agent_result["result"],
        "retry_attempt": agent_result["retry_attempt"],
        "recovered": False,
        "agent_intervened": True,
        "customer_intervention": {
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
        },
        "failure": {
            "reason": payment.get(
                "failure_reason"
            ),
            "code": payment.get(
                "razorpay_failure_code"
            ),
            "description": payment.get(
                "razorpay_failure_description"
            ),
            "source": payment.get(
                "razorpay_failure_source"
            ),
            "step": payment.get(
                "razorpay_failure_step"
            ),
        },
        "message": (
            "Payment failed and the recovery "
            "agent generated an intervention."
        ),
    })


# =========================================================
# CUSTOMER PAYMENT — LEGACY DEMO FLOW
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
            "message": "payment_id is required.",
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
    payment["retry_attempts"] = 1

    payment.pop("decision", None)
    payment.pop("agent_decision", None)
    payment.pop("agent_reason", None)
    payment.pop("action", None)

    if not payment.get("failure_reason"):
        payment["failure_reason"] = (
            "unrecognized_processor_error"
        )

    try:
        agent_result = process_payment_with_agent(
            payment
        )

    except Exception as error:
        print(
            "Customer payment recovery error:",
            error
        )

        return jsonify({
            "success": False,
            "message": (
                "The recovery agent could not "
                "analyze the payment failure."
            ),
            "error": str(error),
        }), 503

    upsert_payment(payment)

    append_recovery_log(
        payment,
        agent_result,
        "customer_payment"
    )

    return jsonify({
        "success": True,
        "payment": payment,
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "reason": agent_result["reason"],
        "result": agent_result["result"],
        "recovered": False,
        "agent_intervened": True,
        "customer_intervention": {
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
        },
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

    promise = payload.get(
        "promise",
        {}
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
            "message": "amount must be a valid number.",
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
            "message": "cart must be an array.",
        }), 400

    if event_type == "promise_missed":
        if promise is None:
            promise = {}

        if not isinstance(promise, dict):
            return jsonify({
                "success": False,
                "message": "promise must be an object.",
            }), 400

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
        "customer_id": event_config[
            "customer_id"
        ],
        "amount": numeric_amount,
        "status": "failed",
        "bank": event_config[
            "bank"
        ],
        "method": event_config[
            "method"
        ],
        "failure_reason": event_config[
            "failure_reason"
        ],
        "retry_attempts": 0,
        "recovered_by_agent": False,
        "source": event_config[
            "source"
        ],
        "created_at": datetime.utcnow().isoformat(),
    }

    if event_type == "checkout_abandonment":
        payment["cart"] = cart
        payment["event_type"] = (
            "checkout_abandonment"
        )

    if event_type == "subscription_failure":
        subscription_payload = payload.get("subscription", {})

        if not isinstance(subscription_payload, dict):
            return jsonify({
                "success": False,
                "message": "subscription must be an object.",
            }), 400

        payment["subscription"] = subscription_payload

    if event_type == "promise_missed":
        payment["promise"] = promise

        payment["invoice_id"] = (
            promise.get("invoice_id")
        )

        payment["promise_date"] = (
            promise.get("promise_date")
        )

        payment["days_overdue"] = (
            promise.get("days_overdue", 0)
        )

        payment["previous_promises"] = (
            promise.get("previous_promises", 0)
        )

        payment["promises_kept"] = (
            promise.get("promises_kept", 0)
        )

        payment["promises_missed"] = (
            promise.get("promises_missed", 0)
        )

        payment["previous_recovery_attempts"] = (
            promise.get(
                "previous_recovery_attempts",
                0
            )
        )

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

    upsert_payment(payment)

    append_recovery_log(
        payment,
        agent_result,
        event_config["source"]
    )

    autopilot_source = {
        "checkout_abandonment": "checkout",
        "subscription_failure": "subscription",
        "promise_missed": "invoice",
    }[event_type]

    record_revenue_event(
        source=autopilot_source,
        event_type=event_type,
        amount=payment.get("amount", 0),
        payment_id=payment.get("payment_id"),
        customer=payment.get("customer_id"),
        description={
            "checkout_abandonment": "Checkout abandoned",
            "subscription_failure": "Subscription renewal failed",
            "promise_missed": "Promise-to-pay was missed",
        }[event_type],
        status="at_risk",
        recoverable=True,
    )

    return jsonify({
        "success": True,
        "payment_id": payment["payment_id"],
        "payment": payment,
        "decision": agent_result["decision"],
        "action": agent_result["action"],
        "reason": agent_result["reason"],
        "result": agent_result["result"],
        "retry_attempt": agent_result["retry_attempt"],
        "recovered": False,
        "customer_intervention": {
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
        },
        "message": (
            "Recovery Lab event was processed "
            "by the recovery agent."
        ),
    })


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
            "message": "payment_id is required.",
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

    if payment.get("failure_reason") != "checkout_abandoned":
        return jsonify({
            "success": False,
            "message": (
                "This payment is not a "
                "checkout-abandonment event."
            ),
        }), 400

    action_time = datetime.utcnow().isoformat()

    payment["customer_action"] = customer_action
    payment["customer_action_at"] = action_time

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

    # Update the most recent matching recovery log entry.
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
            ) == payment_id
        ):
            matching_index = index
            break

    if matching_index is not None:
        recovery_log[
            matching_index
        ]["customer_action"] = customer_action

        recovery_log[
            matching_index
        ]["customer_action_at"] = action_time

        recovery_log[
            matching_index
        ]["recovery_outcome"] = payment.get(
            "recovery_outcome"
        )

    save_recovery_log(recovery_log)

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

        if payment.get(
            "failure_reason"
        ) == "checkout_abandoned":
            continue

        try:
            agent_result = process_payment_with_agent(
                payment
            )
        except Exception as error:
            print(
                "Manual agent run error:",
                error
            )
            continue

        processed_count += 1

        recovery_log.append({
            "payment_id": payment[
                "payment_id"
            ],
            "customer_id": payment.get(
                "customer_id"
            ),
            "decision": agent_result[
                "decision"
            ],
            "action": agent_result[
                "action"
            ],
            "result": agent_result[
                "result"
            ],
            "retry_attempt": agent_result[
                "retry_attempt"
            ],
            "reason": agent_result[
                "reason"
            ],
            "customer_title": payment.get(
                "customer_title"
            ),
            "customer_message": payment.get(
                "customer_message"
            ),
            "suggested_action": payment.get(
                "suggested_action"
            ),
            "suggested_action_label": payment.get(
                "suggested_action_label"
            ),
            "created_at": datetime.utcnow().isoformat(),
            "source": "manual_agent_run",
        })

    save_payments(payments)
    save_recovery_log(recovery_log)

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
        ) in {
            "failed",
            "payment_recovery_intervention",
            "payment_pending_review",
            "payment_recovery_error",
        }
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
            "recovered": len(recovered),
            "needs_attention": len(at_risk),
        },
    })


# =========================================================
# REVENUE AUTOPILOT SIMULATIONS
# =========================================================

@app.route("/revenue-autopilot/simulate", methods=["POST"])
def simulate_revenue_autopilot():
    payload = request.get_json(silent=True) or {}
    scenario = payload.get("scenario", "payment_failure_spike")

    scenarios = {
        "payment_failure_spike": [
            ("checkout", "checkout_failed", 6999, "Acme Systems", "Checkout payment failed"),
            ("checkout", "checkout_failed", 3499, "Northstar Labs", "Checkout payment failed"),
            ("checkout", "checkout_abandoned", 5299, "PixelWorks", "Checkout abandoned"),
        ],
        "renewal_day": [
            ("subscription", "subscription_failure", 2499, "Nova Technologies", "Subscription renewal failed"),
            ("subscription", "subscription_failure", 7999, "BrightDesk", "Subscription payment method needs attention"),
            ("subscription", "subscription_failure", 4499, "Vertex Labs", "Subscription renewal failed"),
        ],
        "checkout_dropoff": [
            ("checkout", "checkout_abandoned", 8999, "Orbit Commerce", "High-intent checkout abandoned"),
            ("checkout", "checkout_abandoned", 4499, "Acme Systems", "Checkout abandoned"),
            ("checkout", "checkout_failed", 11999, "Nova Technologies", "Checkout payment failed"),
        ],
        "revenue_shock": [
            ("invoice", "invoice_overdue", 45000, "Orion Systems", "Large invoice became overdue"),
            ("subscription", "subscription_failure", 12999, "Vertex Labs", "Enterprise renewal failed"),
            ("checkout", "checkout_failed", 15999, "Zenith Retail", "High-value checkout payment failed"),
        ],
    }

    selected = scenarios.get(scenario)
    if not selected:
        return jsonify({"success": False, "message": "Unknown revenue simulation scenario."}), 400

    created = []
    for source, event_type, amount, customer, description in selected:
        created.append(record_revenue_event(
            source=source,
            event_type=event_type,
            amount=amount,
            customer=customer,
            description=description,
            status="at_risk",
            recoverable=True,
        ))

    plans = []
    for index, event in enumerate(created):
        source = event.get("source")
        amount = float(event.get("amount", 0) or 0)
        if source == "checkout":
            action = "RETRY_PAYMENT"
            title = "Recover checkout payment"
            reason = "Fresh payment intent makes an immediate retry the highest-value move."
        elif source == "subscription":
            action = "UPDATE_PAYMENT_METHOD"
            title = "Protect recurring revenue"
            reason = "Renewal risk is high; payment-method recovery is the next best action."
        else:
            action = "REQUEST_COMMITMENT"
            title = "Re-engage overdue account"
            reason = "Invoice risk needs a customer commitment before escalation."
        if scenario == "revenue_shock" and index == len(created) - 1:
            action = "MANUAL_REVIEW"
            title = "Escalate high-value exception"
            reason = "The amount and mixed signals make human review safer than blind automation."
        if scenario == "renewal_day" and index == len(created) - 1:
            action = "MANUAL_REVIEW"
            title = "Review renewal exception"
            reason = "Multiple renewal failures require a controlled recovery decision."
        plans.append({
            "action_id": f"action_{event.get('event_id')}",
            "event_id": event.get("event_id"),
            "title": title,
            "action": action,
            "reason": reason,
            "amount": amount,
        })

    return jsonify({
        "success": True,
        "scenario": scenario,
        "events": created,
        "plan": plans,
        "state": load_revenue_autopilot(),
    })


@app.route("/revenue-autopilot/execute", methods=["POST"])
def execute_revenue_autopilot():
    payload = request.get_json(silent=True) or {}
    event_id = payload.get("event_id")
    action = payload.get("action", "MANUAL_REVIEW")

    if not event_id:
        return jsonify({"success": False, "message": "Missing event_id."}), 400

    state = load_revenue_autopilot()
    events = state.get("events", [])
    target = next((event for event in events if event.get("event_id") == event_id), None)

    if target is None:
        return jsonify({"success": False, "message": "Revenue event not found."}), 404

    # This is the demo decision layer: high-confidence checkout/subscription
    # actions recover automatically; invoice/manual-review actions stay exposed.
    if action in {"RETRY_PAYMENT", "UPDATE_PAYMENT_METHOD"}:
        target["status"] = "recovered"
        target["recoverable"] = False
        target["description"] = (
            "Checkout payment recovered"
            if action == "RETRY_PAYMENT"
            else "Subscription payment method recovered"
        )
    else:
        target["status"] = "at_risk"
        target["recoverable"] = True

    target["updated_at"] = datetime.utcnow().isoformat()
    updated = build_revenue_autopilot_state(events)
    save_revenue_autopilot(updated)

    return jsonify({
        "success": True,
        "action": action,
        "event": target,
        "state": updated,
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

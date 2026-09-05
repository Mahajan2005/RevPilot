# RevPilot

### Autonomous Revenue Recovery

RevPilot is an AI-powered revenue recovery platform that helps merchants identify revenue at risk, understand why it is at risk, and choose the next best recovery action.

Instead of treating every failed payment the same way, RevPilot uses payment context, customer history, retry history, and recovery signals to decide what should happen next.

---

## What RevPilot Does

RevPilot brings three recovery scenarios into one system and surfaces the resulting revenue impact through **Revenue Autopilot**.

### 🧪 Recovery Lab

A hands-on sandbox for demonstrating the recovery agents.

You can simulate:

- **Checkout abandonment** — a customer leaves after adding products to their cart.
- **Payment failure** — a customer attempts payment but it does not go through.
- **Subscription renewal failure** — a recurring payment fails and the customer's history is considered.
- **Promise-to-Pay miss** — a customer misses a previously promised invoice payment.

The agent uses the available context to choose a recovery strategy and generate a customer-facing intervention.

### 🛒 Checkout Recovery

For abandoned checkouts, RevPilot can use the cart contents — including product descriptions — to create a contextual recovery message rather than a generic reminder.

### 💳 Payment Failure Recovery

When a payment fails, the agent evaluates the available failure information and retry history to decide whether the customer should:

- try the payment again,
- use another payment method,
- update their payment method,
- wait and retry,
- check the payment status, or
- be escalated for review.

The goal is to give the customer a useful next step instead of simply saying that the payment failed.

### 🔄 Subscription Recovery

The agent considers renewal history and previous recovery attempts. A first-time failure for a reliable subscriber can be treated differently from repeated failures.

### 🤝 Promise-to-Pay

For overdue invoices, the agent considers previous promises, promises kept or missed, and previous recovery attempts before deciding on the appropriate intervention.

### 🚀 Revenue Autopilot

Revenue Autopilot is the merchant-level view of the system.

It tracks:

| Metric | Meaning |
|---|---|
| **Expected Revenue** | Current revenue baseline |
| **Revenue at Risk** | Revenue currently exposed to a recovery event |
| **Recoverable Revenue** | Revenue that can potentially be recovered |
| **Recovered Revenue** | Revenue already brought back |

It also breaks revenue risk down by recovery origin such as checkout, subscriptions, and invoices.

---

## The Core Idea

RevPilot follows a simple loop:

```text
Detect → Understand → Decide → Recover → Measure
```

The AI agent is not only generating a message.

It receives context, reasons over that context, selects a recovery strategy, and produces the appropriate intervention. Deterministic validation and application logic remain around the model to keep the demo behavior controlled.

---

## High-Level Architecture

```text
                    Customer / Payment Event
                              │
                              ▼
                       ┌─────────────┐
                       │ Recovery Lab│
                       └──────┬──────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
       Checkout Recovery  Subscription     Promise-to-Pay
                          Recovery           Recovery
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                     ┌─────────────────┐
                     │ Revenue Autopilot│
                     └────────┬────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
          Revenue at Risk  Recoverable   Recovered
                           Revenue        Revenue
```

---

# Run RevPilot Locally

## 1. Prerequisites

Install:

- **Python 3.10+**
- **Node.js 20.19+**
- **npm**
- A **Groq API key** for the AI recovery agent
- Razorpay test credentials if you want to use the Razorpay payment integration

> The project is designed as a local demo. The frontend and Flask backend run separately.

---

## 2. Clone the repository

```bash
git clone https://github.com/Mahajan2005/RevPilot.git
cd RevPilot
```

---

## 3. Set up the Python backend

Create and activate a virtual environment:

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

Install the backend dependencies:

```bash
pip install flask flask-cors python-dotenv groq razorpay
```

---

## 4. Configure environment variables

Create a file named:

```text
.env
```

in the **project root**, next to `server.py`.

Add:

```env
GROQ_API_KEY=your_groq_api_key

RAZORPAY_KEY_ID=your_razorpay_test_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_key_secret
```

### Important

Never commit `.env` to GitHub.

The repository's `.gitignore` already excludes `.env` and `.venv/`.

If you only want to run the AI recovery demo, the Groq key is the important credential. Razorpay credentials are used for the payment integration.

---

## 5. Start the backend

From the project root:

```bash
python server.py
```

On macOS, if `python` points to an older installation, use:

```bash
python3 server.py
```

The Flask backend runs at:

```text
http://127.0.0.1:5000
```

You can also check that it is running by opening:

```text
http://127.0.0.1:5000/health
```

A successful response includes the backend status and whether the Groq/Razorpay clients are configured.

---

## 6. Start the frontend

Open a **second terminal**.

From the project root:

```bash
cd frontend
npm install
npm run dev
```

Vite will start the frontend, normally at:

```text
http://localhost:5173
```

Open that address in your browser.

---

# Using the Demo

Once both the backend and frontend are running:

### Option 1 — Recovery Lab

Open **Recovery Lab** from the main dashboard.

Use the scenarios to demonstrate:

1. **Checkout Recovery**
   - Browse/add products.
   - Reach checkout.
   - Abandon the checkout.
   - Observe the recovery agent's contextual intervention.

2. **Payment Failure**
   - Simulate a failed payment.
   - The agent evaluates the failure context and chooses a useful next action.

3. **Subscription Renewal**
   - Test different subscriber histories.
   - Compare how the agent behaves for isolated versus repeated failures.

4. **Promise-to-Pay**
   - Simulate a missed payment promise.
   - Observe how previous promises and recovery attempts influence the decision.

### Option 2 — Revenue Autopilot

Open **Revenue Autopilot** from the sidebar.

Here you can see:

- Expected Revenue
- Revenue at Risk
- Recoverable Revenue
- Recovered Revenue
- Revenue exposure by source
- Recovery logic
- Live recovery events
- Merchant-level recovery simulations

The Recovery Lab demonstrates the individual recovery decisions; Revenue Autopilot shows their impact at the merchant level.

---

# Project Structure

```text
RevPilot/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── RecoveryLab.tsx
│   │   ├── CheckoutSimulator.tsx
│   │   ├── SubscriptionRecovery.tsx
│   │   ├── PromiseToPay.tsx
│   │   ├── RevenueAutopilot.tsx
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   └── main.py
│
├── data/
│   ├── payments.json
│   ├── recovery_log.json
│   └── revenue_autopilot.json
│
├── server.py
├── .gitignore
└── README.md
```

### Main pieces

**`server.py`**  
Primary Flask backend. Handles recovery-agent logic, payment/recovery state, Revenue Autopilot state, and API endpoints.

**`frontend/src/RecoveryLab.tsx`**  
Interactive recovery simulation and customer-facing recovery flows.

**`frontend/src/RevenueAutopilot.tsx`**  
Merchant dashboard for revenue risk, recovery metrics, simulations, and live events.

**`data/`**  
Local JSON data used by the demo.

**`backend/main.py`**  
Contains an additional/earlier agent-tool demonstration. The main application is started with `server.py`.

---

# Troubleshooting

### Frontend says it cannot connect to the backend

Make sure the Flask server is running:

```bash
python server.py
```

Then check:

```text
http://127.0.0.1:5000/health
```

Also make sure the frontend is running on:

```text
http://localhost:5173
```

### The AI recovery agent is not generating responses

Check that `.env` exists in the project root and contains:

```env
GROQ_API_KEY=your_groq_api_key
```

Then restart the Flask server.

### The demo data looks different after testing

The application stores demo state in the `data/` directory.

Use the **Reset demo** control in the application when available to restore the demo state.

### `npm install` or `npm run dev` fails

Check your Node.js version:

```bash
node --version
```

The project uses Vite 8 and is intended for a modern Node.js version.

---

# Tech Stack

**Frontend**
- React
- TypeScript
- Vite

**Backend**
- Python
- Flask
- Flask-CORS

**AI**
- Groq API
- LLM-based recovery decisioning

**Payments**
- Razorpay test integration

**Storage**
- Local JSON files for the demo state

---

## Why RevPilot?

Most payment systems tell merchants **what went wrong**.

RevPilot focuses on **what to do next**.

It turns revenue recovery from a manual monitoring task into an intelligent decision loop:

> **Identify revenue at risk → understand the context → choose the right recovery action → recover revenue → measure the outcome.**

---

## Demo Note

RevPilot is a buildathon/demo project. Payment actions and recovery outcomes are intentionally controlled by the application's demo logic and should not be treated as production payment-processing behavior.

---

## License

No license has been added to this repository yet.

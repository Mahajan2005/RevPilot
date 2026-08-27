import os
import json
from dotenv import load_dotenv
from groq import Groq

# Load payment data
with open("data/payments.json", "r") as file:
    payments = json.load(file)

print(payments)


# Tool function
def retry_payment(payment_id):
    print(f"🔄 Retrying payment: {payment_id}")

    for payment in payments:
        if payment["payment_id"] == payment_id:

            payment["status"] = "success"
            payment["recovered_by_agent"] = True

            payment.pop("failure_reason", None)

            with open("data/payments.json", "w") as file:
                json.dump(payments, file, indent=2)

            return {
                "payment_id": payment_id,
                "status": "success",
                "message": "Payment successfully retried and recovered."
            }

    return {
        "payment_id": payment_id,
        "status": "failed",
        "message": "Payment not found."
    }

def send_customer_message(customer_id, message):
    print(f"📨 Sending message to {customer_id}...")

    # Create a recovery activity log entry
    log_entry = {
        "customer_id": customer_id,
        "message": message,
        "status": "message_sent"
    }

    # Load existing log if it exists
    try:
        with open("data/recovery_log.json", "r") as file:
            recovery_log = json.load(file)
    except FileNotFoundError:
        recovery_log = []

    # Add the new message
    recovery_log.append(log_entry)

    # Save the updated log
    with open("data/recovery_log.json", "w") as file:
        json.dump(recovery_log, file, indent=2)

    return log_entry

def calculate_recovery_summary():
    total_recovered = 0
    total_at_risk = 0

    recovered_payments = []
    at_risk_payments = []

    for payment in payments:

        if payment.get("recovered_by_agent") == True:
            total_recovered += payment["amount"]
            recovered_payments.append(payment["payment_id"])

        elif payment["status"] == "failed":
            total_at_risk += payment["amount"]
            at_risk_payments.append(payment["payment_id"])

    return {
        "total_recovered": total_recovered,
        "total_at_risk": total_at_risk,
        "recovered_payments": recovered_payments,
        "at_risk_payments": at_risk_payments
    }

# Load environment variables
load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


# Define the tool the AI is allowed to use
tools = [
    {
        "type": "function",
        "function": {
            "name": "retry_payment",
            "description": "Retry a failed payment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "payment_id": {
                        "type": "string",
                        "description": "The ID of the failed payment to retry."
                    }
                },
                "required": ["payment_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_customer_message",
            "description": "Send a message to a customer about their failed payment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The ID of the customer to contact."
                    },
                    "message": {
                        "type": "string",
                        "description": "The message to send to the customer."
                    }
                },
                "required": ["customer_id", "message"]
            }
        }
    }
]


# Connect tool name to actual Python function
available_functions = {
    "retry_payment": retry_payment,
    "send_customer_message": send_customer_message
}


# Execute a tool requested by the AI
def execute_tool_call(tool_call):
    function_name = tool_call.function.name
    function_args = json.loads(tool_call.function.arguments)

    function_to_call = available_functions[function_name]

    return function_to_call(**function_args)


# Initial conversation
messages = [
    {
        "role": "user",
        "content": f"""You are a revenue recovery agent.

Here is our payment data:

{json.dumps(payments, indent=2)}

Analyze ALL failed payments and decide what action should be taken for each one.

Rules:

1. If failure_reason is "bank_server_error":
   - Use the retry_payment tool.
   - Retry the payment.

2. If failure_reason is "insufficient_funds":
   - Do NOT retry the payment.
   - Use the send_customer_message tool.
   - Send the customer a helpful message asking them to complete the payment using an available payment method.

3. If a payment is successful:
   - Do nothing.

Actually use the appropriate tools. Do not merely recommend actions.

After completing the actions, summarize what you did for each failed payment.
"""
    }
]


# Ask the AI to analyze the payments
response = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=messages,
    tools=tools,
)


# Get the AI's response
response_message = response.choices[0].message

while response_message.tool_calls:

    # Add the AI's tool request to the conversation
    messages.append(
        response_message.model_dump(exclude_none=True)
    )

    # Execute every tool requested by the AI
    for tool_call in response_message.tool_calls:

        print(f"🔧 Agent requested: {tool_call.function.name}")

        result = execute_tool_call(tool_call)

        print(f"⚙️ Tool result: {result}")

        # Give the tool result back to the AI
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "name": tool_call.function.name,
            "content": json.dumps(result)
        })

    # Ask the AI what to do next
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=messages,
        tools=tools
    )

    response_message = response.choices[0].message


# AI has finished using tools
print("\n🤖 Agent final response:")
print(response_message.content)

print("\n📊 Recovery Summary")

summary = calculate_recovery_summary()

print(f"💰 Revenue recovered: ₹{summary['total_recovered']}")
print(f"⚠️ Revenue still at risk: ₹{summary['total_at_risk']}")
print(f"✅ Recovered payments: {summary['recovered_payments']}")
print(f"❌ Payments still at risk: {summary['at_risk_payments']}")
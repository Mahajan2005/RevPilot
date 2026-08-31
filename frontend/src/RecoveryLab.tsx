import { useMemo, useState } from "react";
import "./RecoveryLab.css";

type RecoveryLabProps = {
  onBack: () => void;
};

type Mode =
  | "checkout"
  | "subscription"
  | "promise";

type Stage =
  | "shop"
  | "cart"
  | "checkout";

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  emoji: string;
  badge?: string;
  imageClass: string;
};

type CartItem = Product & {
  quantity: number;
};

type SimulationResult = {
    payment_id?: string;
  decision?: string;
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

const API_URL = "http://127.0.0.1:5000";

const PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Wireless Headphones",
    description: "Noise cancelling",
    price: 2999,
    emoji: "🎧",
    badge: "Bestseller",
    imageClass: "purple",
  },
  {
    id: 2,
    name: "Everyday Sneakers",
    description: "Lightweight running shoes",
    price: 4999,
    emoji: "👟",
    badge: "Popular",
    imageClass: "blue",
  },
  {
    id: 3,
    name: "Urban Backpack",
    description: "Water resistant · 22L",
    price: 1899,
    emoji: "🎒",
    badge: "Trending",
    imageClass: "pink",
  },
  {
    id: 4,
    name: "Mechanical Keyboard",
    description: "Wireless · RGB",
    price: 3499,
    emoji: "⌨️",
    imageClass: "green",
  },
  {
    id: 5,
    name: "Smart Watch",
    description: "Fitness & notifications",
    price: 6999,
    emoji: "⌚",
    imageClass: "orange",
  },
  {
    id: 6,
    name: "Essential T-Shirt",
    description: "Premium cotton",
    price: 999,
    emoji: "👕",
    imageClass: "lavender",
  },
];

function formatAmount(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function RecoveryLab({
  onBack,
}: RecoveryLabProps) {

  const [mode, setMode] =
    useState<Mode>("checkout");

  const [stage, setStage] =
    useState<Stage>("shop");

  const [cart, setCart] =
    useState<CartItem[]>([]);

  const [favorites, setFavorites] =
    useState<number[]>([]);

  const [couponApplied, setCouponApplied] =
    useState(false);

  const [customerIntervention, setCustomerIntervention] =
    useState<SimulationResult["customer_intervention"] | null>(
      null
    );

  const [checkoutCustomerAction, setCheckoutCustomerAction] =
    useState<
      | "RETURN_TO_CHECKOUT"
      | "KEEP_CART_SAVED"
      | "ABANDON"
      | null
    >(null);

  const [checkoutError, setCheckoutError] =
    useState("");

  const [agentRunning, setAgentRunning] =
    useState(false);

  const [subscriptionStarted, setSubscriptionStarted] =
    useState(false);

  const [promiseStarted, setPromiseStarted] =
    useState(false);

  const [subscriptionResult, setSubscriptionResult] =
    useState<SimulationResult | null>(null);

  const [promiseResult, setPromiseResult] =
    useState<SimulationResult | null>(null);

  const [checkoutPaymentId, setCheckoutPaymentId] =
    useState<string | null>(null);


  // =====================================================
  // CART
  // =====================================================

  const addToCart = (product: Product) => {

    setCart((current) => {

      const existing = current.find(
        (item) => item.id === product.id
      );

      if (existing) {

        return current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity:
                  item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  };


  const updateQuantity = (
    productId: number,
    change: number
  ) => {

    setCart((current) =>
      current
        .map((item) =>
          item.id === productId
            ? {
                ...item,
                quantity:
                  item.quantity + change,
              }
            : item
        )
        .filter(
          (item) => item.quantity > 0
        )
    );
  };


  const toggleFavorite = (id: number) => {

    setFavorites((current) =>
      current.includes(id)
        ? current.filter(
            (item) => item !== id
          )
        : [...current, id]
    );
  };


  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum +
          item.price * item.quantity,
        0
      ),
    [cart]
  );


  const shipping =
    subtotal === 0
      ? 0
      : subtotal >= 5000
        ? 0
        : 199;


  const discount = couponApplied
    ? Math.round(subtotal * 0.1)
    : 0;


  const total =
    subtotal +
    shipping -
    discount;


  const cartCount = cart.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );


  // =====================================================
  // MODE SWITCH
  // =====================================================

  const switchMode = (nextMode: Mode) => {

    setMode(nextMode);

    if (nextMode === "checkout") {
      setStage("shop");
    }
  };


  // =====================================================
  // RECOVERY LAB SIMULATION
  // =====================================================

  const runLabSimulation = async (
    eventType:
      | "checkout_abandonment"
      | "subscription_failure"
      | "promise_missed"
  ): Promise<SimulationResult | null> => {

    if (agentRunning) {
      return null;
    }

    setAgentRunning(true);

    try {

      const response = await fetch(
        `${API_URL}/lab-simulate`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            event_type: eventType,

            amount:
              eventType ===
              "checkout_abandonment"
                ? total
                : eventType ===
                    "subscription_failure"
                  ? 1499
                  : 24500,

            cart:
              eventType ===
              "checkout_abandonment"
                ? cart.map((item) => ({
                    id: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                  }))
                : [],
          }),
        }
      );

      if (!response.ok) {

        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      const data: SimulationResult =
        await response.json();


      // -------------------------------------------------
      // CHECKOUT
      // -------------------------------------------------

      if (
        eventType ===
        "checkout_abandonment"
      ) {
        const intervention =
          data.customer_intervention;

        // Never invent customer-facing copy in the frontend.
        // The intervention must come from the recovery agent.
        if (
          !intervention?.title ||
          !intervention?.message ||
          !intervention?.suggested_action ||
          !intervention?.suggested_action_label
        ) {
          throw new Error(
            "The recovery agent did not return a complete customer intervention."
          );
        }

        setCustomerIntervention(
          intervention
        );

        setCheckoutCustomerAction(null);
        setCheckoutError("");

        if (data.payment_id) {
          setCheckoutPaymentId(
            data.payment_id
          );
        }
      }


      return data;

    } catch (error) {

      console.error(
        "Recovery Lab error:",
        error
      );

      if (
        eventType ===
        "checkout_abandonment"
      ) {
        setCustomerIntervention(null);
        setCheckoutPaymentId(null);
        setCheckoutError(
          "The recovery agent could not generate a customer intervention."
        );
      }

      return null;

    } finally {

      setAgentRunning(false);
    }
  };


  // =====================================================
  // CHECKOUT CUSTOMER ACTION
  // =====================================================

  const recordCheckoutAction = async (
    action:
      | "RETURN_TO_CHECKOUT"
      | "KEEP_CART_SAVED"
      | "ABANDON"
  ) => {

    if (!checkoutPaymentId) {
      return;
    }

    try {

      const response = await fetch(
        `${API_URL}/checkout-action`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            payment_id:
              checkoutPaymentId,

            customer_action:
              action,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      setCheckoutCustomerAction(
        action
      );

      if (action === "RETURN_TO_CHECKOUT") {
        setStage("checkout");
      }

    } catch (error) {

      console.error(
        "Checkout action error:",
        error
      );

    }
  };



  // =====================================================
  // RESET CHECKOUT
  // =====================================================

  const resetCheckout = () => {

    setStage("shop");

    setCart([]);

    setCouponApplied(false);

    setCustomerIntervention(null);

    setCheckoutCustomerAction(null);

    setCheckoutError("");

    setAgentRunning(false);

    setCheckoutPaymentId(null);
  };


  // =====================================================
  // RESET SUBSCRIPTION
  // =====================================================

  const resetSubscription = () => {

    setSubscriptionStarted(false);

    setSubscriptionResult(null);

    setAgentRunning(false);
  };


  // =====================================================
  // RESET PROMISE
  // =====================================================

  const resetPromise = () => {

    setPromiseStarted(false);

    setPromiseResult(null);

    setAgentRunning(false);
  };


  return (
    <div className="recovery-lab">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="lab-header">

        <button
          className="lab-back-button"
          onClick={onBack}
          type="button"
        >
          ← Dashboard
        </button>

        <div className="lab-brand">

          <div className="lab-brand-mark">
            R
          </div>

          <div className="lab-brand-text">

            <strong>
              Recovery Lab
            </strong>

            <span>
              Revenue recovery simulator
            </span>

          </div>

        </div>

        <div className="lab-environment">

          <span className="live-dot" />

          Demo environment

        </div>

      </header>


      <div className="lab-layout">

        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="lab-sidebar">

          <div className="sidebar-heading">
            RECOVERY LAB
          </div>

          <p className="sidebar-description">
            Simulate different revenue-loss
            situations and see how the
            recovery agent responds.
          </p>

          <nav className="lab-navigation">

            <button
              className={
                mode === "checkout"
                  ? "lab-nav-item active"
                  : "lab-nav-item"
              }
              onClick={() =>
                switchMode("checkout")
              }
              type="button"
            >

              <span className="nav-icon">
                🛒
              </span>

              <span>

                <strong>
                  Checkout Recovery
                </strong>

                <small>
                  Recover abandoned carts
                </small>

              </span>

              {mode === "checkout" && (
                <span className="nav-arrow">
                  →
                </span>
              )}

            </button>


            <button
              className={
                mode === "subscription"
                  ? "lab-nav-item active"
                  : "lab-nav-item"
              }
              onClick={() =>
                switchMode("subscription")
              }
              type="button"
            >

              <span className="nav-icon">
                ↻
              </span>

              <span>

                <strong>
                  Subscription Recovery
                </strong>

                <small>
                  Recover failed renewals
                </small>

              </span>

              {mode === "subscription" && (
                <span className="nav-arrow">
                  →
                </span>
              )}

            </button>


            <button
              className={
                mode === "promise"
                  ? "lab-nav-item active"
                  : "lab-nav-item"
              }
              onClick={() =>
                switchMode("promise")
              }
              type="button"
            >

              <span className="nav-icon">
                🤝
              </span>

              <span>

                <strong>
                  Promise to Pay
                </strong>

                <small>
                  Recover overdue payments
                </small>

              </span>

              {mode === "promise" && (
                <span className="nav-arrow">
                  →
                </span>
              )}

            </button>

          </nav>


          <div className="sidebar-agent">

            <div className="sidebar-agent-icon">
              ✦
            </div>

            <div>

              <strong>
                Recovery Agent
              </strong>

              <span>
                {agentRunning
                  ? "Analyzing..."
                  : "Ready to analyze"}
              </span>

            </div>

            <span className="live-dot" />

          </div>

        </aside>


        {/* =================================================
            MAIN
        ================================================= */}

        <main className="lab-main">

          <div className="lab-breadcrumb">

            Recovery Lab

            <span>
              /
            </span>

            {mode === "checkout"
              ? "Checkout Recovery"
              : mode === "subscription"
                ? "Subscription Recovery"
                : "Promise to Pay"}

          </div>


          {/* =================================================
              CHECKOUT RECOVERY
          ================================================= */}

          {mode === "checkout" && (
            <>

              <div className="lab-page-heading">

                <div>

                  <div className="simulation-label">
                    SIMULATION 01
                  </div>

                  <h1>
                    Checkout Recovery
                  </h1>

                  <p>
                    Simulate a real customer
                    shopping journey and see
                    how the agent can recover
                    lost revenue.
                  </p>

                </div>


                <div className="journey-progress">

                  <div
                    className={
                      stage === "shop"
                        ? "journey-step active"
                        : "journey-step"
                    }
                  >
                    <span>
                      1
                    </span>
                    Shop
                  </div>

                  <div className="journey-line" />

                  <div
                    className={
                      stage === "cart"
                        ? "journey-step active"
                        : "journey-step"
                    }
                  >
                    <span>
                      2
                    </span>
                    Cart
                  </div>

                  <div className="journey-line" />

                  <div
                    className={
                      stage === "checkout"
                        ? "journey-step active"
                        : "journey-step"
                    }
                  >
                    <span>
                      3
                    </span>
                    Checkout
                  </div>

                </div>

              </div>


              {/* =================================================
                  SHOP
              ================================================= */}

              {stage === "shop" && (
                <>

                  <div className="lab-hero-card">

                    <div>

                      <span>
                        ✦ RECOVERY LAB
                      </span>

                      <h2>
                        What happens when
                        customers hesitate?
                      </h2>

                      <p>
                        Browse products, build
                        a cart and intentionally
                        leave checkout. The
                        agent will analyze the
                        journey.
                      </p>

                    </div>

                    <div className="hero-art">
                      🛍️
                    </div>

                  </div>


                  <div className="product-section-heading">

                    <div>

                      <h2>
                        Featured products
                      </h2>

                      <span>
                        Choose products to
                        simulate a purchase.
                      </span>

                    </div>


                    <button
                      className="floating-cart-button"
                      disabled={
                        cart.length === 0
                      }
                      onClick={() =>
                        setStage("cart")
                      }
                      type="button"
                    >

                      🛒

                      <span>
                        {cartCount}
                      </span>

                    </button>

                  </div>


                  <div className="product-grid">

                    {PRODUCTS.map(
                      (product) => (

                        <article
                          className="lab-product-card"
                          key={product.id}
                        >

                          <div
                            className={
                              `lab-product-image ${product.imageClass}`
                            }
                          >

                            {product.badge && (
                              <span className="product-badge">
                                ✦ {product.badge}
                              </span>
                            )}

                            <button
                              className="favorite-button"
                              onClick={() =>
                                toggleFavorite(
                                  product.id
                                )
                              }
                              type="button"
                            >

                              {favorites.includes(
                                product.id
                              )
                                ? "♥"
                                : "♡"}

                            </button>

                            <div className="large-product-emoji">
                              {product.emoji}
                            </div>

                          </div>


                          <div className="lab-product-info">

                            <div>

                              <h3>
                                {product.name}
                              </h3>

                              <p>
                                {product.description}
                              </p>

                            </div>


                            <div className="product-price-row">

                              <strong>
                                {formatAmount(
                                  product.price
                                )}
                              </strong>

                              <button
                                type="button"
                                onClick={() =>
                                  addToCart(
                                    product
                                  )
                                }
                              >
                                + Add
                              </button>

                            </div>

                          </div>

                        </article>

                      )
                    )}

                  </div>

                </>
              )}


              {/* =================================================
                  CART
              ================================================= */}

              {stage === "cart" && (
                <>

                  <div className="lab-page-heading compact">

                    <div>

                      <div className="simulation-label">
                        STEP 2
                      </div>

                      <h1>
                        Your cart
                      </h1>

                      <p>
                        This is where customer
                        intent becomes visible
                        to the recovery agent.
                      </p>

                    </div>


                    <button
                      className="outline-button"
                      onClick={() =>
                        setStage("shop")
                      }
                      type="button"
                    >
                      ← Continue shopping
                    </button>

                  </div>


                  {checkoutError && !agentRunning && (
                    <div className="agent-intervention-card customer-recovery-message">

                      <div className="agent-intervention-icon">
                        R
                      </div>

                      <div>
                        <strong>
                          Recovery agent unavailable
                        </strong>

                        <p>
                          {checkoutError}
                        </p>
                      </div>

                    </div>
                  )}

                  {customerIntervention && !agentRunning && (
                    <div className="agent-intervention-card customer-recovery-message">

                      <div className="agent-intervention-icon">
                        R
                      </div>

                      <div>

                        <strong>
                          {customerIntervention.title}
                        </strong>

                        <p>
                          {customerIntervention.message}
                        </p>

                      </div>

                      {!checkoutCustomerAction &&
                        customerIntervention.suggested_action &&
                        customerIntervention.suggested_action_label && (
                          <button
                            className="outline-button"
                            type="button"
                            onClick={() =>
                              recordCheckoutAction(
                                customerIntervention.suggested_action as
                                  | "RETURN_TO_CHECKOUT"
                                  | "KEEP_CART_SAVED"
                                  | "ABANDON"
                              )
                            }
                          >
                            {customerIntervention.suggested_action_label}
                          </button>
                        )}

                      {checkoutCustomerAction && (
                        <span className="ready-badge">
                          {customerIntervention.suggested_action_label}
                        </span>
                      )}

                    </div>
                  )}


                  <div className="cart-layout">

                    <div className="cart-items-panel">

                      {cart.map((item) => (

                        <div
                          className="lab-cart-item"
                          key={item.id}
                        >

                          <div
                            className={
                              `cart-product-image ${item.imageClass}`
                            }
                          >
                            {item.emoji}
                          </div>

                          <div className="cart-product-details">

                            <strong>
                              {item.name}
                            </strong>

                            <span>
                              {item.description}
                            </span>

                            <small>
                              {formatAmount(
                                item.price
                              )}{" "}
                              each
                            </small>

                          </div>


                          <div className="quantity-control">

                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.id,
                                  -1
                                )
                              }
                              type="button"
                            >
                              −
                            </button>

                            <span>
                              {item.quantity}
                            </span>

                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.id,
                                  1
                                )
                              }
                              type="button"
                            >
                              +
                            </button>

                          </div>


                          <strong>
                            {formatAmount(
                              item.price *
                                item.quantity
                            )}
                          </strong>

                        </div>

                      ))}

                    </div>


                    <div className="lab-order-summary">

                      <span className="summary-label">
                        ORDER SUMMARY
                      </span>

                      <h3>
                        Almost yours
                      </h3>

                      <div className="summary-row">

                        <span>
                          Subtotal
                        </span>

                        <strong>
                          {formatAmount(
                            subtotal
                          )}
                        </strong>

                      </div>


                      <div className="summary-row">

                        <span>
                          Shipping
                        </span>

                        <strong>
                          {shipping === 0
                            ? "FREE"
                            : formatAmount(
                                shipping
                              )}
                        </strong>

                      </div>


                      <div className="summary-total-row">

                        <span>
                          Total
                        </span>

                        <strong>
                          {formatAmount(
                            total
                          )}
                        </strong>

                      </div>


                      <button
                        className="primary-lab-button"
                        onClick={() =>
                          setStage(
                            "checkout"
                          )
                        }
                        type="button"
                      >
                        Continue to checkout →
                      </button>

                    </div>

                  </div>

                </>
              )}


              {/* =================================================
                  CHECKOUT
              ================================================= */}

              {stage === "checkout" && (
                <>

                  <div className="lab-page-heading compact">

                    <div>

                      <div className="simulation-label">
                        STEP 3
                      </div>

                      <h1>
                        Complete your order
                      </h1>

                      <p>
                        Now simulate the moment
                        where a customer decides
                        whether to convert.
                      </p>

                    </div>

                  </div>


                  <div className="checkout-layout">

                    <div className="checkout-form-card">

                      <div className="form-section">

                        <span>
                          CONTACT
                        </span>

                        <input
                          defaultValue="customer@demo.test"
                          placeholder="Email address"
                        />

                      </div>


                      <div className="form-section">

                        <span>
                          DELIVERY
                        </span>

                        <input
                          defaultValue="Demo Customer"
                          placeholder="Full name"
                        />

                        <input
                          defaultValue="221B Demo Street"
                          placeholder="Address"
                        />

                        <div className="input-row">

                          <input
                            defaultValue="Mumbai"
                            placeholder="City"
                          />

                          <input
                            defaultValue="400001"
                            placeholder="PIN code"
                          />

                        </div>

                      </div>


                      <div className="form-section">

                        <span>
                          PAYMENT
                        </span>

                        <div className="secure-payment">

                          <div className="secure-payment-icon">
                            💳
                          </div>

                          <div>

                            <strong>
                              Secure payment
                            </strong>

                            <p>
                              Demo payment
                              environment
                            </p>

                          </div>

                          <span>
                            🔒
                          </span>

                        </div>

                      </div>


                      <div className="abandon-zone">

                        <div>

                          <strong>
                            Want to simulate
                            lost revenue?
                          </strong>

                          <span>
                            Leave checkout
                            before payment.
                          </span>

                        </div>


                        <button
                          type="button"
                          disabled={
                            agentRunning
                          }
                          onClick={async () => {

                            if (agentRunning) {
                              return;
                            }

                            // Move back to the cart immediately.
                            // The customer-facing intervention is rendered
                            // only after the recovery agent responds.
                            setStage("cart");
                            setCustomerIntervention(null);
                            setCheckoutCustomerAction(null);
                            setCheckoutError("");

                            const result =
                              await runLabSimulation(
                                "checkout_abandonment"
                              );

                            if (!result) {
                              return;
                            }

                          }}
                        >

                          {agentRunning
                            ? "Analyzing checkout..."
                            : "Abandon checkout"}

                        </button>

                      </div>

                    </div>


                    <div className="lab-order-summary checkout-summary">

                      <span className="summary-label">
                        YOUR ORDER
                      </span>


                      {cart.map((item) => (

                        <div
                          className="summary-item"
                          key={item.id}
                        >

                          <span>
                            {item.name} ×{" "}
                            {item.quantity}
                          </span>

                          <strong>
                            {formatAmount(
                              item.price *
                                item.quantity
                            )}
                          </strong>

                        </div>

                      ))}


                      <div className="summary-divider" />


                      <div className="summary-row">

                        <span>
                          Subtotal
                        </span>

                        <strong>
                          {formatAmount(
                            subtotal
                          )}
                        </strong>

                      </div>


                      <div className="summary-row">

                        <span>
                          Shipping
                        </span>

                        <strong>
                          {shipping === 0
                            ? "FREE"
                            : formatAmount(
                                shipping
                              )}
                        </strong>

                      </div>


                      {!couponApplied ? (

                        <button
                          className="coupon-button"
                          type="button"
                          onClick={() =>
                            setCouponApplied(
                              true
                            )
                          }
                        >
                          ✦ Apply 10% coupon
                        </button>

                      ) : (

                        <div className="coupon-success">
                          ✓ 10% coupon applied
                        </div>

                      )}


                      <div className="summary-total-row">

                        <span>
                          Total
                        </span>

                        <strong>
                          {formatAmount(
                            total
                          )}
                        </strong>

                      </div>


                      <button
                        className="primary-lab-button"
                        type="button"
                        onClick={() =>
                          alert(
                            "Payment successful! Revenue recovered."
                          )
                        }
                      >

                        Pay{" "}
                        {formatAmount(total)}
                        {" "}→

                      </button>


                      <button
                        className="reset-button"
                        type="button"
                        onClick={
                          resetCheckout
                        }
                      >
                        Reset simulation
                      </button>

                    </div>

                  </div>

                </>
              )}

            </>
          )}


          {/* =================================================
              SUBSCRIPTION RECOVERY
          ================================================= */}

          {mode === "subscription" && (

            <div className="alternate-mode">

              <div className="alternate-heading">

                <div>

                  <div className="simulation-label">
                    SIMULATION 02
                  </div>

                  <h1>
                    Subscription Recovery
                  </h1>

                  <p>
                    Simulate a recurring payment
                    failure and let the agent
                    investigate the cause.
                  </p>

                </div>

              </div>


              <div className="subscription-layout">

                <div className="subscription-card">

                  <div className="subscription-card-top">

                    <div className="subscription-icon">
                      ↻
                    </div>

                    <span className="ready-badge">
                      DEMO
                    </span>

                  </div>


                  <span className="simulation-label">
                    MONTHLY PLAN
                  </span>

                  <h2>
                    Pro Workspace
                  </h2>

                  <p>
                    Everything your team needs
                    to collaborate and ship faster.
                  </p>


                  <div className="subscription-price">

                    <strong>
                      ₹1,499
                    </strong>

                    <span>
                      / month
                    </span>

                  </div>


                  <div className="subscription-meta">

                    <div>

                      <span>
                        Customer
                      </span>

                      <strong>
                        Demo Customer
                      </strong>

                    </div>


                    <div>

                      <span>
                        Renewal
                      </span>

                      <strong>
                        Today
                      </strong>

                    </div>

                  </div>


                  {!subscriptionStarted ? (

                    <button
                      className="primary-lab-button"
                      type="button"
                      disabled={
                        agentRunning
                      }
                      onClick={async () => {

                        setSubscriptionStarted(
                          true
                        );

                        setSubscriptionResult(
                          null
                        );

                        const result =
                          await runLabSimulation(
                            "subscription_failure"
                          );

                        setSubscriptionResult(
                          result
                        );

                      }}
                    >
                      Start simulation →
                    </button>

                  ) : (

                    <div className="simulation-running">

                      {agentRunning ? (

                        <>
                          <div className="simulation-spinner">
                            ↻
                          </div>

                          <strong>
                            Agent is analyzing
                            the renewal...
                          </strong>

                          <span>
                            Payment attempt failed
                          </span>

                          <div className="agent-thinking">
                            ✦ Finding the safest
                            recovery path
                          </div>
                        </>

                      ) : (

                        <>
                          <div className="simulation-spinner">
                            ✓
                          </div>

                          <strong>
                            Recovery decision ready
                          </strong>

                          <span>
                            Failed renewal analyzed
                          </span>

                          <div className="agent-thinking">
                            ✦ Agent completed
                            recovery analysis
                          </div>
                        </>

                      )}

                    </div>

                  )}


                  {subscriptionResult &&
                    !agentRunning && (

                      <div className="agent-intervention-card">

                        <div className="agent-intervention-icon">
                          R
                        </div>

                        <div>

                          <strong>
                            {
                              subscriptionResult
                                .customer_intervention
                                ?.title ||
                              "Recovery action"
                            }
                          </strong>

                          <p>
                            {
                              subscriptionResult
                                .customer_intervention
                                ?.message ||
                              subscriptionResult.action
                            }
                          </p>

                        </div>

                        <span className="ready-badge">
                          {subscriptionResult.decision}
                        </span>

                      </div>

                    )}


                  {subscriptionResult &&
                    !agentRunning && (

                      <button
                        className="reset-button"
                        type="button"
                        onClick={
                          resetSubscription
                        }
                      >
                        Run again
                      </button>

                    )}

                </div>


                <div className="agent-analysis-card">

                  <div className="analysis-header">

                    <div className="agent-icon">
                      ✦
                    </div>

                    <div>

                      <span>
                        RECOVERY AGENT
                      </span>

                      <strong>
                        Autonomous diagnosis
                      </strong>

                    </div>

                  </div>


                  <div className="analysis-steps">

                    <div>

                      <span>
                        01
                      </span>

                      <div>

                        <strong>
                          Detect event
                        </strong>

                        <p>
                          Identify the failed
                          renewal.
                        </p>

                      </div>

                    </div>


                    <div>

                      <span>
                        02
                      </span>

                      <div>

                        <strong>
                          Understand why
                        </strong>

                        <p>
                          Analyze payment
                          context and history.
                        </p>

                      </div>

                    </div>


                    <div>

                      <span>
                        03
                      </span>

                      <div>

                        <strong>
                          Choose action
                        </strong>

                        <p>
                          Select the safest
                          recovery path.
                        </p>

                      </div>

                    </div>


                    <div>

                      <span>
                        04
                      </span>

                      <div>

                        <strong>
                          Record outcome
                        </strong>

                        <p>
                          Send the result to
                          the merchant dashboard.
                        </p>

                      </div>

                    </div>

                  </div>


                  {subscriptionResult &&
                    !agentRunning && (

                      <div className="agent-decision-summary">

                        <span>
                          AGENT DECISION
                        </span>

                        <strong>
                          {
                            subscriptionResult
                              .action
                          }
                        </strong>

                        <p>
                          {
                            subscriptionResult
                              .reason
                          }
                        </p>

                      </div>

                    )}

                </div>

              </div>

            </div>

          )}


          {/* =================================================
              PROMISE TO PAY
          ================================================= */}

          {mode === "promise" && (

            <div className="alternate-mode">

              <div className="alternate-heading">

                <div>

                  <div className="simulation-label">
                    SIMULATION 03
                  </div>

                  <h1>
                    Promise to Pay
                  </h1>

                  <p>
                    Simulate an overdue invoice,
                    a customer commitment and a
                    missed payment.
                  </p>

                </div>

              </div>


              <div className="promise-layout">

                <div className="invoice-card">

                  <div className="invoice-top">

                    <span>
                      INVOICE #ACM-2048
                    </span>

                    <span className="overdue-badge">
                      OVERDUE
                    </span>

                  </div>


                  <div className="invoice-amount">
                    ₹24,500
                  </div>

                  <p>
                    Enterprise workspace
                    renewal
                  </p>


                  <div className="invoice-details">

                    <div>

                      <span>
                        Customer
                      </span>

                      <strong>
                        Nova Technologies
                      </strong>

                    </div>


                    <div>

                      <span>
                        Due date
                      </span>

                      <strong>
                        28 Aug 2026
                      </strong>

                    </div>


                    <div>

                      <span>
                        Days overdue
                      </span>

                      <strong>
                        4 days
                      </strong>

                    </div>

                  </div>


                  {!promiseStarted ? (

                    <button
                      className="primary-lab-button"
                      type="button"
                      disabled={
                        agentRunning
                      }
                      onClick={async () => {

                        setPromiseStarted(
                          true
                        );

                        setPromiseResult(
                          null
                        );

                        const result =
                          await runLabSimulation(
                            "promise_missed"
                          );

                        setPromiseResult(
                          result
                        );

                      }}
                    >
                      Start recovery simulation →
                    </button>

                  ) : (

                    <div className="promise-running">

                      {agentRunning ? (

                        <div className="promise-timeline">

                          <div className="timeline-item completed">

                            <span>
                              ✓
                            </span>

                            <div>

                              <strong>
                                Invoice overdue
                              </strong>

                              <p>
                                Payment was not
                                received.
                              </p>

                            </div>

                          </div>


                          <div className="timeline-item completed">

                            <span>
                              ✓
                            </span>

                            <div>

                              <strong>
                                Promise received
                              </strong>

                              <p>
                                Customer promised
                                to pay.
                              </p>

                            </div>

                          </div>


                          <div className="timeline-item current">

                            <span>
                              !
                            </span>

                            <div>

                              <strong>
                                Agent evaluating
                              </strong>

                              <p>
                                Deciding the safest
                                next action...
                              </p>

                            </div>

                          </div>

                        </div>

                      ) : (

                        <div className="promise-timeline">

                          <div className="timeline-item completed">

                            <span>
                              ✓
                            </span>

                            <div>

                              <strong>
                                Invoice overdue
                              </strong>

                              <p>
                                Payment was not
                                received.
                              </p>

                            </div>

                          </div>


                          <div className="timeline-item completed">

                            <span>
                              ✓
                            </span>

                            <div>

                              <strong>
                                Promise received
                              </strong>

                              <p>
                                Customer promised
                                to pay.
                              </p>

                            </div>

                          </div>


                          <div className="timeline-item completed">

                            <span>
                              ✓
                            </span>

                            <div>

                              <strong>
                                Promise missed
                              </strong>

                              <p>
                                Recovery action
                                selected.
                              </p>

                            </div>

                          </div>

                        </div>

                      )}

                    </div>

                  )}


                  {promiseResult &&
                    !agentRunning && (

                      <div className="agent-intervention-card">

                        <div className="agent-intervention-icon">
                          R
                        </div>

                        <div>

                          <strong>
                            {
                              promiseResult
                                .customer_intervention
                                ?.title ||
                              "Recovery action"
                            }
                          </strong>

                          <p>
                            {
                              promiseResult
                                .customer_intervention
                                ?.message ||
                              promiseResult.action
                            }
                          </p>

                        </div>

                        <span className="ready-badge">
                          {promiseResult.decision}
                        </span>

                      </div>

                    )}


                  {promiseResult &&
                    !agentRunning && (

                      <button
                        className="reset-button"
                        type="button"
                        onClick={
                          resetPromise
                        }
                      >
                        Run again
                      </button>

                    )}

                </div>


                <div className="promise-agent-card">

                  <div className="agent-analysis-header">

                    <div className="agent-icon">
                      ✦
                    </div>

                    <div>

                      <span>
                        RECOVERY AGENT
                      </span>

                      <strong>
                        Promise intelligence
                      </strong>

                    </div>

                  </div>


                  <h3>
                    Possible next actions
                  </h3>


                  <div className="agent-action-options">

                    <div>

                      <span>
                        01
                      </span>

                      Send reminder

                    </div>


                    <div>

                      <span>
                        02
                      </span>

                      Reschedule promise

                    </div>


                    <div>

                      <span>
                        03
                      </span>

                      Escalate account

                    </div>


                    <div>

                      <span>
                        04
                      </span>

                      Stop automated action

                    </div>

                  </div>


                  {promiseResult &&
                    !agentRunning && (

                      <div className="agent-decision-summary">

                        <span>
                          AGENT DECISION
                        </span>

                        <strong>
                          {
                            promiseResult.action
                          }
                        </strong>

                        <p>
                          {
                            promiseResult.reason
                          }
                        </p>

                      </div>

                    )}


                  <p className="agent-disclaimer">
                    The final action is determined
                    from customer context and
                    payment history.
                  </p>

                </div>

              </div>

            </div>

          )}

        </main>

      </div>

    </div>
  );
}
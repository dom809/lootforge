require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Service-role client: full DB access, server-side only. Never expose this key to the frontend.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Product catalog. Replace these with your real products, prices (in cents),
// and descriptions. This is the single source of truth for pricing — the
// frontend just displays this list, it never sets the price itself.
// ---------------------------------------------------------------------------
const PRODUCTS = [
  {
    id: 'starter-plan',
    name: 'Starter Plan',
    price: 999, // $9.99
    period: 'month',
    tag: 'BEGINNER',
    color: '#34d399',
    description: 'Core features to get started.'
  },
  {
    id: 'pro-plan',
    name: 'Pro Plan',
    price: 1999, // $19.99
    period: 'month',
    tag: 'POPULAR',
    color: '#5b9eff',
    description: 'Everything in Starter, plus advanced features and priority support.'
  },
  {
    id: 'lifetime-pass',
    name: 'Lifetime Pass',
    price: 4999, // $49.99
    period: 'one-time',
    tag: 'BEST VALUE',
    color: '#ff3b3b',
    description: 'One-time payment, lifetime access to everything, including future updates.'
  }
];

app.use(cors());

// Stripe webhooks need the raw request body to verify the signature, so this
// route is registered BEFORE the global express.json() middleware below.
app.post(
  '/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { error } = await supabaseAdmin
        .from('purchases')
        .update({ status: 'paid' })
        .eq('stripe_session_id', session.id);

      if (error) console.error('Failed to mark purchase as paid:', error);
    }

    res.json({ received: true });
  }
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Helper: verify the Supabase access token sent from the frontend and
// return the authenticated user, or null.
// ---------------------------------------------------------------------------
async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}

app.get('/api/products', (req, res) => {
  res.json(PRODUCTS);
});

// The anon key is safe to expose to the browser (Supabase is designed around
// this — real protection comes from Row Level Security), so we hand it to
// the frontend at runtime instead of hardcoding it into a static file.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'You must be logged in to check out.' });

    const { items } = req.body; // [{ productId, qty }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    const line_items = items.map(({ productId, qty }) => {
      const product = PRODUCTS.find(p => p.id === productId);
      if (!product) throw new Error(`Unknown product: ${productId}`);
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: product.name },
          unit_amount: product.price
        },
        quantity: qty || 1
      };
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${CLIENT_URL}/?success=true`,
      cancel_url: `${CLIENT_URL}/?canceled=true`,
      metadata: { user_id: user.id }
    });

    // Record one pending purchase row per cart line so the webhook has
    // something to flip to "paid" once Stripe confirms payment.
    const rows = items.map(({ productId, qty }) => {
      const product = PRODUCTS.find(p => p.id === productId);
      return {
        user_id: user.id,
        product_id: product.id,
        product_name: product.name,
        amount_cents: product.price * (qty || 1),
        stripe_session_id: session.id,
        status: 'pending'
      };
    });
    await supabaseAdmin.from('purchases').insert(rows);

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LootForge server running on ${CLIENT_URL}`);
});

# LootForge

A working storefront with real signup/login (Supabase Auth), a real cart, and real
checkout (Stripe). This README is the whole path from "code on my laptop" to
"live on my own domain."

## What you're setting up

- **Supabase** — free database + auth provider. Handles signup/login and stores orders.
- **Stripe** — payment processor. Handles the actual card charge.
- **Render** (or Railway/Fly.io) — free/cheap host for the Node server.
- Your own **domain** — pointed at whichever host you pick.

No payment or auth secrets ever need to be shared with anyone else — you create
all of these accounts yourself and only you hold the keys.

---

## 1. Run it locally first

```bash
npm install
cp .env.example .env
```

You need real values in `.env` before anything works — see steps 2 and 3.

```bash
npm start
```

Visit `http://localhost:3000`.

---

## 2. Set up Supabase (auth + database)

1. Go to [supabase.com](https://supabase.com) → create a free project.
2. **Project Settings → API** — copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret — it bypasses all security rules, never put it in frontend code)
3. **SQL Editor → New query** — paste the contents of `supabase.sql` from this project and run it. This creates the `purchases` table and locks it down so each user can only ever see their own orders.
4. **Authentication → Providers** — Email is on by default, nothing else to do. (Optional: under **Authentication → Settings**, you can turn off "Confirm email" while testing, so signups work instantly without checking an inbox.)

---

## 3. Set up Stripe (payments)

1. Go to [stripe.com](https://stripe.com) → create an account. You'll start in **test mode** — use this until you're ready to take real money.
2. **Developers → API keys** → copy the **Secret key** → `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `http://localhost:3000/api/webhook` for now (you'll update this to your real domain after deploying)
   - Event to send: `checkout.session.completed`
   - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`
4. While testing, use Stripe's test card: `4242 4242 4242 4242`, any future expiry, any CVC.
5. When you're ready to accept real cards, Stripe will walk you through verifying your business — then switch your keys from `sk_test_...` to `sk_live_...`.

---

## 4. Edit your real product catalog

Open `server.js` and edit the `PRODUCTS` array — names, prices (in cents), descriptions.
This is the *only* place prices come from; the frontend just displays whatever is here.

---

## 5. Deploy it live

**Render is the easiest free option for this kind of app:**

1. Push this folder to a GitHub repo.
2. Go to [render.com](https://render.com) → **New → Web Service** → connect your repo.
3. Build command: `npm install` · Start command: `npm start`.
4. Under **Environment**, add every variable from your `.env` file (this is where the secret keys actually live now — not in your code).
5. Set `CLIENT_URL` to the `*.onrender.com` URL Render gives you.
6. Deploy. Your site is now live at that URL.
7. Go back to **Stripe → Webhooks** and update the endpoint URL to `https://your-app.onrender.com/api/webhook`.

**Pointing your own domain at it:**

1. Buy a domain anywhere (Namecheap, Cloudflare, Google Domains, etc.) if you don't have one.
2. In Render: **Settings → Custom Domain** → add your domain, Render gives you a DNS record to add.
3. At your domain registrar, add that record (usually a `CNAME`).
4. Update `CLIENT_URL` in Render's environment variables to your real domain, and update the Stripe webhook URL again to match.
5. DNS can take a few minutes to a few hours to propagate.

---

## How it fits together

```
Browser (public/index.html, app.js)
   │
   ├─ Supabase JS client → Supabase Auth (signup/login) + purchases table (read-only, per-user via RLS)
   │
   └─ fetch('/api/...') → server.js (Express)
                              ├─ /api/products            → static catalog
                              ├─ /api/create-checkout-session → creates a Stripe Checkout session, records a "pending" order
                              ├─ /api/webhook              → Stripe calls this when payment succeeds, marks order "paid"
                              └─ uses SUPABASE_SERVICE_ROLE_KEY to write orders (frontend never has this key)
```

The frontend never sees your Stripe secret key or your Supabase service role key —
those only ever live in the server's environment variables.

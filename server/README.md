# Payment Integration Guide (ELITE BET)

The frontend deposit modal automatically tries `POST /api/deposit` first.
If no server is running, it falls back to **Demo Mode** (virtual credits only).

## How the real flow works

1. Frontend sends `{ method, amount }` to the server.
2. Server forwards the charge request to your licensed Payment Service Provider (PSP).
3. PSP returns a transaction reference; frontend credits the player.

## Requirements before enabling real payments

- A valid gambling license for every country you operate in.
- A merchant account with a PSP that approves gaming merchants
  (e.g. Paymob, Kashier, Stripe high-risk, Praxis, Nuvei).
  NOTE: personal wallets (Orange Cash / Vodafone Cash personal numbers)
  are NOT a legal payment method for a gambling platform and are not supported here.
- KYC/AML procedures and 18+ age verification on your side.

## Setup

```bash
cd server
npm install
set PSP_URL=https://api.your-psp.com/charges
set PSP_KEY=your_live_or_test_key
node server.js
```

Then open http://localhost:3000 — deposits will route through your PSP.
Without env vars set, `/api/deposit` returns 503 and the site stays in Demo Mode.

## Files

- `server.js` — Express API + static hosting of the site.
- The webhook endpoint (`PUBLIC_URL/api/deposit/webhook`) should be added
  per your PSP's signature-verification docs to confirm settled payments.

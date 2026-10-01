# Bokitos Air: online shop for air conditioners in Europe

A complete web shop for selling air conditioners, heat pumps and accessories across the EU. It has a storefront in 5 languages, online payments, order emails and an admin page for managing orders.

It needs nothing but **Node.js 18 or newer**. There are no packages to install and no build step.

```bash
cd ac-shop
cp .env.example .env     # fill in what you want to switch on
npm start                # http://localhost:3000
npm test                 # server tests
```

You can also double-click `public/index.html` to preview the shop without the server. In that **demo mode** everything works except that orders and quote requests are not sent anywhere.

## What customers get

- **5 languages:** English, German, French, Dutch and Spanish. Prices use each country's format (`€1,399` or `1.399 €`).
- **Catalogue:** 10 air conditioners (wall, multi-split, floor console, portable) and 6 accessories. Customers can filter by type and capacity, sort, and search.
- **Product pages** (`/#product/<id>`) with the full specifications, highlights, the EU energy label scale (cooling and heating), a quantity selector and "often bought together" accessories.
- **Size calculator:** gives a recommended kW for the room and shows the units that fit.
- **Cart:** optional installation per unit, free shipping from €500.
- **Checkout:**
  - delivery and installation details and a preferred installation date
  - payment by card and local methods through Stripe, bank transfer, or invoice after installation
  - a VAT breakdown at the rate of the destination country (EU one-stop-shop rules)
- **Quote request form** for larger or multi-room jobs.
- **Legal pages:** imprint, privacy policy, terms, and returns and withdrawal (with the EU model withdrawal form), plus a short privacy notice. There are no tracking cookies and no third-party scripts or fonts.
- Works on phones and desktops.

## What you get

- **Admin page** at `/admin` (protected by `ADMIN_PASSWORD`):
  - totals: revenue, orders awaiting payment, new quote requests
  - order and quote lists with search, status filter and full details
  - status changes (paid, scheduled, shipped, installed…) with a history
  - CSV export for your accounting
- **Email notifications** through [Resend](https://resend.com): a confirmation to the customer and a message to you for each order or quote, and a payment confirmation when Stripe reports a payment.
- **The server works out all prices and VAT itself** from `public/catalog.js`, so someone editing prices in their browser can't change what they pay.
- Security basics: rate limiting, a lockout after repeated wrong admin passwords, body size limits, security headers (CSP and others), and signature checks on Stripe webhooks.

Orders and quotes are stored in `data/db.json`. Back that file up.

## Settings (`.env`)

| Variable | Switches on |
| --- | --- |
| `ADMIN_PASSWORD` | The admin page at `/admin` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Online payments. In the Stripe dashboard, add a webhook to `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Enable the payment methods you want (cards, iDEAL, Bancontact, SEPA…) in the dashboard. |
| `BANK_IBAN`, `BANK_HOLDER` | Shows your bank details to customers who choose bank transfer |
| `RESEND_API_KEY`, `MAIL_FROM`, `SHOP_EMAIL` | Emails. `SHOP_EMAIL` receives new orders and quotes |
| `PUBLIC_URL` | Your shop address, used for Stripe return links |
| `TRUST_PROXY=1` | Set this when running behind a proxy or load balancer, so rate limits see real visitor IPs |
| `PORT`, `DATA_DIR` | Server port (default 3000) and where data is stored (default `data/`) |

## Hosting

Run `node server.js` on any host that runs Node and keeps files on disk, for example a small VPS, Render, Railway or Fly.io (give it a persistent volume for `data/`). Put HTTPS in front of it; most hosts do this for you.

## Before going live

1. **Replace the placeholder content:**
   - Products, prices, specs, installation prices, shipping fee and VAT rates: `public/catalog.js`.
   - Phone and email: the contact section in `public/index.html`.
   - Company details: the highlighted `[placeholders]` in `imprint.html`, `privacy.html`, `terms.html` and `returns.html`.
2. **Have the legal pages checked by a lawyer** for each country you sell in, then remove the yellow "Template" note at the top of each page. The pages are in English only; some countries expect them in their own language.
3. **Check the VAT rates** in `catalog.js`. They were correct in 2026, but countries change them.
4. **Set up your accounts:** Stripe (with the webhook), Resend (verify your sending domain), and a strong `ADMIN_PASSWORD`.
5. **Test a full order** with Stripe's test keys before switching to live keys.

## Files

| Path | Contents |
| --- | --- |
| `server.js` | Web server and API: orders, quotes, Stripe, emails, admin |
| `public/catalog.js` | Products, prices, VAT rates and the price calculation (shared by the browser and the server) |
| `public/i18n.js` | All shop text in 5 languages |
| `public/index.html`, `app.js`, `styles.css` | The shop |
| `public/admin.html`, `admin.js`, `admin.css` | The admin page |
| `public/imprint.html` … `returns.html`, `404.html` | Legal and error pages |
| `test/server.test.js` | Server tests (`npm test`) |

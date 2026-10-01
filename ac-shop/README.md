# Bokitos Air: online shop for air conditioners in Europe

A storefront for selling air conditioners and air-to-air heat pumps across the EU. It is plain HTML, CSS and JavaScript. It has no build step and no dependencies.

**Open it:** double-click `index.html`, or upload this folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, an ordinary web server).

## What's in it

- **5 languages:** English, German, French, Dutch and Spanish. The site picks one from the browser, and visitors can switch in the header. Prices and numbers use each locale's format (`€1,399` or `1.399 €`), and country names are translated.
- **Product catalogue:** 10 models covering wall splits, multi-splits, a floor console and portables. Each card shows the cooling and heating capacity, SEER/SCOP, noise level, refrigerant and EU energy-label class. Visitors can filter by type and capacity, and sort by popularity, price or efficiency.
- **Size calculator:** takes room area, ceiling height, sun exposure and insulation, and returns a recommended kW (and BTU/h). It can then show only the matching units.
- **Cart:** a slide-out drawer with quantities and an optional installation add-on for split units. Shipping is free from €500, and the cart is remembered in the visitor's browser.
- **Checkout and quote request forms:** both check their fields before sending, and both have a GDPR consent checkbox.
- EU details: prices include VAT, a 14-day right of withdrawal, F-gas certified installation, a section on heat pump subsidies, and links to imprint, privacy and terms pages.
- Works on phones and desktops.

## Before going live

1. **Connect the forms.** `formEndpoint` in `app.js` is empty, so the shop runs in *demo mode*: orders and quote requests show a success message but **are not sent anywhere**. Set `CONFIG.formEndpoint` to a URL that accepts JSON POSTs (for example Formspree, Netlify Forms, or your own API) so you receive them.
2. **Take payments** if you want customers to pay online. Right now an order is a request that you confirm by phone. To charge online, connect a payment provider such as Stripe, Mollie or Adyen.
3. **Replace the placeholder content:**
   - Products, prices and specs: the `PRODUCTS` list in `app.js`.
   - Phone number and email: the contact section in `index.html`.
   - The Imprint, Privacy policy and Terms pages: the footer links currently point nowhere. Most EU countries legally require these pages.
   - Installation prices, the shipping fee and the countries you deliver to: `CONFIG` in `app.js`.
4. Have the warranty, returns and subsidy wording checked for each country you sell in.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | All styling |
| `app.js` | Products, translations, filters, calculator, cart and forms |

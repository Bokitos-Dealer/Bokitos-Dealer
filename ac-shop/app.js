/* Bokitos Air – storefront logic: catalogue, filters, size calculator, cart,
 * checkout and translations. No build step and no dependencies. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  const CONFIG = {
    // POST endpoint that receives orders and quote requests as JSON
    // (Formspree, Netlify Forms, your own API...). Leave empty and the forms
    // show a success message without sending anything (demo mode).
    formEndpoint: '',
    freeShippingFrom: 500,
    shippingFee: 29,
    installPrice: { wall: 399, floor: 449, multi: 799 },
    // EU-27 plus nearby markets we deliver to.
    countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
      'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
  };

  // -------------------------------------------------------------- products
  // cool/heat = rated capacity in kW. Energy classes follow the EU label.
  const PRODUCTS = [
    { id: 'breeze-25', name: 'Breeze 25', type: 'wall', cool: 2.5, heat: 2.8, seer: 8.5, seerClass: 'A+++', scop: 4.6, scopClass: 'A++', refrigerant: 'R32', noise: 19, price: 749, was: 849, pop: 10, badge: 'bestseller', wifi: true },
    { id: 'breeze-35', name: 'Breeze 35', type: 'wall', cool: 3.5, heat: 4.0, seer: 8.1, seerClass: 'A++', scop: 4.5, scopClass: 'A+', refrigerant: 'R32', noise: 21, price: 899, pop: 9, wifi: true },
    { id: 'nordic-35', name: 'Nordic 35 Heat Pump', type: 'wall', cool: 3.5, heat: 4.2, seer: 8.6, seerClass: 'A+++', scop: 5.2, scopClass: 'A+++', refrigerant: 'R32', noise: 19, price: 1399, pop: 8, badge: 'cold', wifi: true },
    { id: 'breeze-50', name: 'Breeze 50', type: 'wall', cool: 5.0, heat: 5.8, seer: 7.2, seerClass: 'A++', scop: 4.1, scopClass: 'A+', refrigerant: 'R32', noise: 24, price: 1249, pop: 7, wifi: true },
    { id: 'arctic-70', name: 'Arctic Pro 70', type: 'wall', cool: 7.0, heat: 7.6, seer: 6.9, seerClass: 'A++', scop: 4.0, scopClass: 'A+', refrigerant: 'R32', noise: 27, price: 1799, pop: 4, wifi: true },
    { id: 'floora-35', name: 'Floora 35 Console', type: 'floor', cool: 3.5, heat: 4.0, seer: 7.6, seerClass: 'A++', scop: 4.6, scopClass: 'A++', refrigerant: 'R32', noise: 23, price: 1349, pop: 5, wifi: true },
    { id: 'duo-2x25', name: 'Duo Multi-Split 2×2.5', type: 'multi', cool: 5.0, heat: 5.6, seer: 7.0, seerClass: 'A++', scop: 4.0, scopClass: 'A+', refrigerant: 'R32', noise: 20, price: 2190, was: 2390, pop: 6, rooms: 2, wifi: true },
    { id: 'trio-3x25', name: 'Trio Multi-Split 3×2.5', type: 'multi', cool: 7.5, heat: 8.2, seer: 6.8, seerClass: 'A++', scop: 4.0, scopClass: 'A+', refrigerant: 'R32', noise: 20, price: 2990, pop: 3, rooms: 3, wifi: true },
    { id: 'mobi-26', name: 'Mobi 26 Portable', type: 'portable', cool: 2.6, heat: 2.3, seer: 2.6, seerClass: 'A', refrigerant: 'R290', noise: 52, price: 449, pop: 8.5, badge: 'diy' },
    { id: 'mobi-35', name: 'Mobi 35 Dual-Hose', type: 'portable', cool: 3.5, heat: 3.1, seer: 3.1, seerClass: 'A+', refrigerant: 'R290', noise: 50, price: 599, pop: 5.5, badge: 'diy', wifi: true },
  ];

  const ENERGY_COLORS = { 'A+++': '#00a651', 'A++': '#4cb848', 'A+': '#b4cf2a', A: '#e5d800' };

  // ---------------------------------------------------------- translations
  const I18N = {
    en: {
      'nav.shop': 'Shop', 'nav.calc': 'Size calculator', 'nav.install': 'Installation', 'nav.faq': 'FAQ', 'nav.contact': 'Contact',
      'hero.eyebrow': 'Delivered to all 27 EU countries',
      'hero.title': 'Cool summers. Warm winters. Lower energy bills.',
      'hero.lead': 'Energy-efficient split air conditioners and air-to-air heat pumps with A+++ ratings, low-GWP refrigerants and professional installation by F-gas certified technicians.',
      'hero.cta1': 'Shop air conditioners', 'hero.cta2': 'Find the right size',
      'hero.p1': '5-year warranty', 'hero.p2': '14-day returns', 'hero.p3': 'Prices incl. VAT',
      'trust.1': 'Top EU energy class', 'trust.2': 'Low-GWP refrigerants', 'trust.3': 'Heating down to', 'trust.4': 'Whisper-quiet indoor units',
      'calc.title': 'What size do I need?',
      'calc.lead': "Enter your room details and we'll recommend a cooling capacity. This is a quick estimate; our installers confirm it on site.",
      'calc.area': 'Room area (m²)', 'calc.height': 'Ceiling height (m)', 'calc.sun': 'Sun exposure',
      'calc.sun1': 'Shaded / north-facing', 'calc.sun2': 'Normal', 'calc.sun3': 'Very sunny / south-facing',
      'calc.insul': 'Insulation', 'calc.insul1': 'Good (new build)', 'calc.insul2': 'Average', 'calc.insul3': 'Poor (old building, attic)',
      'calc.show': 'Show matching units',
      'calc.result': 'Recommended cooling capacity: <strong>{kw} kW</strong><br><span class="muted">≈ {btu} BTU/h</span>',
      'calc.note': 'Showing units from {kw} kW for your room.', 'calc.clear': 'Show all',
      'shop.title': 'Air conditioners & heat pumps',
      'shop.lead': 'All units heat and cool. Prices include VAT; installation can be added in the cart.',
      'f.all': 'All', 'f.wall': 'Wall split', 'f.multi': 'Multi-split', 'f.portable': 'Portable', 'f.floor': 'Floor console',
      'f.capAll': 'Any capacity', 'f.cap1': 'Up to 3 kW (≤ 30 m²)', 'f.cap2': '3–5.5 kW (30–55 m²)', 'f.cap3': 'Over 5.5 kW (55 m²+)',
      'f.sortPop': 'Most popular', 'f.sortLow': 'Price: low to high', 'f.sortHigh': 'Price: high to low', 'f.sortEff': 'Most efficient',
      'p.cool': 'Cooling', 'p.heat': 'Heating', 'p.seer': 'SEER', 'p.scop': 'SCOP', 'p.noise': 'Noise', 'p.gas': 'Refrigerant', 'p.rooms': 'Rooms',
      'p.add': 'Add to cart', 'p.added': '{name} added to cart', 'p.forRoom': 'for rooms up to {m2} m²', 'p.none': 'No units match these filters.',
      'b.bestseller': 'Bestseller', 'b.cold': 'Nordic climate', 'b.diy': 'No installer needed',
      'inst.title': 'From order to cool air in 3 steps',
      'inst.lead': 'Split systems must be installed by an F-gas certified technician under EU Regulation 2024/573. We handle it for you.',
      'inst.s1t': 'Order online', 'inst.s1': 'Choose your unit and add installation. We call you within one working day to plan the visit.',
      'inst.s2t': 'Delivery', 'inst.s2': 'Free delivery on orders over €500, usually within 3–7 working days across the EU.',
      'inst.s3t': 'Professional installation', 'inst.s3': 'A certified installer mounts, vacuums and commissions the system, typically in half a day.',
      'sub.title': 'Save with heat pump subsidies',
      'sub.text': 'Many EU countries offer grants or reduced VAT for air-to-air heat pumps. We supply the invoices and technical datasheets you need for your application.',
      'sub.cta': 'Ask about subsidies',
      'faq.title': 'Frequently asked questions',
      'faq.q1': 'Can these units also heat my home?', 'faq.a1': 'Yes. Every split unit is an air-to-air heat pump and heats efficiently, typically delivering 4–5 kWh of heat per kWh of electricity. The Nordic 35 keeps heating down to −25 °C outdoors.',
      'faq.q2': 'Do I need an installer?', 'faq.a2': 'Wall, floor and multi-split systems contain refrigerant and must be connected by an F-gas certified technician. Add installation in the cart and we arrange it. Portable units need no installer.',
      'faq.q3': 'Which countries do you deliver to?', 'faq.a3': 'We deliver to all 27 EU member states. Installation is available in most regions; we confirm availability for your postcode after you order.',
      'faq.q4': 'What warranty do I get?', 'faq.a4': 'Five years on parts and labour for installed split units, two years on portable units, on top of your statutory rights under EU consumer law.',
      'faq.q5': 'Can I return a unit?', 'faq.a5': 'Yes. You have a 14-day right of withdrawal for unused, uninstalled products in their original packaging.',
      'faq.q6': 'Which refrigerants do you use?', 'faq.a6': 'Our split units use R32 and our portables use natural R290 (propane), both with much lower global warming potential than older R410A systems.',
      'contact.title': 'Get a free quote',
      'contact.lead': "Need several rooms cooled, or not sure which unit fits? Tell us about your home and we'll send a tailored quote within 24 hours.",
      'contact.phone': 'Phone', 'contact.email': 'Email', 'contact.hours': 'Hours', 'contact.hoursVal': 'Mon–Fri 8:00–18:00 CET',
      'form.name': 'Name', 'form.email': 'Email', 'form.country': 'Country', 'form.rooms': 'Number of rooms', 'form.msg': 'Message',
      'form.consent': 'I agree that my details are used to answer my request (GDPR).', 'form.send': 'Request quote',
      'form.ok': "Thank you! We'll get back to you within 24 hours.", 'form.err': 'Please fill in the highlighted fields.', 'form.fail': 'Sending failed. Please try again or email us.',
      'form.choose': 'Choose…',
      'footer.about': 'Air conditioning and heat pumps for homes and offices across Europe.',
      'footer.shop': 'Shop', 'footer.service': 'Service', 'footer.warranty': 'Warranty & returns', 'footer.legal': 'Legal',
      'footer.imprint': 'Imprint', 'footer.privacy': 'Privacy policy', 'footer.terms': 'Terms & conditions',
      'footer.vat': 'All prices in EUR incl. VAT. Energy labels per EU Regulation 2017/1369.',
      'cart.title': 'Your cart', 'cart.subtotal': 'Subtotal', 'cart.install': 'Installation', 'cart.shipping': 'Shipping',
      'cart.total': 'Total (incl. VAT)', 'cart.checkout': 'Checkout', 'cart.empty': 'Your cart is empty.', 'cart.free': 'Free',
      'cart.addInstall': 'Add installation (+{price})', 'cart.remove': 'Remove', 'cart.freeHint': 'Add {amount} more for free shipping',
      'co.title': 'Checkout', 'co.address': 'Street and number', 'co.zip': 'Postcode', 'co.city': 'City',
      'co.phone': 'Phone (for the installer)', 'co.terms': 'I accept the terms and the 14-day right of withdrawal.', 'co.place': 'Place order',
      'co.done': 'Order received!', 'co.doneText': 'Your order number is <b>{id}</b>. A confirmation is on its way to {email}. We will call you within one working day to schedule delivery and installation.',
      'co.back': 'Continue shopping',
    },
    de: {
      'nav.shop': 'Shop', 'nav.calc': 'Größenrechner', 'nav.install': 'Installation', 'nav.faq': 'FAQ', 'nav.contact': 'Kontakt',
      'hero.eyebrow': 'Lieferung in alle 27 EU-Länder',
      'hero.title': 'Kühle Sommer. Warme Winter. Niedrigere Energiekosten.',
      'hero.lead': 'Energieeffiziente Split-Klimaanlagen und Luft-Luft-Wärmepumpen mit A+++, klimafreundlichen Kältemitteln und Montage durch F-Gas-zertifizierte Fachbetriebe.',
      'hero.cta1': 'Klimaanlagen ansehen', 'hero.cta2': 'Richtige Größe finden',
      'hero.p1': '5 Jahre Garantie', 'hero.p2': '14 Tage Rückgabe', 'hero.p3': 'Preise inkl. MwSt.',
      'trust.1': 'Höchste EU-Energieklasse', 'trust.2': 'Kältemittel mit niedrigem GWP', 'trust.3': 'Heizen bis', 'trust.4': 'Flüsterleise Innengeräte',
      'calc.title': 'Welche Größe brauche ich?',
      'calc.lead': 'Geben Sie Ihre Raumdaten ein und wir empfehlen eine Kühlleistung. Dies ist eine Schätzung; unsere Monteure prüfen sie vor Ort.',
      'calc.area': 'Raumfläche (m²)', 'calc.height': 'Deckenhöhe (m)', 'calc.sun': 'Sonneneinstrahlung',
      'calc.sun1': 'Schattig / Nordseite', 'calc.sun2': 'Normal', 'calc.sun3': 'Sehr sonnig / Südseite',
      'calc.insul': 'Dämmung', 'calc.insul1': 'Gut (Neubau)', 'calc.insul2': 'Durchschnittlich', 'calc.insul3': 'Schlecht (Altbau, Dachgeschoss)',
      'calc.show': 'Passende Geräte zeigen',
      'calc.result': 'Empfohlene Kühlleistung: <strong>{kw} kW</strong><br><span class="muted">≈ {btu} BTU/h</span>',
      'calc.note': 'Geräte ab {kw} kW für Ihren Raum.', 'calc.clear': 'Alle zeigen',
      'shop.title': 'Klimaanlagen & Wärmepumpen',
      'shop.lead': 'Alle Geräte kühlen und heizen. Preise inkl. MwSt.; die Montage können Sie im Warenkorb hinzufügen.',
      'f.all': 'Alle', 'f.wall': 'Wandgerät', 'f.multi': 'Multi-Split', 'f.portable': 'Mobil', 'f.floor': 'Truhengerät',
      'f.capAll': 'Jede Leistung', 'f.cap1': 'Bis 3 kW (≤ 30 m²)', 'f.cap2': '3–5,5 kW (30–55 m²)', 'f.cap3': 'Über 5,5 kW (55 m²+)',
      'f.sortPop': 'Beliebteste', 'f.sortLow': 'Preis aufsteigend', 'f.sortHigh': 'Preis absteigend', 'f.sortEff': 'Effizienteste',
      'p.cool': 'Kühlen', 'p.heat': 'Heizen', 'p.seer': 'SEER', 'p.scop': 'SCOP', 'p.noise': 'Lautstärke', 'p.gas': 'Kältemittel', 'p.rooms': 'Räume',
      'p.add': 'In den Warenkorb', 'p.added': '{name} im Warenkorb', 'p.forRoom': 'für Räume bis {m2} m²', 'p.none': 'Keine Geräte entsprechen diesen Filtern.',
      'b.bestseller': 'Bestseller', 'b.cold': 'Nordisches Klima', 'b.diy': 'Ohne Monteur',
      'inst.title': 'In 3 Schritten zur kühlen Luft',
      'inst.lead': 'Split-Geräte müssen nach EU-Verordnung 2024/573 von einem F-Gas-zertifizierten Techniker installiert werden. Wir kümmern uns darum.',
      'inst.s1t': 'Online bestellen', 'inst.s1': 'Gerät wählen und Montage hinzufügen. Wir rufen Sie innerhalb eines Werktags an, um den Termin zu planen.',
      'inst.s2t': 'Lieferung', 'inst.s2': 'Kostenlose Lieferung ab 500 €, meist innerhalb von 3–7 Werktagen in der ganzen EU.',
      'inst.s3t': 'Fachgerechte Montage', 'inst.s3': 'Ein zertifizierter Monteur montiert, evakuiert und nimmt die Anlage in Betrieb – meist in einem halben Tag.',
      'sub.title': 'Sparen mit Wärmepumpen-Förderung',
      'sub.text': 'Viele EU-Länder fördern Luft-Luft-Wärmepumpen mit Zuschüssen oder reduzierter MwSt. Wir liefern die Rechnungen und Datenblätter für Ihren Antrag.',
      'sub.cta': 'Zur Förderung beraten lassen',
      'faq.title': 'Häufige Fragen',
      'faq.q1': 'Können die Geräte auch heizen?', 'faq.a1': 'Ja. Jedes Split-Gerät ist eine Luft-Luft-Wärmepumpe und liefert typischerweise 4–5 kWh Wärme pro kWh Strom. Die Nordic 35 heizt bis −25 °C Außentemperatur.',
      'faq.q2': 'Brauche ich einen Monteur?', 'faq.a2': 'Wand-, Truhen- und Multi-Split-Geräte enthalten Kältemittel und müssen von einem F-Gas-zertifizierten Techniker angeschlossen werden. Fügen Sie die Montage im Warenkorb hinzu. Mobile Geräte brauchen keinen Monteur.',
      'faq.q3': 'In welche Länder liefern Sie?', 'faq.a3': 'Wir liefern in alle 27 EU-Mitgliedstaaten. Montage ist in den meisten Regionen möglich; wir bestätigen dies nach der Bestellung für Ihre Postleitzahl.',
      'faq.q4': 'Welche Garantie erhalte ich?', 'faq.a4': 'Fünf Jahre auf Teile und Arbeit bei installierten Split-Geräten, zwei Jahre bei mobilen Geräten – zusätzlich zu Ihren gesetzlichen Rechten.',
      'faq.q5': 'Kann ich ein Gerät zurückgeben?', 'faq.a5': 'Ja. Sie haben ein 14-tägiges Widerrufsrecht für unbenutzte, nicht installierte Produkte in Originalverpackung.',
      'faq.q6': 'Welche Kältemittel verwenden Sie?', 'faq.a6': 'Unsere Split-Geräte nutzen R32, unsere mobilen Geräte das natürliche R290 (Propan) – beide mit deutlich geringerem Treibhauspotenzial als ältere R410A-Anlagen.',
      'contact.title': 'Kostenloses Angebot',
      'contact.lead': 'Mehrere Räume oder unsicher, welches Gerät passt? Erzählen Sie uns von Ihrem Zuhause – Sie erhalten innerhalb von 24 Stunden ein Angebot.',
      'contact.phone': 'Telefon', 'contact.email': 'E-Mail', 'contact.hours': 'Zeiten', 'contact.hoursVal': 'Mo–Fr 8:00–18:00 MEZ',
      'form.name': 'Name', 'form.email': 'E-Mail', 'form.country': 'Land', 'form.rooms': 'Anzahl Räume', 'form.msg': 'Nachricht',
      'form.consent': 'Ich stimme zu, dass meine Daten zur Bearbeitung meiner Anfrage verwendet werden (DSGVO).', 'form.send': 'Angebot anfordern',
      'form.ok': 'Vielen Dank! Wir melden uns innerhalb von 24 Stunden.', 'form.err': 'Bitte füllen Sie die markierten Felder aus.', 'form.fail': 'Senden fehlgeschlagen. Bitte erneut versuchen oder per E-Mail schreiben.',
      'form.choose': 'Bitte wählen…',
      'footer.about': 'Klimaanlagen und Wärmepumpen für Wohnungen und Büros in ganz Europa.',
      'footer.shop': 'Shop', 'footer.service': 'Service', 'footer.warranty': 'Garantie & Rückgabe', 'footer.legal': 'Rechtliches',
      'footer.imprint': 'Impressum', 'footer.privacy': 'Datenschutz', 'footer.terms': 'AGB',
      'footer.vat': 'Alle Preise in EUR inkl. MwSt. Energielabel gemäß EU-Verordnung 2017/1369.',
      'cart.title': 'Ihr Warenkorb', 'cart.subtotal': 'Zwischensumme', 'cart.install': 'Montage', 'cart.shipping': 'Versand',
      'cart.total': 'Gesamt (inkl. MwSt.)', 'cart.checkout': 'Zur Kasse', 'cart.empty': 'Ihr Warenkorb ist leer.', 'cart.free': 'Kostenlos',
      'cart.addInstall': 'Montage hinzufügen (+{price})', 'cart.remove': 'Entfernen', 'cart.freeHint': 'Noch {amount} bis zum kostenlosen Versand',
      'co.title': 'Kasse', 'co.address': 'Straße und Hausnummer', 'co.zip': 'PLZ', 'co.city': 'Ort',
      'co.phone': 'Telefon (für den Monteur)', 'co.terms': 'Ich akzeptiere die AGB und das 14-tägige Widerrufsrecht.', 'co.place': 'Zahlungspflichtig bestellen',
      'co.done': 'Bestellung eingegangen!', 'co.doneText': 'Ihre Bestellnummer lautet <b>{id}</b>. Eine Bestätigung geht an {email}. Wir rufen Sie innerhalb eines Werktags an, um Lieferung und Montage zu planen.',
      'co.back': 'Weiter einkaufen',
    },
    fr: {
      'nav.shop': 'Boutique', 'nav.calc': 'Calculateur', 'nav.install': 'Installation', 'nav.faq': 'FAQ', 'nav.contact': 'Contact',
      'hero.eyebrow': 'Livraison dans les 27 pays de l’UE',
      'hero.title': 'Étés frais. Hivers chauds. Factures plus basses.',
      'hero.lead': 'Climatiseurs split et pompes à chaleur air-air économes en énergie, classés A+++, avec fluides à faible PRG et pose par des techniciens certifiés F-gaz.',
      'hero.cta1': 'Voir les climatiseurs', 'hero.cta2': 'Trouver la bonne taille',
      'hero.p1': 'Garantie 5 ans', 'hero.p2': 'Retour sous 14 jours', 'hero.p3': 'Prix TTC',
      'trust.1': 'Meilleure classe énergétique UE', 'trust.2': 'Fluides à faible PRG', 'trust.3': 'Chauffage jusqu’à', 'trust.4': 'Unités intérieures ultra-silencieuses',
      'calc.title': 'Quelle puissance me faut-il ?',
      'calc.lead': 'Indiquez les caractéristiques de la pièce et nous recommandons une puissance frigorifique. C’est une estimation ; nos installateurs la confirment sur place.',
      'calc.area': 'Surface (m²)', 'calc.height': 'Hauteur sous plafond (m)', 'calc.sun': 'Ensoleillement',
      'calc.sun1': 'Ombragé / exposé nord', 'calc.sun2': 'Normal', 'calc.sun3': 'Très ensoleillé / exposé sud',
      'calc.insul': 'Isolation', 'calc.insul1': 'Bonne (neuf)', 'calc.insul2': 'Moyenne', 'calc.insul3': 'Faible (ancien, combles)',
      'calc.show': 'Voir les modèles adaptés',
      'calc.result': 'Puissance recommandée : <strong>{kw} kW</strong><br><span class="muted">≈ {btu} BTU/h</span>',
      'calc.note': 'Modèles à partir de {kw} kW pour votre pièce.', 'calc.clear': 'Tout afficher',
      'shop.title': 'Climatiseurs & pompes à chaleur',
      'shop.lead': 'Tous les appareils chauffent et refroidissent. Prix TTC ; la pose peut être ajoutée au panier.',
      'f.all': 'Tous', 'f.wall': 'Split mural', 'f.multi': 'Multi-split', 'f.portable': 'Mobile', 'f.floor': 'Console',
      'f.capAll': 'Toutes puissances', 'f.cap1': 'Jusqu’à 3 kW (≤ 30 m²)', 'f.cap2': '3–5,5 kW (30–55 m²)', 'f.cap3': 'Plus de 5,5 kW (55 m²+)',
      'f.sortPop': 'Populaires', 'f.sortLow': 'Prix croissant', 'f.sortHigh': 'Prix décroissant', 'f.sortEff': 'Plus efficaces',
      'p.cool': 'Froid', 'p.heat': 'Chaud', 'p.seer': 'SEER', 'p.scop': 'SCOP', 'p.noise': 'Bruit', 'p.gas': 'Fluide', 'p.rooms': 'Pièces',
      'p.add': 'Ajouter au panier', 'p.added': '{name} ajouté au panier', 'p.forRoom': 'pour pièces jusqu’à {m2} m²', 'p.none': 'Aucun modèle ne correspond à ces filtres.',
      'b.bestseller': 'Meilleure vente', 'b.cold': 'Climat nordique', 'b.diy': 'Sans installateur',
      'inst.title': 'De la commande à l’air frais en 3 étapes',
      'inst.lead': 'Les systèmes split doivent être installés par un technicien certifié F-gaz (règlement UE 2024/573). Nous nous en chargeons.',
      'inst.s1t': 'Commandez en ligne', 'inst.s1': 'Choisissez votre appareil et ajoutez la pose. Nous vous appelons sous un jour ouvré pour planifier la visite.',
      'inst.s2t': 'Livraison', 'inst.s2': 'Livraison gratuite dès 500 €, généralement en 3 à 7 jours ouvrés dans toute l’UE.',
      'inst.s3t': 'Pose professionnelle', 'inst.s3': 'Un installateur certifié pose, tire au vide et met en service le système, généralement en une demi-journée.',
      'sub.title': 'Économisez grâce aux aides',
      'sub.text': 'De nombreux pays de l’UE proposent des aides ou une TVA réduite pour les pompes à chaleur air-air. Nous fournissons factures et fiches techniques pour votre dossier.',
      'sub.cta': 'Se renseigner sur les aides',
      'faq.title': 'Questions fréquentes',
      'faq.q1': 'Ces appareils chauffent-ils aussi ?', 'faq.a1': 'Oui. Chaque split est une pompe à chaleur air-air qui produit en général 4 à 5 kWh de chaleur par kWh d’électricité. Le Nordic 35 chauffe jusqu’à −25 °C extérieur.',
      'faq.q2': 'Ai-je besoin d’un installateur ?', 'faq.a2': 'Les modèles muraux, consoles et multi-split contiennent du fluide frigorigène et doivent être raccordés par un technicien certifié F-gaz. Ajoutez la pose au panier. Les mobiles n’en ont pas besoin.',
      'faq.q3': 'Dans quels pays livrez-vous ?', 'faq.a3': 'Dans les 27 États membres de l’UE. La pose est disponible dans la plupart des régions ; nous la confirmons pour votre code postal après la commande.',
      'faq.q4': 'Quelle garantie ?', 'faq.a4': 'Cinq ans pièces et main-d’œuvre pour les splits posés, deux ans pour les mobiles, en plus de vos droits légaux.',
      'faq.q5': 'Puis-je retourner un appareil ?', 'faq.a5': 'Oui. Vous disposez d’un droit de rétractation de 14 jours pour les produits non utilisés, non installés et dans leur emballage d’origine.',
      'faq.q6': 'Quels fluides utilisez-vous ?', 'faq.a6': 'Nos splits utilisent du R32 et nos mobiles du R290 naturel (propane), tous deux avec un PRG bien inférieur aux anciens systèmes R410A.',
      'contact.title': 'Devis gratuit',
      'contact.lead': 'Plusieurs pièces à climatiser ou un doute sur le modèle ? Parlez-nous de votre logement et recevez un devis sous 24 heures.',
      'contact.phone': 'Téléphone', 'contact.email': 'E-mail', 'contact.hours': 'Horaires', 'contact.hoursVal': 'Lun–Ven 8h00–18h00 CET',
      'form.name': 'Nom', 'form.email': 'E-mail', 'form.country': 'Pays', 'form.rooms': 'Nombre de pièces', 'form.msg': 'Message',
      'form.consent': 'J’accepte que mes données soient utilisées pour traiter ma demande (RGPD).', 'form.send': 'Demander un devis',
      'form.ok': 'Merci ! Nous vous répondons sous 24 heures.', 'form.err': 'Veuillez remplir les champs signalés.', 'form.fail': 'Échec de l’envoi. Réessayez ou écrivez-nous.',
      'form.choose': 'Choisir…',
      'footer.about': 'Climatisation et pompes à chaleur pour logements et bureaux dans toute l’Europe.',
      'footer.shop': 'Boutique', 'footer.service': 'Service', 'footer.warranty': 'Garantie & retours', 'footer.legal': 'Mentions',
      'footer.imprint': 'Mentions légales', 'footer.privacy': 'Confidentialité', 'footer.terms': 'CGV',
      'footer.vat': 'Tous les prix en EUR TTC. Étiquettes énergie selon le règlement UE 2017/1369.',
      'cart.title': 'Votre panier', 'cart.subtotal': 'Sous-total', 'cart.install': 'Pose', 'cart.shipping': 'Livraison',
      'cart.total': 'Total TTC', 'cart.checkout': 'Commander', 'cart.empty': 'Votre panier est vide.', 'cart.free': 'Gratuite',
      'cart.addInstall': 'Ajouter la pose (+{price})', 'cart.remove': 'Retirer', 'cart.freeHint': 'Encore {amount} pour la livraison gratuite',
      'co.title': 'Commande', 'co.address': 'Rue et numéro', 'co.zip': 'Code postal', 'co.city': 'Ville',
      'co.phone': 'Téléphone (pour l’installateur)', 'co.terms': 'J’accepte les CGV et le droit de rétractation de 14 jours.', 'co.place': 'Valider la commande',
      'co.done': 'Commande reçue !', 'co.doneText': 'Votre numéro de commande est <b>{id}</b>. Une confirmation est envoyée à {email}. Nous vous appelons sous un jour ouvré pour planifier livraison et pose.',
      'co.back': 'Continuer mes achats',
    },
    nl: {
      'nav.shop': 'Shop', 'nav.calc': 'Vermogen berekenen', 'nav.install': 'Installatie', 'nav.faq': 'FAQ', 'nav.contact': 'Contact',
      'hero.eyebrow': 'Bezorging in alle 27 EU-landen',
      'hero.title': 'Koele zomers. Warme winters. Lagere energierekening.',
      'hero.lead': 'Zuinige split-airco’s en lucht-luchtwarmtepompen met A+++, koudemiddelen met lage GWP en installatie door F-gassen-gecertificeerde monteurs.',
      'hero.cta1': 'Bekijk airco’s', 'hero.cta2': 'Vind het juiste vermogen',
      'hero.p1': '5 jaar garantie', 'hero.p2': '14 dagen retour', 'hero.p3': 'Prijzen incl. btw',
      'trust.1': 'Hoogste EU-energieklasse', 'trust.2': 'Koudemiddelen met lage GWP', 'trust.3': 'Verwarmen tot', 'trust.4': 'Fluisterstille binnenunits',
      'calc.title': 'Welk vermogen heb ik nodig?',
      'calc.lead': 'Vul je ruimte in en wij adviseren een koelvermogen. Dit is een schatting; onze monteurs controleren het ter plaatse.',
      'calc.area': 'Oppervlakte (m²)', 'calc.height': 'Plafondhoogte (m)', 'calc.sun': 'Zoninstraling',
      'calc.sun1': 'Schaduw / noordzijde', 'calc.sun2': 'Normaal', 'calc.sun3': 'Zeer zonnig / zuidzijde',
      'calc.insul': 'Isolatie', 'calc.insul1': 'Goed (nieuwbouw)', 'calc.insul2': 'Gemiddeld', 'calc.insul3': 'Slecht (oud pand, zolder)',
      'calc.show': 'Toon passende units',
      'calc.result': 'Aanbevolen koelvermogen: <strong>{kw} kW</strong><br><span class="muted">≈ {btu} BTU/h</span>',
      'calc.note': 'Units vanaf {kw} kW voor jouw ruimte.', 'calc.clear': 'Toon alles',
      'shop.title': 'Airco’s & warmtepompen',
      'shop.lead': 'Alle units koelen en verwarmen. Prijzen incl. btw; installatie voeg je toe in de winkelwagen.',
      'f.all': 'Alle', 'f.wall': 'Wandmodel', 'f.multi': 'Multi-split', 'f.portable': 'Mobiel', 'f.floor': 'Vloermodel',
      'f.capAll': 'Elk vermogen', 'f.cap1': 'Tot 3 kW (≤ 30 m²)', 'f.cap2': '3–5,5 kW (30–55 m²)', 'f.cap3': 'Meer dan 5,5 kW (55 m²+)',
      'f.sortPop': 'Populairst', 'f.sortLow': 'Prijs laag–hoog', 'f.sortHigh': 'Prijs hoog–laag', 'f.sortEff': 'Zuinigst',
      'p.cool': 'Koelen', 'p.heat': 'Verwarmen', 'p.seer': 'SEER', 'p.scop': 'SCOP', 'p.noise': 'Geluid', 'p.gas': 'Koudemiddel', 'p.rooms': 'Ruimtes',
      'p.add': 'In winkelwagen', 'p.added': '{name} toegevoegd', 'p.forRoom': 'voor ruimtes tot {m2} m²', 'p.none': 'Geen units gevonden met deze filters.',
      'b.bestseller': 'Bestseller', 'b.cold': 'Noords klimaat', 'b.diy': 'Geen monteur nodig',
      'inst.title': 'In 3 stappen naar koele lucht',
      'inst.lead': 'Split-systemen moeten volgens EU-verordening 2024/573 door een F-gassen-gecertificeerde monteur worden geïnstalleerd. Wij regelen dat.',
      'inst.s1t': 'Online bestellen', 'inst.s1': 'Kies je unit en voeg installatie toe. We bellen je binnen één werkdag om de afspraak te plannen.',
      'inst.s2t': 'Bezorging', 'inst.s2': 'Gratis bezorging vanaf €500, meestal binnen 3–7 werkdagen in de hele EU.',
      'inst.s3t': 'Professionele installatie', 'inst.s3': 'Een gecertificeerde monteur plaatst, vacumeert en neemt het systeem in gebruik, meestal in een halve dag.',
      'sub.title': 'Bespaar met warmtepompsubsidie',
      'sub.text': 'Veel EU-landen geven subsidie of verlaagd btw-tarief op lucht-luchtwarmtepompen. Wij leveren de facturen en datasheets voor je aanvraag.',
      'sub.cta': 'Vraag naar subsidie',
      'faq.title': 'Veelgestelde vragen',
      'faq.q1': 'Kunnen deze units ook verwarmen?', 'faq.a1': 'Ja. Elke split-unit is een lucht-luchtwarmtepomp en levert doorgaans 4–5 kWh warmte per kWh stroom. De Nordic 35 verwarmt tot −25 °C buitentemperatuur.',
      'faq.q2': 'Heb ik een monteur nodig?', 'faq.a2': 'Wand-, vloer- en multi-split-systemen bevatten koudemiddel en moeten door een F-gassen-gecertificeerde monteur worden aangesloten. Voeg installatie toe in de winkelwagen. Mobiele units hebben geen monteur nodig.',
      'faq.q3': 'Naar welke landen leveren jullie?', 'faq.a3': 'Naar alle 27 EU-lidstaten. Installatie is in de meeste regio’s mogelijk; we bevestigen dit na je bestelling voor jouw postcode.',
      'faq.q4': 'Welke garantie krijg ik?', 'faq.a4': 'Vijf jaar op onderdelen en arbeid voor geïnstalleerde split-units, twee jaar op mobiele units, bovenop je wettelijke rechten.',
      'faq.q5': 'Kan ik een unit retourneren?', 'faq.a5': 'Ja. Je hebt 14 dagen bedenktijd voor ongebruikte, niet-geïnstalleerde producten in de originele verpakking.',
      'faq.q6': 'Welke koudemiddelen gebruiken jullie?', 'faq.a6': 'Onze split-units gebruiken R32 en onze mobiele units het natuurlijke R290 (propaan), beide met een veel lagere GWP dan oudere R410A-systemen.',
      'contact.title': 'Gratis offerte',
      'contact.lead': 'Meerdere ruimtes koelen of twijfel je welke unit past? Vertel ons over je woning en ontvang binnen 24 uur een offerte op maat.',
      'contact.phone': 'Telefoon', 'contact.email': 'E-mail', 'contact.hours': 'Tijden', 'contact.hoursVal': 'Ma–vr 8:00–18:00 CET',
      'form.name': 'Naam', 'form.email': 'E-mail', 'form.country': 'Land', 'form.rooms': 'Aantal ruimtes', 'form.msg': 'Bericht',
      'form.consent': 'Ik ga akkoord dat mijn gegevens worden gebruikt om mijn aanvraag te beantwoorden (AVG).', 'form.send': 'Offerte aanvragen',
      'form.ok': 'Bedankt! We reageren binnen 24 uur.', 'form.err': 'Vul de gemarkeerde velden in.', 'form.fail': 'Verzenden mislukt. Probeer opnieuw of mail ons.',
      'form.choose': 'Kies…',
      'footer.about': 'Airco’s en warmtepompen voor woningen en kantoren in heel Europa.',
      'footer.shop': 'Shop', 'footer.service': 'Service', 'footer.warranty': 'Garantie & retour', 'footer.legal': 'Juridisch',
      'footer.imprint': 'Colofon', 'footer.privacy': 'Privacybeleid', 'footer.terms': 'Algemene voorwaarden',
      'footer.vat': 'Alle prijzen in EUR incl. btw. Energielabels volgens EU-verordening 2017/1369.',
      'cart.title': 'Je winkelwagen', 'cart.subtotal': 'Subtotaal', 'cart.install': 'Installatie', 'cart.shipping': 'Verzending',
      'cart.total': 'Totaal (incl. btw)', 'cart.checkout': 'Afrekenen', 'cart.empty': 'Je winkelwagen is leeg.', 'cart.free': 'Gratis',
      'cart.addInstall': 'Installatie toevoegen (+{price})', 'cart.remove': 'Verwijderen', 'cart.freeHint': 'Nog {amount} tot gratis verzending',
      'co.title': 'Afrekenen', 'co.address': 'Straat en huisnummer', 'co.zip': 'Postcode', 'co.city': 'Plaats',
      'co.phone': 'Telefoon (voor de monteur)', 'co.terms': 'Ik ga akkoord met de voorwaarden en 14 dagen bedenktijd.', 'co.place': 'Bestelling plaatsen',
      'co.done': 'Bestelling ontvangen!', 'co.doneText': 'Je bestelnummer is <b>{id}</b>. Een bevestiging is onderweg naar {email}. We bellen je binnen één werkdag om bezorging en installatie te plannen.',
      'co.back': 'Verder winkelen',
    },
    es: {
      'nav.shop': 'Tienda', 'nav.calc': 'Calculadora', 'nav.install': 'Instalación', 'nav.faq': 'FAQ', 'nav.contact': 'Contacto',
      'hero.eyebrow': 'Envío a los 27 países de la UE',
      'hero.title': 'Veranos frescos. Inviernos cálidos. Facturas más bajas.',
      'hero.lead': 'Aires acondicionados split y bombas de calor aire-aire eficientes, con clase A+++, refrigerantes de bajo PCA e instalación por técnicos certificados en gases fluorados.',
      'hero.cta1': 'Ver aires acondicionados', 'hero.cta2': 'Calcular la potencia',
      'hero.p1': '5 años de garantía', 'hero.p2': '14 días de devolución', 'hero.p3': 'Precios con IVA',
      'trust.1': 'Máxima clase energética UE', 'trust.2': 'Refrigerantes de bajo PCA', 'trust.3': 'Calefacción hasta', 'trust.4': 'Unidades interiores silenciosas',
      'calc.title': '¿Qué potencia necesito?',
      'calc.lead': 'Introduce los datos de la estancia y te recomendamos una potencia de frío. Es una estimación; nuestros instaladores la confirman in situ.',
      'calc.area': 'Superficie (m²)', 'calc.height': 'Altura del techo (m)', 'calc.sun': 'Exposición solar',
      'calc.sun1': 'Sombra / orientación norte', 'calc.sun2': 'Normal', 'calc.sun3': 'Muy soleado / orientación sur',
      'calc.insul': 'Aislamiento', 'calc.insul1': 'Bueno (obra nueva)', 'calc.insul2': 'Medio', 'calc.insul3': 'Malo (edificio antiguo, ático)',
      'calc.show': 'Ver equipos adecuados',
      'calc.result': 'Potencia recomendada: <strong>{kw} kW</strong><br><span class="muted">≈ {btu} BTU/h</span>',
      'calc.note': 'Equipos desde {kw} kW para tu estancia.', 'calc.clear': 'Ver todos',
      'shop.title': 'Aires acondicionados y bombas de calor',
      'shop.lead': 'Todos los equipos enfrían y calientan. Precios con IVA; puedes añadir la instalación en el carrito.',
      'f.all': 'Todos', 'f.wall': 'Split de pared', 'f.multi': 'Multi-split', 'f.portable': 'Portátil', 'f.floor': 'Consola de suelo',
      'f.capAll': 'Cualquier potencia', 'f.cap1': 'Hasta 3 kW (≤ 30 m²)', 'f.cap2': '3–5,5 kW (30–55 m²)', 'f.cap3': 'Más de 5,5 kW (55 m²+)',
      'f.sortPop': 'Más populares', 'f.sortLow': 'Precio: menor a mayor', 'f.sortHigh': 'Precio: mayor a menor', 'f.sortEff': 'Más eficientes',
      'p.cool': 'Frío', 'p.heat': 'Calor', 'p.seer': 'SEER', 'p.scop': 'SCOP', 'p.noise': 'Ruido', 'p.gas': 'Refrigerante', 'p.rooms': 'Estancias',
      'p.add': 'Añadir al carrito', 'p.added': '{name} añadido al carrito', 'p.forRoom': 'para estancias de hasta {m2} m²', 'p.none': 'Ningún equipo coincide con estos filtros.',
      'b.bestseller': 'Más vendido', 'b.cold': 'Clima nórdico', 'b.diy': 'Sin instalador',
      'inst.title': 'Del pedido al aire fresco en 3 pasos',
      'inst.lead': 'Los sistemas split deben instalarlos técnicos certificados según el Reglamento UE 2024/573. Nosotros nos encargamos.',
      'inst.s1t': 'Pide online', 'inst.s1': 'Elige tu equipo y añade la instalación. Te llamamos en un día laborable para planificar la visita.',
      'inst.s2t': 'Entrega', 'inst.s2': 'Envío gratis desde 500 €, normalmente en 3–7 días laborables en toda la UE.',
      'inst.s3t': 'Instalación profesional', 'inst.s3': 'Un instalador certificado monta, hace el vacío y pone en marcha el sistema, normalmente en media jornada.',
      'sub.title': 'Ahorra con ayudas para bombas de calor',
      'sub.text': 'Muchos países de la UE ofrecen subvenciones o IVA reducido para bombas de calor aire-aire. Te damos las facturas y fichas técnicas para tu solicitud.',
      'sub.cta': 'Consultar ayudas',
      'faq.title': 'Preguntas frecuentes',
      'faq.q1': '¿Estos equipos también calientan?', 'faq.a1': 'Sí. Cada split es una bomba de calor aire-aire que suele dar 4–5 kWh de calor por kWh de electricidad. El Nordic 35 calienta hasta −25 °C exteriores.',
      'faq.q2': '¿Necesito un instalador?', 'faq.a2': 'Los equipos de pared, consola y multi-split contienen refrigerante y debe conectarlos un técnico certificado. Añade la instalación en el carrito. Los portátiles no lo necesitan.',
      'faq.q3': '¿A qué países enviáis?', 'faq.a3': 'A los 27 estados miembros de la UE. La instalación está disponible en la mayoría de regiones; la confirmamos para tu código postal tras el pedido.',
      'faq.q4': '¿Qué garantía tengo?', 'faq.a4': 'Cinco años en piezas y mano de obra para splits instalados y dos años para portátiles, además de tus derechos legales.',
      'faq.q5': '¿Puedo devolver un equipo?', 'faq.a5': 'Sí. Tienes 14 días de desistimiento para productos sin usar, sin instalar y en su embalaje original.',
      'faq.q6': '¿Qué refrigerantes usáis?', 'faq.a6': 'Nuestros splits usan R32 y los portátiles R290 natural (propano), ambos con un PCA mucho menor que los antiguos sistemas R410A.',
      'contact.title': 'Presupuesto gratis',
      'contact.lead': '¿Varias estancias o dudas sobre qué equipo elegir? Cuéntanos sobre tu vivienda y recibe un presupuesto en 24 horas.',
      'contact.phone': 'Teléfono', 'contact.email': 'Correo', 'contact.hours': 'Horario', 'contact.hoursVal': 'Lun–Vie 8:00–18:00 CET',
      'form.name': 'Nombre', 'form.email': 'Correo', 'form.country': 'País', 'form.rooms': 'Número de estancias', 'form.msg': 'Mensaje',
      'form.consent': 'Acepto que mis datos se usen para responder a mi solicitud (RGPD).', 'form.send': 'Pedir presupuesto',
      'form.ok': '¡Gracias! Te responderemos en 24 horas.', 'form.err': 'Rellena los campos marcados.', 'form.fail': 'Error al enviar. Inténtalo de nuevo o escríbenos.',
      'form.choose': 'Elegir…',
      'footer.about': 'Aire acondicionado y bombas de calor para hogares y oficinas en toda Europa.',
      'footer.shop': 'Tienda', 'footer.service': 'Servicio', 'footer.warranty': 'Garantía y devoluciones', 'footer.legal': 'Legal',
      'footer.imprint': 'Aviso legal', 'footer.privacy': 'Privacidad', 'footer.terms': 'Condiciones',
      'footer.vat': 'Todos los precios en EUR con IVA. Etiquetas energéticas según el Reglamento UE 2017/1369.',
      'cart.title': 'Tu carrito', 'cart.subtotal': 'Subtotal', 'cart.install': 'Instalación', 'cart.shipping': 'Envío',
      'cart.total': 'Total (IVA incl.)', 'cart.checkout': 'Finalizar compra', 'cart.empty': 'Tu carrito está vacío.', 'cart.free': 'Gratis',
      'cart.addInstall': 'Añadir instalación (+{price})', 'cart.remove': 'Quitar', 'cart.freeHint': 'Faltan {amount} para el envío gratis',
      'co.title': 'Finalizar compra', 'co.address': 'Calle y número', 'co.zip': 'Código postal', 'co.city': 'Ciudad',
      'co.phone': 'Teléfono (para el instalador)', 'co.terms': 'Acepto las condiciones y el derecho de desistimiento de 14 días.', 'co.place': 'Realizar pedido',
      'co.done': '¡Pedido recibido!', 'co.doneText': 'Tu número de pedido es <b>{id}</b>. Te enviamos la confirmación a {email}. Te llamaremos en un día laborable para planificar entrega e instalación.',
      'co.back': 'Seguir comprando',
    },
  };

  const LOCALES = { en: 'en-IE', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', es: 'es-ES' };

  // ----------------------------------------------------------------- state
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const browserLang = (navigator.language || 'en').slice(0, 2);
  let lang = store.get('lang', I18N[browserLang] ? browserLang : 'en');
  if (!I18N[lang]) lang = 'en';
  let cart = store.get('cart', []).filter((l) => PRODUCTS.some((p) => p.id === l.id));
  const filter = { type: 'all', cap: 'all', sort: 'pop', minKw: 0 };

  // --------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const t = (key, vars) => {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
    return s;
  };
  const money = (n) => new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const num = (n, d = 1) => new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: d }).format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  // Rule of thumb for the room size a unit can cool: ~100 W per m² at 2.6 m.
  const roomFor = (kw) => Math.round(kw * 10);

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------- product artwork
  function unitSvg(type) {
    if (type === 'portable') {
      return `<svg viewBox="0 0 200 160" aria-hidden="true">
        <rect x="70" y="14" width="60" height="132" rx="14" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
        <rect x="80" y="26" width="40" height="10" rx="5" fill="#e9eef5"/>
        <circle cx="114" cy="31" r="2.5" fill="#2ad38b"/>
        ${[50, 60, 70, 80, 90, 100, 110].map((y) => `<rect x="82" y="${y}" width="36" height="3" rx="1.5" fill="#e3e9f2"/>`).join('')}
        <path d="M130 120 q30 0 36 -40 q4 -26 20 -30" fill="none" stroke="#c9d3e1" stroke-width="10" stroke-linecap="round"/>
        <rect x="76" y="142" width="10" height="6" rx="3" fill="#9aa8bd"/><rect x="114" y="142" width="10" height="6" rx="3" fill="#9aa8bd"/>
      </svg>`;
    }
    if (type === 'floor') {
      return `<svg viewBox="0 0 200 160" aria-hidden="true">
        <rect x="30" y="40" width="140" height="96" rx="12" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
        <rect x="42" y="50" width="116" height="16" rx="4" fill="#e9eef5"/>
        ${[78, 88, 98, 108, 118].map((y) => `<rect x="42" y="${y}" width="116" height="4" rx="2" fill="#e3e9f2"/>`).join('')}
        <circle cx="150" cy="58" r="3" fill="#2ad38b"/>
        <path d="M60 34 q8 -14 0 -26 M100 34 q8 -14 0 -26 M140 34 q8 -14 0 -26" fill="none" stroke="#9cc7ff" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    }
    const indoor = (x, y, w) => `
      <rect x="${x}" y="${y}" width="${w}" height="${w * 0.28}" rx="${w * 0.07}" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
      <rect x="${x + w * 0.06}" y="${y + w * 0.22}" width="${w * 0.88}" height="${w * 0.04}" rx="2" fill="#dfe5ee"/>
      <circle cx="${x + w * 0.88}" cy="${y + w * 0.12}" r="${w * 0.018}" fill="#2ad38b"/>`;
    if (type === 'multi') {
      return `<svg viewBox="0 0 200 160" aria-hidden="true">
        ${indoor(14, 18, 80)}${indoor(106, 18, 80)}
        <rect x="56" y="78" width="88" height="66" rx="8" fill="#f7f9fc" stroke="#d3dbe7" stroke-width="2"/>
        <circle cx="86" cy="111" r="22" fill="none" stroke="#c9d3e1" stroke-width="3"/>
        <path d="M86 92v38M67 111h38M73 98l26 26M99 98l-26 26" stroke="#dbe2ec" stroke-width="2"/>
        ${[92, 100, 108, 116, 124, 132].map((y) => `<rect x="116" y="${y}" width="20" height="3" rx="1.5" fill="#dbe2ec"/>`).join('')}
      </svg>`;
    }
    return `<svg viewBox="0 0 200 160" aria-hidden="true">
      ${indoor(20, 30, 160)}
      <path d="M50 92 q-6 22 4 44 M100 92 q-6 22 4 44 M150 92 q-6 22 4 44" fill="none" stroke="#9cc7ff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    </svg>`;
  }

  function energyTag(cls) {
    const c = ENERGY_COLORS[cls] || '#999';
    const dark = cls === 'A' ? 'color:#0b1b33;' : '';
    return `<div class="energy" style="--c:${c};${dark}" title="EU energy class (cooling)"><span>${esc(cls)}</span></div>`;
  }

  // ---------------------------------------------------------------- render
  function applyI18n() {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $('#langSelect').value = lang;
    fillCountries();
    renderFaq();
    renderProducts();
    renderCart();
    updateCalc();
  }

  function fillCountries() {
    let names;
    try { names = new Intl.DisplayNames([LOCALES[lang]], { type: 'region' }); } catch { names = null; }
    const opts = CONFIG.countries
      .map((code) => ({ code, name: names ? names.of(code) : code }))
      .sort((a, b) => a.name.localeCompare(b.name, LOCALES[lang]));
    $$('#countrySelect, #coCountry').forEach((sel) => {
      const current = sel.value;
      sel.innerHTML = `<option value="">${esc(t('form.choose'))}</option>` +
        opts.map((o) => `<option value="${o.code}">${esc(o.name)}</option>`).join('');
      sel.value = current;
    });
  }

  function renderFaq() {
    const open = $$('#faqList details').map((d) => d.open);
    $('#faqList').innerHTML = [1, 2, 3, 4, 5, 6].map((i) =>
      `<details${open[i - 1] ? ' open' : ''}><summary>${esc(t('faq.q' + i))}</summary><p>${esc(t('faq.a' + i))}</p></details>`).join('');
  }

  function visibleProducts() {
    let list = PRODUCTS.filter((p) => filter.type === 'all' || p.type === filter.type);
    if (filter.cap !== 'all') {
      const [lo, hi] = filter.cap.split('-').map(Number);
      list = list.filter((p) => p.cool > lo && p.cool <= hi);
    }
    if (filter.minKw) list = list.filter((p) => p.cool >= filter.minKw && p.cool <= Math.max(filter.minKw * 1.6, filter.minKw + 1.5));
    const sorters = {
      pop: (a, b) => b.pop - a.pop,
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      seer: (a, b) => b.seer - a.seer,
    };
    return list.sort(sorters[filter.sort]);
  }

  function renderProducts() {
    const list = visibleProducts();
    const typeLabel = { wall: t('f.wall'), multi: t('f.multi'), portable: t('f.portable'), floor: t('f.floor') };
    $('#productGrid').innerHTML = list.length ? list.map((p) => `
      <article class="card">
        <div class="card-media">
          ${p.badge ? `<span class="badge">${esc(t('b.' + p.badge))}</span>` : ''}
          ${energyTag(p.seerClass)}
          ${unitSvg(p.type)}
        </div>
        <div class="card-body">
          <span class="card-type">${esc(typeLabel[p.type])}</span>
          <h3>Bokitos ${esc(p.name)}</h3>
          <p class="card-room">${esc(t('p.forRoom', { m2: p.rooms ? `${p.rooms} × ${roomFor(p.cool / p.rooms)}` : roomFor(p.cool) }))}</p>
          <dl class="specs">
            <div><dt>${t('p.cool')}</dt><dd>${num(p.cool)} kW</dd></div>
            <div><dt>${t('p.heat')}</dt><dd>${num(p.heat)} kW</dd></div>
            <div><dt>${p.type === 'portable' ? 'EER' : t('p.seer')}</dt><dd>${num(p.seer)}</dd></div>
            ${p.scop ? `<div><dt>${t('p.scop')}</dt><dd>${num(p.scop)} (${p.scopClass})</dd></div>` : `<div><dt>${t('p.gas')}</dt><dd>${p.refrigerant}</dd></div>`}
            <div><dt>${t('p.noise')}</dt><dd>${p.noise} dB(A)</dd></div>
            ${p.rooms ? `<div><dt>${t('p.rooms')}</dt><dd>${p.rooms}</dd></div>` : p.scop ? `<div><dt>${t('p.gas')}</dt><dd>${p.refrigerant}</dd></div>` : '<div><dt>Wi-Fi</dt><dd>' + (p.wifi ? '✓' : '–') + '</dd></div>'}
          </dl>
          <div class="card-foot">
            <div class="price">
              ${p.was ? `<s>${money(p.was)}</s>` : ''}${money(p.price)}
            </div>
            <button class="btn btn-primary" data-add="${p.id}">${esc(t('p.add'))}</button>
          </div>
        </div>
      </article>`).join('') : `<p class="empty">${esc(t('p.none'))}</p>`;

    const note = $('#resultNote');
    if (filter.minKw) {
      note.hidden = false;
      note.innerHTML = `<span>${esc(t('calc.note', { kw: num(filter.minKw) }))}</span><button type="button" id="clearCalc">${esc(t('calc.clear'))}</button>`;
    } else {
      note.hidden = true;
    }
  }

  // ------------------------------------------------------------ calculator
  function calcKw() {
    const area = parseFloat($('#calcArea').value);
    const height = parseFloat($('#calcHeight').value);
    if (!(area > 0) || !(height > 0)) return null;
    const sun = parseFloat($('#calcSun').value);
    const insul = parseFloat($('#calcInsul').value);
    // ~100 W/m² for a 2.6 m ceiling, scaled by volume, sun and insulation.
    const kw = area * 0.1 * (height / 2.6) * sun * insul;
    return Math.max(1.5, Math.round(kw * 10) / 10);
  }

  function updateCalc() {
    const kw = calcKw();
    $('#calcResult').innerHTML = kw
      ? t('calc.result', { kw: num(kw), btu: num(Math.round(kw * 3412 / 100) * 100, 0) })
      : '';
  }

  // ------------------------------------------------------------------ cart
  function saveCart() { store.set('cart', cart); }

  function addToCart(id) {
    const p = byId(id);
    const line = cart.find((l) => l.id === id);
    if (line) line.qty += 1;
    else cart.push({ id, qty: 1, install: p.type !== 'portable' });
    saveCart();
    renderCart();
    const badge = $('#cartCount');
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
    toast(t('p.added', { name: 'Bokitos ' + p.name }));
  }

  function totals() {
    let subtotal = 0, install = 0;
    for (const l of cart) {
      const p = byId(l.id);
      subtotal += p.price * l.qty;
      if (l.install && CONFIG.installPrice[p.type]) install += CONFIG.installPrice[p.type] * l.qty;
    }
    const shipping = cart.length && subtotal < CONFIG.freeShippingFrom ? CONFIG.shippingFee : 0;
    return { subtotal, install, shipping, total: subtotal + install + shipping };
  }

  function renderCart() {
    const count = cart.reduce((n, l) => n + l.qty, 0);
    $('#cartCount').textContent = count;
    const items = $('#cartItems');
    if (!cart.length) {
      items.innerHTML = `<p class="cart-empty">${esc(t('cart.empty'))}</p>`;
      $('#cartFoot').hidden = true;
      return;
    }
    $('#cartFoot').hidden = false;
    items.innerHTML = cart.map((l) => {
      const p = byId(l.id);
      const ip = CONFIG.installPrice[p.type];
      return `<div class="cart-item" data-id="${p.id}">
        <div class="cart-thumb">${unitSvg(p.type)}</div>
        <div>
          <h4>Bokitos ${esc(p.name)}</h4>
          <div class="qty"><button data-qty="-1" aria-label="−">−</button><span>${l.qty}</span><button data-qty="1" aria-label="+">+</button></div>
          ${ip ? `<label class="install-toggle"><input type="checkbox" data-install ${l.install ? 'checked' : ''}> ${esc(t('cart.addInstall', { price: money(ip) }))}</label>` : ''}
          <button class="remove" data-remove>${esc(t('cart.remove'))}</button>
        </div>
        <div class="ci-price">${money(p.price * l.qty)}</div>
      </div>`;
    }).join('');

    const tt = totals();
    $('#cartSubtotal').textContent = money(tt.subtotal);
    $('#cartInstall').textContent = money(tt.install);
    $('#cartShipping').textContent = tt.shipping ? money(tt.shipping) : t('cart.free');
    $('#cartTotal').textContent = money(tt.total);
    if (tt.shipping) {
      items.insertAdjacentHTML('beforeend', `<p class="muted" style="font-size:13px;margin:14px 0 0">${esc(t('cart.freeHint', { amount: money(CONFIG.freeShippingFrom - tt.subtotal) }))}</p>`);
    }
  }

  function openCart() {
    $('#cart').classList.add('open');
    $('#cart').setAttribute('aria-hidden', 'false');
    $('#overlay').hidden = false;
    document.body.classList.add('no-scroll');
  }
  function closeCart() {
    $('#cart').classList.remove('open');
    $('#cart').setAttribute('aria-hidden', 'true');
    $('#overlay').hidden = true;
    document.body.classList.remove('no-scroll');
  }

  // ----------------------------------------------------------------- forms
  function validate(form) {
    let ok = true;
    $$('input, select, textarea', form).forEach((el) => {
      const bad = !el.checkValidity();
      el.classList.toggle('invalid', bad);
      if (bad) ok = false;
    });
    return ok;
  }

  async function submit(kind, data) {
    if (!CONFIG.formEndpoint) {
      console.info(`[demo mode] ${kind}`, data);
      await new Promise((r) => setTimeout(r, 500));
      return true;
    }
    const res = await fetch(CONFIG.formEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ kind, ...data }),
    });
    return res.ok;
  }

  async function handleForm(form, statusEl, kind, extra, onSuccess) {
    statusEl.className = 'form-status';
    if (!validate(form)) {
      statusEl.textContent = t('form.err');
      statusEl.classList.add('err');
      return;
    }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const data = Object.assign(Object.fromEntries(new FormData(form)), extra ? extra() : {});
      if (!(await submit(kind, data))) throw new Error('bad status');
      onSuccess(data);
    } catch (e) {
      statusEl.textContent = t('form.fail');
      statusEl.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  }

  function openCheckout() {
    if (!cart.length) return;
    closeCart();
    $('#coTotal').textContent = money(totals().total);
    $('#checkoutForm').hidden = false;
    $('#checkoutTitle').hidden = false;
    $('#checkoutDone').hidden = true;
    $('#coStatus').textContent = '';
    $('#checkout').hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => $('#checkoutForm input').focus(), 50);
  }
  function closeCheckout() {
    $('#checkout').hidden = true;
    document.body.classList.remove('no-scroll');
  }

  // ---------------------------------------------------------------- events
  function bind() {
    $('#year').textContent = new Date().getFullYear();

    $('#langSelect').addEventListener('change', (e) => { lang = e.target.value; store.set('lang', lang); applyI18n(); });

    $('#menuBtn').addEventListener('click', () => $('#mainNav').classList.toggle('open'));
    $$('#mainNav a').forEach((a) => a.addEventListener('click', () => $('#mainNav').classList.remove('open')));

    $$('.chip').forEach((chip) => chip.addEventListener('click', () => {
      $$('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      filter.type = chip.dataset.type;
      renderProducts();
    }));
    $('#capFilter').addEventListener('change', (e) => { filter.cap = e.target.value; filter.minKw = 0; renderProducts(); });
    $('#sortSelect').addEventListener('change', (e) => { filter.sort = e.target.value; renderProducts(); });

    $('#productGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (btn) addToCart(btn.dataset.add);
    });
    $('#resultNote').addEventListener('click', (e) => {
      if (e.target.id === 'clearCalc') { filter.minKw = 0; renderProducts(); }
    });

    $('#calcForm').addEventListener('input', updateCalc);
    $('#calcForm').addEventListener('submit', (e) => e.preventDefault());
    $('#calcShow').addEventListener('click', () => {
      const kw = calcKw();
      if (!kw) return;
      filter.minKw = kw;
      filter.cap = 'all';
      filter.type = 'all';
      $('#capFilter').value = 'all';
      $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.type === 'all'));
      renderProducts();
      $('#shop').scrollIntoView({ behavior: 'smooth' });
    });

    $('#cartOpen').addEventListener('click', openCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#overlay').addEventListener('click', closeCart);
    $('#cartItems').addEventListener('click', (e) => {
      const row = e.target.closest('.cart-item');
      if (!row) return;
      const line = cart.find((l) => l.id === row.dataset.id);
      const q = e.target.closest('[data-qty]');
      if (q) {
        line.qty += Number(q.dataset.qty);
        if (line.qty < 1) cart = cart.filter((l) => l !== line);
      } else if (e.target.closest('[data-remove]')) {
        cart = cart.filter((l) => l !== line);
      } else return;
      saveCart();
      renderCart();
    });
    $('#cartItems').addEventListener('change', (e) => {
      if (!e.target.matches('[data-install]')) return;
      const line = cart.find((l) => l.id === e.target.closest('.cart-item').dataset.id);
      line.install = e.target.checked;
      saveCart();
      renderCart();
    });

    $('#checkoutBtn').addEventListener('click', openCheckout);
    $('#checkoutClose').addEventListener('click', closeCheckout);
    $('#checkout').addEventListener('click', (e) => { if (e.target.id === 'checkout') closeCheckout(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#checkout').hidden) closeCheckout();
      else closeCart();
    });

    $('#checkoutForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      handleForm(form, $('#coStatus'), 'order', () => ({
        items: cart.map((l) => ({ id: l.id, name: byId(l.id).name, qty: l.qty, install: l.install })),
        ...totals(),
        currency: 'EUR',
        lang,
      }), (data) => {
        const id = 'BA-' + Date.now().toString(36).toUpperCase().slice(-6);
        cart = [];
        saveCart();
        renderCart();
        form.reset();
        $('#coDoneText').innerHTML = t('co.doneText', { id: esc(id), email: esc(data.email) });
        form.hidden = true;
        $('#checkoutTitle').hidden = true;
        $('#checkoutDone').hidden = false;
      });
    });
    $('#coBack').addEventListener('click', closeCheckout);

    $('#contactForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const status = $('#contactStatus');
      handleForm(form, status, 'quote', () => ({ lang }), () => {
        form.reset();
        $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));
        status.textContent = t('form.ok');
        status.className = 'form-status ok';
      });
    });

    document.addEventListener('input', (e) => {
      if (e.target.classList && e.target.classList.contains('invalid') && e.target.checkValidity()) e.target.classList.remove('invalid');
    });
  }

  bind();
  applyI18n();
})();

import type { Spec, Template } from "./types.ts";

// Three fictional brands, one per template. Addresses use the reserved .example domain so nothing
// here can be mistaken for a real business. No testimonials, customer counts or awards.
export const EXAMPLES: Record<Template, Spec> = {
  studio: {
    schema_version: "1.0",
    template: "studio",
    brand: {
      name: "Fieldnote Studio",
      tagline: "Gardens planned around how you actually use them",
      summary:
        "A two-person garden design practice. We survey the light, soil and drainage first, then draw a planting plan you can build in stages, with or without us.",
      cta_label: "Book a survey",
      cta_href: "mailto:hello@fieldnote.example",
      contact: "hello@fieldnote.example",
      location: "Studio 4, Tannery Yard",
      hours: "Site visits Tuesday to Friday",
      note: "Booking surveys for spring planting now",
    },
    items: [
      { title: "Garden survey", text: "A half-day visit to measure light, soil and drainage, followed by a written summary within a week.", meta: "Half day" },
      { title: "Planting plan", text: "A scaled plan with a plant list, sourcing notes and a first-year care calendar.", meta: "2 to 3 weeks" },
      { title: "Build oversight", text: "We brief the landscaper you choose and check the work at each stage, so the plan survives the build.", meta: "Per project" },
    ],
    faqs: [
      { q: "Do you build the gardens yourselves?", a: "No. We design and oversee. We can recommend landscapers we have worked with, or brief one you already trust." },
      { q: "How far do you travel?", a: "Up to about an hour from the studio. Further visits are quoted separately before anything is booked." },
      { q: "What does a survey cost?", a: "A fixed fee, agreed before the visit. If you go on to commission a planting plan, the survey fee is taken off it." },
    ],
    palette: { mode: "light", canvas: "#FFF6E8", ink: "#29201B", accent: "#646548", support: "#E8D7BF" },
    type: { heading: "old-style", body: "humanist", base_px: 17, ratio: "1.333", heading_weight: 500, measure_ch: 64 },
    space: { base_px: 8, density: "airy" },
    components: { button: "outline", surface: "outlined", radius: "none", header: "inline" },
    motion: { preset: "gentle", speed_pct: 100, stagger_ms: 60 },
  },
  shopfront: {
    schema_version: "1.0",
    template: "shopfront",
    brand: {
      name: "Marrow Lane Bakehouse",
      tagline: "Slow-fermented bread, baked before the street wakes",
      summary:
        "A small bakery by the canal bridge. Loaves are shaped the evening before and baked from four in the morning, so the first batch is out when we open.",
      cta_label: "Order for collection",
      cta_href: "https://marrowlane.example/orders",
      contact: "orders@marrowlane.example",
      location: "14 Marrow Lane, by the canal bridge",
      hours: "Wednesday to Sunday, 7:30 to 15:00",
      note: "Closed Monday and Tuesday for baking classes",
    },
    items: [
      { title: "Rye sourdough", text: "Whole rye with caraway, fermented for 36 hours. A dense 900 g loaf that keeps for a week.", meta: "$7.50" },
      { title: "Country white", text: "Our everyday loaf: white and wholemeal flour, a crackling crust and an open crumb.", meta: "$6.00" },
      { title: "Seeded spelt", text: "Spelt, sunflower, pumpkin and linseed, baked in a tin for easy slicing.", meta: "$6.50" },
      { title: "Cardamom bun", text: "Laminated dough knotted with cardamom sugar, baked through the morning until sold out.", meta: "$3.75" },
      { title: "Almond cake", text: "Ground almonds, olive oil and orange, made without wheat flour.", meta: "$4.25 a slice" },
      { title: "Filter coffee", text: "Brewed in small batches through the day. Oat milk at no extra charge.", meta: "$3.00" },
    ],
    faqs: [
      { q: "Can I order large quantities?", a: "Yes, with 48 hours' notice for up to 20 loaves. Send the date and what you need, and we will confirm by email." },
      { q: "Is anything gluten free?", a: "Our kitchen uses wheat flour all day, so we cannot promise anything is free of gluten. The almond cake contains no wheat flour." },
      { q: "Do you deliver?", a: "Not yet. Orders are for collection from the shop during opening hours." },
    ],
    palette: { mode: "light", canvas: "#E8D7BF", ink: "#29201B", accent: "#5A171B", support: "#A6422A" },
    type: { heading: "transitional", body: "humanist", base_px: 18, ratio: "1.25", heading_weight: 700, measure_ch: 60 },
    space: { base_px: 8, density: "comfortable" },
    components: { button: "pill", surface: "raised", radius: "round", header: "centered" },
    motion: { preset: "crisp", speed_pct: 100, stagger_ms: 40 },
  },
  launch: {
    schema_version: "1.0",
    template: "launch",
    brand: {
      name: "Rotaleaf",
      tagline: "Shift rotas for small kitchens, planned in minutes",
      summary:
        "Rotaleaf lays out a week of shifts on one screen, totals everyone's hours as you go, and sends each person their shifts by text when you publish.",
      cta_label: "Join the beta",
      cta_href: "https://rotaleaf.example/beta",
      contact: "support@rotaleaf.example",
      location: "",
      hours: "",
      note: "Now in public beta for kitchens of up to 30 staff",
    },
    items: [
      { title: "One-screen week", text: "Drag shifts onto a week view and copy last week's pattern in one step.", meta: "Planner" },
      { title: "Swap requests", text: "Staff ask to swap from their phone. You approve or decline, and the rota updates for everyone.", meta: "Phones" },
      { title: "Hours as you plan", text: "Planned hours sit beside contracted hours for each person, so overtime shows before you publish.", meta: "Totals" },
      { title: "Text, not another app", text: "Published shifts go out by text message. Nobody needs to install anything to see their week.", meta: "Sharing" },
      { title: "Payroll export", text: "Download approved hours as a CSV with one row per person per shift.", meta: "Export" },
      { title: "Works offline", text: "Plan on a tablet in the back office with no signal. Changes sync when you reconnect.", meta: "Offline" },
    ],
    faqs: [
      { q: "What does it cost during the beta?", a: "Nothing. Before the beta ends we will publish pricing at least 30 days ahead of any charge, and you can export your rotas at any time." },
      { q: "Does it replace our payroll system?", a: "No. Rotaleaf plans shifts and totals hours. It exports a CSV that you can import into your payroll provider." },
      { q: "Do my staff need smartphones?", a: "No. Shifts and swap confirmations arrive by text message, which works on any phone." },
    ],
    palette: { mode: "dark", canvas: "#29201B", ink: "#FFF6E8", accent: "#A6422A", support: "#5A171B" },
    type: { heading: "geometric", body: "humanist", base_px: 17, ratio: "1.414", heading_weight: 700, measure_ch: 62 },
    space: { base_px: 8, density: "comfortable" },
    components: { button: "solid", surface: "flat", radius: "soft", header: "inline" },
    motion: { preset: "lively", speed_pct: 100, stagger_ms: 80 },
  },
};

export const DEFAULT_SPEC: Spec = EXAMPLES.studio;

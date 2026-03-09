// Pre-built ICP definitions for seeding

import type { ICPSegmentFilters, ScoringWeights, IntentSignals } from "./types";

export interface ICPPreset {
  name: string;
  slug: string;
  description: string;
  priority: number;
  filters: ICPSegmentFilters;
  scoring_weights: ScoringWeights;
  intent_signals: IntentSignals;
  relevant_services: string[];
  best_offer_angle: string;
  best_cta: string;
  typical_budget_range: string;
  avg_deal_size: number;
  sales_cycle_days: number;
  value_proposition: string;
  likely_objections: Array<{ objection: string; rebuttal: string }>;
  qualification_questions: string[];
  sub_segments: Array<{
    name: string;
    filters_override: Partial<ICPSegmentFilters> | null;
    priority: number;
    campaign_tag: string;
  }>;
}

// ─── ICP 1: Startup Founders ───

const startupFounders: ICPPreset = {
  name: "Startup Founders",
  slug: "startup-founders",
  description: "Early-stage startup founders and technical co-founders looking to build their first product or scale their MVP.",
  priority: 1,
  filters: {
    titles_include: ["founder", "co-founder", "ceo", "cto"],
    titles_exclude: ["intern", "student", "advisor", "board member", "volunteer"],
    industries_include: ["technology", "saas", "software", "fintech", "healthtech", "edtech", "marketplace", "ecommerce", "ai", "machine learning"],
    industries_exclude: [],
    employee_count_range: [1, 50],
    revenue_range: null,
    funding_stages: [],
    countries: [],
    states: [],
    cities: [],
    company_keywords: ["startup", "tech", "app", "platform", "digital"],
    domain_patterns: [],
  },
  scoring_weights: {
    fit_weight: 0.30,
    urgency_weight: 0.30,
    budget_weight: 0.15,
    signal_weight: 0.25,
  },
  intent_signals: {
    positive: [
      { signal: "Hiring signal", points: 25, source_column: "hiring_signal" },
      { signal: "Launch signal", points: 25, source_column: "launch_signal" },
      { signal: "AI/tech signal", points: 25, source_column: "ai_signal" },
      { signal: "Has website", points: 10, source_column: "website" },
      { signal: "Has LinkedIn", points: 5, source_column: "linkedin" },
    ],
    negative: [
      { signal: "No email", points: 100, source_column: "_no_email_check" },
    ],
  },
  relevant_services: ["MVP build", "Website build", "Mobile app build"],
  best_offer_angle: "Speed-to-market: Get your MVP live in weeks, not months. We handle the technical build so you can focus on customers and fundraising.",
  best_cta: "Book a free 15-min MVP strategy call",
  typical_budget_range: "$5K-$30K",
  avg_deal_size: 12000,
  sales_cycle_days: 14,
  value_proposition: "We build production-ready MVPs for startups in 4-8 weeks. Our founders have shipped 200+ products. You focus on customers, we handle the code.",
  likely_objections: [
    { objection: "We're building in-house", rebuttal: "That's great — most of our clients started there too. We often help fill gaps: a mobile app while your team focuses on backend, or a landing page sprint while you build core features. Worth exploring?" },
    { objection: "Too expensive right now", rebuttal: "Totally understand the cash constraints. We offer milestone-based pricing so you only pay as features ship. Many founders find it cheaper than a full-time hire when you factor in speed." },
    { objection: "We need to raise first", rebuttal: "Actually, having a working MVP dramatically increases your chances of closing a round. We've helped 50+ founders go from idea to demo that investors can click through." },
  ],
  qualification_questions: [
    "What stage is your product at right now? (Idea, wireframes, prototype, live)",
    "What's your timeline to launch or next milestone?",
    "Are you currently fundraising or bootstrapping?",
    "What's the core problem your product solves?",
  ],
  sub_segments: [
    { name: "SaaS Founders", filters_override: { industries_include: ["saas", "software", "b2b"] }, priority: 1, campaign_tag: "startup-saas" },
    { name: "Marketplace Founders", filters_override: { industries_include: ["marketplace", "ecommerce", "platform"] }, priority: 2, campaign_tag: "startup-marketplace" },
    { name: "AI Founders", filters_override: { industries_include: ["ai", "machine learning", "artificial intelligence", "deep learning"] }, priority: 3, campaign_tag: "startup-ai" },
    { name: "D2C Tech Founders", filters_override: { industries_include: ["ecommerce", "d2c", "consumer", "retail tech"] }, priority: 4, campaign_tag: "startup-d2c" },
  ],
};

// ─── ICP 2: Funded Startups ───

const fundedStartups: ICPPreset = {
  name: "Funded Startups",
  slug: "funded-startups",
  description: "Venture-backed startups with recent funding looking to scale their product, build mobile apps, or add AI capabilities.",
  priority: 2,
  filters: {
    titles_include: ["founder", "cto", "cpo", "vp engineering", "head of product", "growth lead", "ceo", "co-founder", "head of engineering"],
    titles_exclude: ["intern", "student", "advisor"],
    industries_include: ["technology", "saas", "software", "fintech", "healthtech", "ai"],
    industries_exclude: [],
    employee_count_range: [10, 500],
    revenue_range: null,
    funding_stages: ["seed", "series_a", "series_b"],
    countries: [],
    states: [],
    cities: [],
    company_keywords: [],
    domain_patterns: [],
  },
  scoring_weights: {
    fit_weight: 0.25,
    urgency_weight: 0.25,
    budget_weight: 0.25,
    signal_weight: 0.25,
  },
  intent_signals: {
    positive: [
      { signal: "Recent funding", points: 35, source_column: "funding_stage" },
      { signal: "Hiring engineers", points: 25, source_column: "hiring_signal" },
      { signal: "No mobile app", points: 20, source_column: "mobile_app_exists" },
      { signal: "AI signal", points: 20, source_column: "ai_signal" },
      { signal: "Growth signal", points: 15, source_column: "growth_signal" },
    ],
    negative: [],
  },
  relevant_services: ["Mobile app build", "MVP build", "AI clone", "Automation systems"],
  best_offer_angle: "Scale faster with a dedicated build team. We plug into your stack and ship features your users are asking for — mobile apps, AI features, internal tools.",
  best_cta: "See how we helped [similar company] ship 3x faster",
  typical_budget_range: "$10K-$100K+",
  avg_deal_size: 35000,
  sales_cycle_days: 30,
  value_proposition: "Funded startups need to move fast. We provide senior engineering teams that integrate with your workflow and ship production features in sprints, not quarters.",
  likely_objections: [
    { objection: "We have an engineering team", rebuttal: "Exactly — we augment, not replace. Most funded startups we work with use us for parallel workstreams: mobile app while your team ships backend, or AI features while they focus on core product." },
    { objection: "Agencies don't understand our product", rebuttal: "Fair concern. We assign a technical lead who does a deep-dive into your architecture. Our team has built for YC, Techstars, and Series B companies. We speak your language." },
    { objection: "We're focused on hiring right now", rebuttal: "Hiring takes 3-6 months. We can ship features now while you build your team, then hand off cleanly. Many clients keep us for overflow work even after hiring." },
  ],
  qualification_questions: [
    "What's your current funding stage and runway?",
    "What's the biggest product gap you need to fill in the next quarter?",
    "Do you have a mobile app? Is that on the roadmap?",
    "How large is your current engineering team?",
  ],
  sub_segments: [
    { name: "Seed Stage", filters_override: { funding_stages: ["seed"] }, priority: 1, campaign_tag: "funded-seed" },
    { name: "Series A", filters_override: { funding_stages: ["series_a"] }, priority: 2, campaign_tag: "funded-series-a" },
    { name: "Series B+", filters_override: { funding_stages: ["series_b", "series_c", "series_d"] }, priority: 3, campaign_tag: "funded-series-b-plus" },
    { name: "Needs Mobile", filters_override: null, priority: 4, campaign_tag: "funded-needs-mobile" },
    { name: "Needs AI", filters_override: { industries_include: ["ai", "machine learning"] }, priority: 5, campaign_tag: "funded-needs-ai" },
  ],
};

// ─── ICP 3: Content Creators & Influencers ───

const contentCreators: ICPPreset = {
  name: "Content Creators & Influencers",
  slug: "content-creators",
  description: "High-follower content creators, YouTubers, coaches, and educators looking for AI clones, content automation, and monetization tools.",
  priority: 3,
  filters: {
    titles_include: ["creator", "influencer", "coach", "educator", "youtuber", "podcaster", "founder", "content", "author", "speaker"],
    titles_exclude: ["intern", "student", "junior"],
    industries_include: ["media", "education", "coaching", "content", "entertainment", "digital media", "creator economy"],
    industries_exclude: [],
    employee_count_range: null,
    revenue_range: null,
    funding_stages: [],
    countries: [],
    states: [],
    cities: [],
    company_keywords: ["creator", "media", "content", "podcast", "youtube", "course", "coaching"],
    domain_patterns: [],
  },
  scoring_weights: {
    fit_weight: 0.25,
    urgency_weight: 0.20,
    budget_weight: 0.25,
    signal_weight: 0.30,
  },
  intent_signals: {
    positive: [
      { signal: "High posting frequency", points: 25, source_column: "posting_frequency" },
      { signal: "Multi-platform presence", points: 20, source_column: "twitter_url" },
      { signal: "Monetization active", points: 30, source_column: "monetization_signal" },
      { signal: "Course/info product", points: 25, source_column: "has_course" },
      { signal: "Team growth", points: 15, source_column: "hiring_signal" },
      { signal: "Has YouTube", points: 20, source_column: "youtube_url" },
      { signal: "Has website", points: 10, source_column: "website" },
    ],
    negative: [
      { signal: "Very low followers", points: 30, source_column: "_low_follower_check" },
    ],
  },
  relevant_services: ["AI clone", "Voice clone", "Content automation", "Clip finding", "Website build"],
  best_offer_angle: "Clone yourself with AI. Let your AI handle DMs, create content, and engage your audience 24/7 while you focus on creating.",
  best_cta: "See a demo of your AI clone in 5 minutes",
  typical_budget_range: "$2K-$20K+",
  avg_deal_size: 8000,
  sales_cycle_days: 7,
  value_proposition: "Creators are stretched thin. Our AI clones learn your voice, style, and expertise — then handle community engagement, content repurposing, and audience Q&A at scale.",
  likely_objections: [
    { objection: "My audience will know it's AI", rebuttal: "Our clones are trained on YOUR content — they sound like you, not a generic bot. Most creators use them for first-response and FAQs, then personally handle deeper conversations." },
    { objection: "I don't have budget for this", rebuttal: "Most creators recoup the cost in the first month through saved time alone. If you're spending 2+ hours/day on DMs and comments, this pays for itself." },
    { objection: "I need to see it work first", rebuttal: "Absolutely — we'll build a demo clone using your public content in 48 hours, free. You can test it before committing to anything." },
  ],
  qualification_questions: [
    "What platforms are you most active on?",
    "How much time do you spend on community engagement daily?",
    "Do you sell courses, coaching, or info products?",
    "What's your current follower count across platforms?",
  ],
  sub_segments: [
    { name: "Educators & Coaches", filters_override: { titles_include: ["coach", "educator", "teacher", "trainer", "mentor"] }, priority: 1, campaign_tag: "creator-educator" },
    { name: "Finance Creators", filters_override: { industries_include: ["finance", "investing", "trading", "crypto", "fintech"] }, priority: 2, campaign_tag: "creator-finance" },
    { name: "Founder-Creators", filters_override: { titles_include: ["founder", "ceo", "entrepreneur"] }, priority: 3, campaign_tag: "creator-founder" },
    { name: "YouTubers 100K+", filters_override: null, priority: 4, campaign_tag: "creator-youtube-100k" },
  ],
};

// ─── ICP 4: Agencies ───

const agencies: ICPPreset = {
  name: "Agencies",
  slug: "agencies",
  description: "Marketing, web, and creative agencies looking for white-label development, automation, and overflow capacity.",
  priority: 4,
  filters: {
    titles_include: ["founder", "ceo", "managing director", "partner", "head of", "director", "owner", "president"],
    titles_exclude: ["intern", "student", "junior"],
    industries_include: ["agency", "marketing", "creative", "digital", "advertising", "web development", "design", "media", "consulting"],
    industries_exclude: [],
    employee_count_range: [5, 200],
    revenue_range: null,
    funding_stages: [],
    countries: [],
    states: [],
    cities: [],
    company_keywords: ["agency", "marketing", "creative", "digital", "consulting", "studio"],
    domain_patterns: [],
  },
  scoring_weights: {
    fit_weight: 0.30,
    urgency_weight: 0.20,
    budget_weight: 0.20,
    signal_weight: 0.30,
  },
  intent_signals: {
    positive: [
      { signal: "Hiring signal", points: 20, source_column: "hiring_signal" },
      { signal: "Recent growth", points: 20, source_column: "growth_signal" },
      { signal: "Tech stack gaps", points: 25, source_column: "tech_stack_gaps" },
      { signal: "Overflow indicators", points: 25, source_column: "overflow_signal" },
      { signal: "Has website", points: 10, source_column: "website" },
      { signal: "Multiple services", points: 15, source_column: "services_offered" },
    ],
    negative: [],
  },
  relevant_services: ["White-label MVP/web/app build", "Automation support", "AI integration"],
  best_offer_angle: "White-label development partner for agencies. We build under your brand, you keep the client relationship and margins.",
  best_cta: "Let's discuss a white-label partnership",
  typical_budget_range: "$3K-$15K/mo retainer",
  avg_deal_size: 5000,
  sales_cycle_days: 21,
  value_proposition: "Agencies need reliable dev partners. We white-label MVPs, web apps, and mobile apps under your brand. No overhead, no hiring risk, predictable pricing.",
  likely_objections: [
    { objection: "We have our own developers", rebuttal: "Perfect — we handle the overflow. When you land a big project or your team is at capacity, we plug in seamlessly. Most agency partners use us for 2-3 projects/quarter." },
    { objection: "Quality concerns with outsourcing", rebuttal: "Understandable. We offer a trial project at reduced rate so you can evaluate our work quality. Our agency partners have a 94% retention rate." },
    { objection: "Our clients want in-house teams", rebuttal: "They don't need to know. Everything is white-labeled — your brand, your Slack, your project management. We're invisible to your clients." },
  ],
  qualification_questions: [
    "What types of projects do you typically take on?",
    "How do you currently handle development work?",
    "How many active client projects do you run simultaneously?",
    "What's your typical project budget range?",
  ],
  sub_segments: [
    { name: "Marketing Agencies", filters_override: { industries_include: ["marketing", "advertising", "performance marketing"] }, priority: 1, campaign_tag: "agency-marketing" },
    { name: "Web/Dev Agencies", filters_override: { industries_include: ["web development", "software development", "design"] }, priority: 2, campaign_tag: "agency-webdev" },
    { name: "No-Code Agencies", filters_override: { company_keywords: ["no-code", "nocode", "low-code", "bubble", "webflow"] }, priority: 3, campaign_tag: "agency-nocode" },
    { name: "Content Agencies", filters_override: { industries_include: ["content", "media", "publishing", "social media"] }, priority: 4, campaign_tag: "agency-content" },
    { name: "AI Agencies", filters_override: { industries_include: ["ai", "machine learning", "automation"] }, priority: 5, campaign_tag: "agency-ai" },
  ],
};

export const ICP_PRESETS: ICPPreset[] = [
  startupFounders,
  fundedStartups,
  contentCreators,
  agencies,
];

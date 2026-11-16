export const CATEGORIES = [
  'Groceries', 'Eating out', 'Transport', 'Shopping', 'Bills & utilities', 'Housing',
  'Subscriptions', 'Entertainment', 'Health & fitness', 'Travel', 'Cash', 'Income',
  'Transfers', 'Savings & investments', 'Other',
] as const

/** Money moved between your own accounts: not spending, not income. */
export const NON_SPEND = new Set(['Transfers', 'Savings & investments'])

const RULES: [string, RegExp][] = [
  ['Income', /salary|payroll|wages|hmrc|dividend|interest paid|pension/i],
  ['Savings & investments', /vanguard|trading ?212|freetrade|hargreaves|aj bell|moneybox|nutmeg|isa\b/i],
  ['Transfers', /transfer|pot\b|round ?up|to savings|from savings|saver/i],
  ['Housing', /\brent\b|mortgage|council tax|letting|landlord|ground rent/i],
  ['Bills & utilities', /octopus|british gas|edf|e\.?on|ovo|bulb|scottish power|thames water|severn trent|water|\bbt\b|virgin media|sky\b|talktalk|vodafone|\bee\b|o2\b|three\b|giffgaff|tv licen|insurance|aviva|admiral|direct line/i],
  ['Subscriptions', /netflix|spotify|disney|prime|apple\.com|icloud|google (one|storage)|youtube|audible|now tv|paramount|chatgpt|openai|anthropic|claude|github|adobe|microsoft|xbox|playstation|nintendo|patreon|duolingo/i],
  ['Groceries', /tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-?op|iceland|m&s food|ocado|spar\b/i],
  ['Eating out', /pret|greggs|mcdonald|kfc|nando|deliveroo|uber ?eats|just ?eat|costa|starbucks|caffe nero|wagamama|pizza|burger|restaurant|cafe|coffee|pub\b|bar\b|subway|five guys|leon\b/i],
  ['Transport', /tfl|transport for london|trainline|national rail|lner|gwr|uber|bolt|bus\b|shell|bp\b|esso|texaco|petrol|parking|dvla|ringgo/i],
  ['Health & fitness', /gym|puregym|the gym|fitness|boots|superdrug|pharmacy|dentist|optician|nhs/i],
  ['Entertainment', /cinema|odeon|vue\b|cineworld|steam|ticketmaster|theatre|museum|bowling|riot games/i],
  ['Travel', /airbnb|booking\.com|hotel|ryanair|easyjet|british airways|jet2|eurostar|expedia/i],
  ['Cash', /\batm\b|cash withdrawal|cashpoint/i],
  ['Shopping', /amazon|ebay|argos|ikea|currys|john lewis|asos|zara|h&m|uniqlo|primark|next\b|tk maxx|etsy|vinted|b&q|screwfix/i],
]

export function categorise(description: string, amount: number): string {
  for (const [cat, re] of RULES) {
    if (cat === 'Income' && amount < 0) continue
    if (re.test(description)) return cat
  }
  return amount > 0 ? 'Income' : 'Other'
}

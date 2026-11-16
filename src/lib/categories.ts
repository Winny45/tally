import type { Tables, Txn } from './types'
import { daysBetween } from './util'

export const CATEGORIES = [
  'Groceries', 'Eating out', 'Nights out', 'Transport', 'Shopping', 'Bills & utilities', 'Housing',
  'Subscriptions', 'Entertainment', 'Health & fitness', 'Travel', 'People', 'Cash', 'Income',
  'Transfers', 'Savings & investments', 'Other',
] as const

/** Icon and hue for each category; the hue tints the icon chip. */
export const CATEGORY_META: Record<string, { icon: string; hue: number }> = {
  Groceries: { icon: '🛒', hue: 140 }, 'Eating out': { icon: '🍜', hue: 25 }, 'Nights out': { icon: '🍻', hue: 45 },
  Transport: { icon: '🚇', hue: 215 }, Shopping: { icon: '🛍️', hue: 325 }, 'Bills & utilities': { icon: '💡', hue: 55 },
  Housing: { icon: '🏠', hue: 265 }, Subscriptions: { icon: '🔁', hue: 245 }, Entertainment: { icon: '🎮', hue: 285 },
  'Health & fitness': { icon: '🎾', hue: 165 }, Travel: { icon: '✈️', hue: 195 }, People: { icon: '🤝', hue: 10 },
  Cash: { icon: '💷', hue: 110 }, Income: { icon: '💰', hue: 150 }, Transfers: { icon: '🔄', hue: 220 },
  'Savings & investments': { icon: '📈', hue: 175 }, Other: { icon: '🧾', hue: 40 },
}
export const metaFor = (category: string) => CATEGORY_META[category] ?? CATEGORY_META.Other

/** Money moved between your own accounts: not spending, not income. */
export const NON_SPEND = new Set(['Transfers', 'Savings & investments'])

// ---- 1. Known brands: pattern, friendly name, category ----
const B = (re: RegExp, name: string, category: string) => ({ re, name, category })
const BRANDS = [
  // moving money between your own accounts
  B(/NWESTPLAT|^ ?ACC-/, 'Credit card payment', 'Transfers'), B(/PAYMENT RECEIVED - THANK YOU|MANUALLY APPLIED PMT/, 'Card repayment received', 'Transfers'),
  // groceries
  B(/TESCO/, 'Tesco', 'Groceries'), B(/SAINSBURY/, "Sainsbury's", 'Groceries'), B(/\bASDA\b/, 'Asda', 'Groceries'),
  B(/\bALDI\b/, 'Aldi', 'Groceries'), B(/\bLIDL\b/, 'Lidl', 'Groceries'), B(/MORRISONS/, 'Morrisons', 'Groceries'),
  B(/WAITROSE/, 'Waitrose', 'Groceries'), B(/CO-?OP\b|COOPERATIVE/, 'Co-op', 'Groceries'), B(/ICELAND/, 'Iceland', 'Groceries'),
  B(/M&S|MARKS ?& ?SPENCER|MARKS AND SPENCER/, 'M&S', 'Groceries'), B(/OCADO/, 'Ocado', 'Groceries'), B(/\bSPAR\b/, 'Spar', 'Groceries'),
  B(/\b7-?ELEVEN|^-ELEVEN/, '7-Eleven', 'Groceries'), B(/HEMKOP|\bICA\b|\bWILLYS\b|SUPERMERCADO|SUPERMARKET|CARREFOUR|MERCADONA/, '', 'Groceries'),
  B(/EROSKI|\bSUPER [A-Z]+|NISA|LONDIS|COSTCUTTER|PREMIER STORES|NEWSAGENT|OFF LICEN[CS]E|BUDGENS|FARMFOODS|HEYBURG/, '', 'Groceries'),
  // eating out
  B(/PRET A MANGER|\bPRET\b/, 'Pret', 'Eating out'), B(/GREGGS/, 'Greggs', 'Eating out'), B(/MCDONALD/, "McDonald's", 'Eating out'),
  B(/\bKFC\b/, 'KFC', 'Eating out'), B(/NANDO/, "Nando's", 'Eating out'), B(/DELIVEROO/, 'Deliveroo', 'Eating out'),
  B(/UBER ?\*? ?EATS/, 'Uber Eats', 'Eating out'), B(/JUST ?EAT/, 'Just Eat', 'Eating out'), B(/COSTA/, 'Costa', 'Eating out'),
  B(/STARBUCKS/, 'Starbucks', 'Eating out'), B(/CAFFE NERO|\bNERO\b/, 'Caffè Nero', 'Eating out'), B(/WAGAMAMA/, 'Wagamama', 'Eating out'),
  B(/BURGER KING/, 'Burger King', 'Eating out'), B(/FIVE GUYS/, 'Five Guys', 'Eating out'), B(/SUBWAY/, 'Subway', 'Eating out'),
  B(/DOMINO/, "Domino's", 'Eating out'), B(/PIZZA ?HUT/, 'Pizza Hut', 'Eating out'), B(/PIZZA ?EXPRESS/, 'PizzaExpress', 'Eating out'),
  B(/\bLEON\b/, 'Leon', 'Eating out'), B(/\bITSU\b/, 'Itsu', 'Eating out'), B(/WASABI/, 'Wasabi', 'Eating out'), B(/TORTILLA/, 'Tortilla', 'Eating out'),
  B(/TABLE TABLE|TOBY CARVERY|HARVESTER|BEEFEATER|FRANKIE ?& ?BENNY|ZIZZI|\bASK ITALIAN|BELLA ITALIA|YO! ?SUSHI|DISHOOM|HONEST BURGER|GOURMET BURGER|TACO BELL|POPEYES|CLUCKD|PEPES|HMSHOST|TASTEBUDS|TERRAZA|RESTAURANTE|CERVECERIA|BODEGA|TAVERNA|TRATTORIA|OSTERIA|GERMAN DONER|WINGSTOP|KRISPY KREME|DUNKIN/, '', 'Eating out'),
  // nights out
  B(/WETHERSPOON/, 'Wetherspoons', 'Nights out'), B(/GREENE KING|SLUG ?& ?LETTUCE|ALL BAR ONE|REVOLUTION BAR|BREWDOG|O'?NEILL'?S|WALKABOUT|POPWORLD|PRYZM|NIGHTCLUB/, '', 'Nights out'),
  // transport
  B(/TFL|TRANSPORT FOR LONDON|OYSTER/, 'TfL', 'Transport'), B(/TRAINLINE/, 'Trainline', 'Transport'), B(/TRAINPAL/, 'TrainPal', 'Transport'),
  B(/RAILCARD/, 'Railcard', 'Transport'), B(/NATIONAL EXPRESS/, 'National Express', 'Transport'), B(/MEGABUS/, 'Megabus', 'Transport'),
  B(/\bUBER\b/, 'Uber', 'Transport'), B(/\bBOLT\b/, 'Bolt', 'Transport'), B(/FREE ?NOW|ADDISON LEE/, '', 'Transport'),
  B(/GREATER ANGLIA|\bLNER\b|\bGWR\b|AVANTI|SOUTHEASTERN|SOUTHERN RAIL|THAMESLINK|NORTHERN RAIL|SCOTRAIL|CROSSCOUNTRY|C2C|CHILTERN|EMR\b|RAILWAY|NATIONAL RAIL/, '', 'Transport'),
  B(/FIRST BUS|STAGECOACH|ARRIVA|GO-?AHEAD|KONECTBUS|\bBUS\b|VASTTRAFIK|FLYGBUSS|\bSL\b AB|RYDE |\bLIME\b|\bVOI\b|TIER MOBILITY|SANTANDER CYCLES/, '', 'Transport'),
  B(/\bSHELL\b|\bBP\b|\bESSO\b|TEXACO|\bJET\b|S\/STN|SERVICE STATION|PETROL|FUEL|RINGGO|PAYBYPHONE|JUSTPARK|\bNCP\b|PARKING|\bDVLA\b|\bMOT\b|HALFORDS|KWIK FIT/, '', 'Transport'),
  // shopping
  B(/AMAZON|AMZN/, 'Amazon', 'Shopping'), B(/\bEBAY\b/, 'eBay', 'Shopping'), B(/ARGOS/, 'Argos', 'Shopping'), B(/\bIKEA\b/, 'IKEA', 'Shopping'),
  B(/CURRYS/, 'Currys', 'Shopping'), B(/JOHN LEWIS/, 'John Lewis', 'Shopping'), B(/\bASOS\b/, 'ASOS', 'Shopping'), B(/\bZARA\b/, 'Zara', 'Shopping'),
  B(/\bH ?& ?M\b/, 'H&M', 'Shopping'), B(/UNIQLO/, 'Uniqlo', 'Shopping'), B(/PRIMARK/, 'Primark', 'Shopping'), B(/TK ?MAXX/, 'TK Maxx', 'Shopping'),
  B(/HOME BARGAINS/, 'Home Bargains', 'Shopping'), B(/B ?& ?M\b|POUNDLAND|WILKO|THE RANGE|DUNELM|B ?& ?Q\b|SCREWFIX|WICKES|HOMEBASE/, '', 'Shopping'),
  B(/\bNEXT\b|RIVER ISLAND|NEW LOOK|JD SPORTS|SPORTS ?DIRECT|DECATHLON|FOOT ?LOCKER|\bNIKE\b|ADIDAS|SHEIN|TEMU|ALIEXPRESS|ETSY|VINTED|DEPOP|WHSMITH|WATERSTONES|\bSMYTHS|APPLE STORE|SAMSUNG|\bLOCKER\b/, '', 'Shopping'),
  // bills
  B(/\bH3G\b/, 'Three', 'Bills & utilities'), B(/OCTOPUS ENERGY/, 'Octopus Energy', 'Bills & utilities'), B(/BRITISH GAS/, 'British Gas', 'Bills & utilities'),
  B(/\bEDF\b|E\.?ON\b|\bOVO\b|SCOTTISH ?POWER|\bSSE\b|SHELL ENERGY|BULB|UTILITA|WATER\b|ANGLIAN|SEVERN TRENT|THAMES WATER/, '', 'Bills & utilities'),
  B(/\bH3G\b|\bBT\b|VIRGIN MEDIA|\bSKY\b|TALKTALK|VODAFONE|\bEE\b|\bO2\b|THREE\b|GIFFGAFF|VOXI|TESCO MOBILE|\bID MOBILE|LEBARA|SMARTY|HYPEROPTIC|COMMUNITY FIBRE|WIFI|BROADBAND|TV LICEN/, '', 'Bills & utilities'),
  B(/INSURANCE|AVIVA|ADMIRAL|DIRECT LINE|\bAXA\b|\bLV=|HASTINGS DIRECT|STUDENT LOAN|\bSLC\b|HMRC/, '', 'Bills & utilities'),
  // housing
  B(/COUNCIL|GOODLORD|OPENRENT|LETTING|LANDLORD|\bRENT\b|MORTGAGE|GROUND RENT|ESTATE AGENT/, '', 'Housing'),
  // subscriptions
  B(/NETFLIX/, 'Netflix', 'Subscriptions'), B(/SPOTIFY/, 'Spotify', 'Subscriptions'), B(/DISNEY ?\+|DISNEY PLUS/, 'Disney+', 'Subscriptions'),
  B(/PRIME VIDEO|AMAZON PRIME|AMZNPRIME/, 'Amazon Prime', 'Subscriptions'), B(/APPLE\.COM|ITUNES|ICLOUD/, 'Apple', 'Subscriptions'),
  B(/YOUTUBE/, 'YouTube', 'Subscriptions'), B(/GOOGLE (ONE|STORAGE)/, 'Google One', 'Subscriptions'), B(/OPENAI|CHATGPT/, 'ChatGPT', 'Subscriptions'),
  B(/ANTHROPIC|CLAUDE\.AI/, 'Claude', 'Subscriptions'), B(/AUDIBLE|NOW ?TV|PARAMOUNT|CRUNCHYROLL|GITHUB|ADOBE|MICROSOFT|\bMSFT\b|DROPBOX|NOTION|PATREON|DUOLINGO|LINKEDIN|TWITCH|DISCORD|NORDVPN|EXPRESSVPN|1PASSWORD|\bOOC AI\b|CURSOR/, '', 'Subscriptions'),
  // entertainment
  B(/GOOGLE ?PLAY|GOOGLE \*|GOOGLE G /, 'Google Play', 'Entertainment'), B(/STEAM|PLAYSTATION|XBOX|NINTENDO|EPIC GAMES|RIOT ?GAMES|BLIZZARD|ENEBA|\bCDKEYS|\bG2A\b|HUMBLE ?BUNDLE/, '', 'Entertainment'),
  B(/CINEMA|ODEON|\bVUE\b|CINEWORLD|PICTUREHOUSE|EVERYMAN|TICKETMASTER|TICKET|EVENTBRITE|\bDICE\b|SKIDDLE|FATSOMA|THEATRE|MUSEUM|MUSEO|PALACIO|CATEDRAL|BOWLING|ARCADE|ESCAPE ROOM|\bZOO\b/, '', 'Entertainment'),
  // health & fitness
  B(/PUREGYM/, 'PureGym', 'Health & fitness'), B(/THE GYM|GYM\b|FITNESS|SPORTS CENTRE|LEISURE|TENNIS|PADEL|\bGOLF\b|KORFBALL|FOOTBALL|FOOTY|CLIMBING|URBAN JUNGLE|PLAYTOMIC|SWIM|YOGA|MYPROTEIN|BULK POWDERS|HOLLAND ?& ?BARRETT/, '', 'Health & fitness'),
  B(/BOOTS\b|SUPERDRUG|PHARMACY|CHEMIST|DENTAL|DENTIST|OPTICIAN|SPECSAVERS|VISION EXPRESS|\bNHS\b|BARBER|HAIR|SALON/, '', 'Health & fitness'),
  // travel
  B(/AIRBNB/, 'Airbnb', 'Travel'), B(/BOOKING\.COM/, 'Booking.com', 'Travel'), B(/RYANAIR/, 'Ryanair', 'Travel'), B(/EASYJET/, 'easyJet', 'Travel'),
  B(/BRITISH AIRWAYS|\bBA\.COM|JET2|WIZZ|\bKLM\b|LUFTHANSA|NORWEGIAN AIR|\bSAS\b|EUROSTAR|EXPEDIA|SKYSCANNER|HOSTEL|HOTEL|TRAVELODGE|PREMIER INN|\bIBIS\b|HILTON|MARRIOTT|AIRPORT|STANSTED|GATWICK|HEATHROW|\bTIB\b|DUTY FREE/, '', 'Travel'),
  // savings & cash
  B(/VANGUARD/, 'Vanguard', 'Savings & investments'), B(/TRADING ?212|FREETRADE|HARGREAVES|AJ BELL|MONEYBOX|NUTMEG|\bISA\b|PLUM\b|CHIP\b|COINBASE|BINANCE|KRAKEN/, '', 'Savings & investments'),
  B(/\bATM\b|CASH WITHDRAWAL|CASHPOINT|CASH MACHINE|LINK ATM|NOTEMACHINE|CARDTRONICS/, 'Cash withdrawal', 'Cash'),
]

// ---- 2. Words that give a place away even when the name is unknown ----
const HINTS: [RegExp, string][] = [
  [/\b(ARMS|INN|TAVERN|PUB|ALEHOUSE|TAPHOUSE|TAP ROOM|BREWERY|BREWHOUSE|BRYGGHUS|WERDSHUS|\bBAR\b|COCKTAIL|\bCLUB\b|LOUNGE|KING'?S HEAD|QUEEN'?S HEAD|(BLACK|WHITE|RED|GOLDEN) (HORSE|LION|HART|SWAN|BULL)|CROWN|ANCHOR|PLOUGH|FLINTKNAPPERS|MERCHANTS HOUS|\w+ HEAD$|WOOLPACK|GARDEN HOUSE|GLASS HOUSE|ANGLER|WINDMILL|REPUBLIK|BONGO)\b/, 'Nights out'],
  [/\b(RESTAURANT|KITCHEN|CAFE|CAFFE|COFFEE|BAKERY|BISTRO|DINER|GRILL|PIZZA|PIZZERIA|BURGER|CHICKEN|KEBAB|SUSHI|RAMEN|NOODLE|CURRY|TANDOORI|CHIPS|FISH BAR|TAKEAWAY|PANCAKE|WAFFLE|DELI|SANDWICH|BAGEL|STREET FOOD|FOOD|EATERY|BBQ|THAI|WOK|TAPAS|BRUNCH|LUNCH|DINNER|PEPES)\b/, 'Eating out'],
  [/\b(TAXI|CABS?|TRAIN|RAIL|TRAM|METRO|FERRY|COACH|TOLL)\b/, 'Transport'],
  [/\b(FLIGHT|HOLIDAY|TRIP|BNB)\b/, 'Travel'],
  [/\b(BILLS?|ELECTRIC|ENERGY|\bGAS\b)\b/, 'Bills & utilities'],
  [/\b(DEPOSIT|TENANCY)\b/, 'Housing'],
  [/\b(GIG|CONCERT|FESTIVAL|TICKETS?|BOOKINGS)\b/, 'Entertainment'],
  [/\b(SHOP|STORE|KIOSK|MARKET|BARGAINS|OUTLET|BOUTIQUE)\b/, 'Shopping'],
]

const TRANSFER = /PAYMENT RECEIVED - THANK YOU|^ACC-|NWESTPLAT|CREDIT CARD|CARD PAYMENT - THANK|MANUALLY APPLIED PMT|\bPOT\b|ROUND ?UP|INTERNAL TRANSFER|OWN ACCOUNT|TO SAVINGS|FROM SAVINGS|\bSAVER\b|MONZO-/
const PERSON_PAYMENT = /VIA (MOBILE|ONLINE)|\bFP\b|FASTER PAYMENT|\bSTO\b|STANDING ORDER|\bBGC\b|BANK GIRO|\bTFR\b|REPAYMENT/
const PAY = /SALARY|PAYROLL|WAGES|\bPAYE\b|PENSION|DIVIDEND|INTEREST|UNIVERSAL CREDIT|\bDWP\b|TAX REFUND|STUDENT FINANCE|\bSFE\b|BURSARY|STIPEND/
const BANKS = ['MONZO', 'CHASE', 'NATWEST', 'STARLING', 'REVOLUT', 'BARCLAYS', 'HSBC', 'LLOYDS', 'SANTANDER', 'NATIONWIDE', 'HALIFAX', 'FIRST DIRECT', 'WISE']
const CITIES = 'LONDON|NORWICH|MANCHESTER|BIRMINGHAM|SHEFFIELD|LEEDS|LIVERPOOL|BRISTOL|CAMBRIDGE|OXFORD|NOTTINGHAM|LEICESTER|NEWCASTLE|GLASGOW|EDINBURGH|CARDIFF|BRIGHTON|WATFORD|MILTON KEYNES|READING|COVENTRY|YORK|BATH|IPSWICH|PETERBOROUGH|SOUTHAMPTON|PORTSMOUTH|BELFAST|DUBLIN|STANSTED|BECKENHAM|BRANDON'
const COUNTRY = '(?:GBR|GB|ENG|USA|US|USD|EUR|SEK|SWE|SE|ESP|ES|IRL|IE|LTU|LT|SG|SGP|NLD|NL|DEU|DE|FRA|FR|ITA|IT|BGR|BG|LUX|NA|LND)'

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_m, a, b) => a + b.toUpperCase()).replace(/'S\b/g, "'s")
const cleaned = new Map<string, string>()

/** Turns a raw bank descriptor ("1126 11NOV26 TFL OYSTER AUTO TOPUP 0343 222 1234 GB") into a readable name ("TfL"). */
export function merchantName(raw: string): string {
  const hit = cleaned.get(raw)
  if (hit) return hit
  let s = ` ${raw.toUpperCase()} `
  const brand = BRANDS.find(b => b.name && b.re.test(s))
  if (brand) { cleaned.set(raw, brand.name); return brand.name }
  s = s
    .replace(/^\s*\d{4}\s+\d{2}[A-Z]{3}\d{2}\s+/, ' ') // card date prefix
    .replace(/\sTPP\b.*$/, ' ').replace(/\sVIA (MOBILE|ONLINE)\b.*$/, ' ').replace(/\sFP \d\d\/\d\d\/\d\d.*$/, ' ').replace(/\s(FP|BGC|STO|TFR|DD)\s*[/ ].*$/, ' ')
    .replace(/\b(PAYPAL|SQ|SUMUP|ZETTLE|IZ|GOOGLE PAY|APPLE PAY)\s?\*\s?/g, ' ')
    .replace(/\*\s?[A-Z0-9]{5,}/g, ' ').replace(/\b0\d{3}\s?\d{3}\s?\d{4}\b/g, ' ')
    .replace(/\s\d{4}\s*$/, ' ') // card last four
  for (let i = 0; i < 4; i++) s = s.replace(new RegExp(`\\s(${COUNTRY}|${CITIES})\\s*$`), ' ').replace(/\s[\d.]+\s*$/, ' ')
  s = s.replace(/\b\d{3,}\b/g, ' ').replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim()
  const out = s.length >= 2 ? titleCase(s) : titleCase(raw.trim()) || 'Unknown'
  cleaned.set(raw, out)
  return out
}
export const merchantKey = (raw: string) => merchantName(raw).toUpperCase()

/** Works out a category from the description alone. `institution` is the bank the transaction came from. */
export function categorise(description: string, amount: number, institution = ''): string {
  const s = ` ${description.toUpperCase()} `
  if (PAY.test(s) && amount > 0) return 'Income'
  if (TRANSFER.test(s)) return 'Transfers'
  const person = PERSON_PAYMENT.test(s)
  const own = institution.toUpperCase()
  if (person && BANKS.some(b => s.includes(b) && !own.includes(b))) return 'Transfers' // money moving to or from another of your banks
  const brand = BRANDS.find(b => b.re.test(s))
  if (brand) return brand.category
  const hint = HINTS.find(([re]) => re.test(s))
  if (hint) return hint[1]
  if (person) return 'People'
  if (/PAYPAL/.test(s)) return 'Shopping'
  return amount > 0 ? 'Income' : 'Other'
}

const WEAK = new Set(['', 'Other', 'Income', 'People'])

/**
 * Sorts transactions that need it and returns the ones that changed.
 * - New (blank) transactions follow what you chose before for the same merchant, then the rules.
 * - With `resortAll` (run once when the rules improve), everything is re-examined; a settled category is
 *   only replaced when the new rules recognise the merchant.
 * - A payment out of one account matched by the same amount into another within 3 days is a transfer.
 */
export function smartSort(db: Tables, resortAll: boolean): Txn[] {
  const bank = new Map(db.accounts.map(a => [a.id, a.institution]))
  const votes = new Map<string, Map<string, number>>()
  for (const t of db.transactions) {
    if (WEAK.has(t.category)) continue
    const k = merchantKey(t.description)
    const m = votes.get(k) ?? new Map<string, number>()
    m.set(t.category, (m.get(t.category) ?? 0) + 1)
    votes.set(k, m)
  }
  const learned = (t: Txn) => {
    const m = votes.get(merchantKey(t.description))
    return m ? [...m].sort((a, b) => b[1] - a[1])[0][0] : null
  }
  const next = new Map<string, string>()
  for (const t of db.transactions) {
    const rule = categorise(t.description, t.amount, bank.get(t.account_id))
    if (t.category === '') next.set(t.id, rule === 'Transfers' ? rule : learned(t) ?? rule)
    else if (resortAll && (WEAK.has(t.category) || t.category === 'Transfers' || !WEAK.has(rule))) next.set(t.id, rule)
  }
  // Transfer pairs across your own accounts
  const cat = (t: Txn) => next.get(t.id) ?? t.category
  const ins = new Map<string, Txn[]>()
  for (const t of db.transactions) if (t.amount > 0 && WEAK.has(cat(t))) ins.set(t.amount.toFixed(2), [...(ins.get(t.amount.toFixed(2)) ?? []), t])
  const used = new Set<string>()
  for (const t of db.transactions) {
    if (t.amount > -1 || !WEAK.has(cat(t))) continue
    const match = (ins.get((-t.amount).toFixed(2)) ?? []).find(u => !used.has(u.id) && u.account_id !== t.account_id
      && Math.abs(daysBetween(t.date, u.date)) <= 3 && (resortAll || next.has(t.id) || next.has(u.id))) // never re-open pairs you've already settled
    if (!match) continue
    used.add(match.id)
    next.set(t.id, 'Transfers')
    next.set(match.id, 'Transfers')
  }
  return db.transactions.filter(t => next.has(t.id) && next.get(t.id) !== t.category).map(t => ({ ...t, category: next.get(t.id)! }))
}

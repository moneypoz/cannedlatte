/**
 * Supporting content for each /best list page: intro paragraphs shown below the
 * table, plus FAQs (rendered and emitted as FAQPage schema).
 * Written from the database's own numbers — update alongside the data.
 */
export const listContent: Record<string, { paragraphs: string[]; faqs: { q: string; a: string }[] }> = {
  'least-sugar': {
    paragraphs: [
      'Sugar is where canned lattes differ most. A flavored dairy coffee from a gas-station cooler can carry 30 g or more, while the cans at the top of this list get to single digits, or to zero, by leaning on the milk itself or on whole-food sweeteners like dates instead of added sugar. La Colombe\'s 2026 reformulation is a sign of where the category is heading: its Vanilla Draft Latte dropped to 15 g, less than half of what typical flavored dairy coffees carry.',
      'When comparing, check two lines on the label: total sugars and added sugars. A latte with 8 g of sugar and 0 g added (like an oat milk latte sweetened with dates) is a different product from one with 8 g of added cane sugar, even though the totals match. We track both, and the "no added sugar" filter on the home page shows only the former.',
      'Watch can size too. A 6.5 oz can with 12 g of sugar is sweeter per sip than an 11 oz can with 16 g. Where brands publish it, the full label is on each product page.',
    ],
    faqs: [
      { q: 'Which canned latte has the least sugar?', a: 'Among cans we track, NOBL\'s Cold Brew Oat Milk Latte leads with 0 g added sugar — just cold brew and oat milk. Slate is the lowest-sugar dairy option at 1 g per can with none added, ahead of Wandering Bear\'s 5–6 g per 8 oz can.' },
      { q: 'Are low-sugar canned lattes unsweetened?', a: 'Not always. Some use the natural sweetness of oat milk or dates rather than added sugar, so they taste lightly sweet while showing 0 g added sugar on the label.' },
      { q: 'How much sugar is in a typical canned latte?', a: 'Flavored dairy canned coffees commonly run 15–33 g per can. The low-sugar end of the category runs 0–8 g.' },
    ],
  },
  'most-caffeine': {
    paragraphs: [
      'Caffeine in canned lattes ranges from a gentle 80 mg to over 200 mg per can — the difference between a soda\'s worth and two strong cups of coffee. For reference, a 12 oz drip coffee is typically 140–200 mg and a single espresso shot is 65–75 mg, so the strongest cans on this list genuinely replace a large coffee-shop order.',
      'Two things drive the number: the coffee format (cold brew concentrates and triple-shot builds carry more) and the can size. La Colombe\'s Triple Draft Latte tops our database at 230 mg per its label, with Projo\'s Power Coffee close behind at 225 mg and NOBL\'s cold brew oat latte at 207 mg; most mainstream dairy lattes cluster around 100–140 mg.',
      'Brands aren\'t required to print caffeine on the label, and actual content varies batch to batch, so treat every figure as typical rather than exact. Where a brand publishes a range, we note it on the product page.',
    ],
    faqs: [
      { q: 'What is the strongest canned latte?', a: 'La Colombe\'s Triple Draft Latte is the strongest we track at 230 mg of caffeine per its label, followed by Projo\'s Power Coffee Vanilla Latte at 225 mg and NOBL\'s Cold Brew Oat Milk Latte at about 207 mg.' },
      { q: 'How much caffeine is safe per day?', a: 'The FDA cites up to 400 mg a day as generally safe for healthy adults — roughly two of the strongest cans on this list, or three to four typical ones.' },
    ],
  },
  'oat-milk': {
    paragraphs: [
      'Oat milk has become the default non-dairy base for canned lattes because it froths and carries coffee flavor more like dairy than almond or soy. Every can on this list is dairy-free, but they differ sharply in caffeine (80 mg to over 200 mg) and in how they\'re sweetened — some use dates or nothing at all, others add cane sugar. Whether you spell it oat milk or oatmilk, a canned oatmilk latte lives or dies on the same three numbers: caffeine, sugar, and price.',
      'One practical note: oat versions usually cost more than the same brand\'s dairy can. La Colombe\'s oat milk Draft Lattes, for example, run about $0.33 more per can than their dairy equivalents. Refrigeration also varies — most are shelf-stable, but NOBL ships cold.',
    ],
    faqs: [
      { q: 'Are oat milk canned lattes vegan?', a: 'The base is plant-only, and the cans we track are marketed as dairy-free. Check the product page and label for certifications if strict vegan status matters to you.' },
      { q: 'Do oat milk lattes have more sugar than dairy ones?', a: 'Oat milk contributes some natural sugar, but several oat cans on this list have less total sugar than typical dairy lattes because they skip added sugar entirely.' },
    ],
  },
  'high-protein': {
    paragraphs: [
      'A newer corner of the category treats the canned latte as a protein snack with caffeine. Projo leads it at 25 g of protein in an 11 oz can, from milk protein isolate and collagen. Slate follows at 20 g alongside 1 g of sugar and 100 calories, then Wandering Bear at 11 g in an 8 oz can, which is why these brands pitch their cans as a morning or post-workout drink rather than a dessert. Standard dairy lattes land around 6–8 g from regular milk; oat milk lattes carry much less, usually 1–3 g.',
      'If protein is the goal, check the sugar column at the same time — some "protein coffee" products elsewhere in the market get their palatability from sweetness. The cans ranked here keep sugar in single digits.',
    ],
    faqs: [
      { q: 'Which canned latte has the most protein?', a: 'Projo\'s Power Coffee Vanilla Latte leads our database at 25 g of protein per 11 oz can, ahead of Slate\'s lattes at 20 g and Wandering Bear\'s cold brew lattes at 11 g.' },
      { q: 'Do oat milk lattes have protein?', a: 'Very little — oat milk typically carries 1–3 g per serving, versus 6–25 g for dairy-based cans.' },
    ],
  },
  'cheapest-per-can': {
    paragraphs: [
      'Price per can is the honest way to compare, because pack sizes vary from singles to 12-packs. The cans here run from under $3 to about $4 at the brand\'s own store or its most common retailer. Grocery and club prices swing with promotions, so treat this as a ranking rather than a quote — and note that DTC 12-packs (La Colombe at $34/12, NOBL at $38/12) usually beat single-can convenience-store prices by a dollar or more.',
      'The cheapest per-can path for most people: buy the multipack of a shelf-stable can you already know you like. Refrigerated and single-serve options carry a premium.',
    ],
    faqs: [
      { q: 'What is the cheapest canned latte?', a: 'Among cans we track with published prices, La Colombe\'s dairy Draft Lattes work out to about $2.83 per can in a 12-pack. Store-brand and promotional prices can go lower.' },
      { q: 'Is buying direct from the brand cheaper?', a: 'Usually per can, yes, via 12-packs and subscriptions — but shipping can erase the gap on small orders. Grocery multipacks are often the best real-world deal.' },
    ],
  },
  'no-added-sugar': {
    paragraphs: [
      'These are the cans with a 0 in the added-sugars line: sweetness, where there is any, comes from the milk itself, from whole ingredients like dates, or from non-nutritive sweeteners that carry no sugar at all. Seven cans qualify, and they get there three different ways. NOBL keeps it to literally two ingredients (cold brew and oat milk) and shows 0 g of sugar of any kind. Slate\'s five lattes lean on stevia and monk fruit, which leaves 1 g of naturally occurring milk sugar next to 20 g of protein. Pop & Bottle sweetens with dates, so its label shows around 8 g of total sugar but none added.',
      'If a can you love isn\'t here, the least-sugar list is the neighboring compromise: several cans at 5–6 g of added sugar taste barely sweetened.',
    ],
    faqs: [
      { q: 'What does "no added sugar" mean on a canned latte?', a: 'The added-sugars line on the nutrition panel reads 0 g. The can may still show total sugars from milk (lactose) or fruit-based sweeteners like dates.' },
      { q: 'Do no-added-sugar lattes taste bitter?', a: 'The dairy- and oat-based ones taste like lightly creamy coffee rather than a sweet drink. Date-sweetened cans like Pop & Bottle\'s land closer to a conventional latte.' },
    ],
  },
  'dairy-free': {
    paragraphs: [
      'Every can here is made without dairy — oat milk dominates, with almond appearing occasionally. Beyond the milk itself, the differences that matter are caffeine (80 to 207 mg across this list), sweetener (dates, cane sugar, or none), and storage (most are shelf-stable; NOBL is refrigerated and ships cold).',
      'Lactose-intolerant but not dairy-free? Note that La Colombe\'s reformulated Draft Lattes use lactose-free whole milk — real dairy, no lactose — which sits between this list and the standard dairy cans.',
    ],
    faqs: [
      { q: 'Are dairy-free canned lattes lactose-free?', a: 'Yes — no dairy means no lactose. Separately, some dairy cans (like La Colombe\'s Draft Lattes) use lactose-free milk, so lactose-intolerant drinkers have options on both lists.' },
      { q: 'Which dairy-free canned latte has the most caffeine?', a: 'NOBL\'s Cold Brew Oat Milk Latte, at about 207 mg per can.' },
    ],
  },
};

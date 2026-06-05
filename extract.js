export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mime } = req.body;
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_KEY not set in environment' });

  const TYPES   = ['Income','Expense','Advance & Reimbursement','Adjustment'];
  const FROMS   = ['Treasury','Lisa','Bianca','Huck','Megan','TPBank','External'];
  const TOS     = ['Treasury','Lisa','Bianca','Huck','Megan','External'];
  const CATS    = ['Contribution','Groceries','Food and Drinks','Coffee','Rent','Utilities','Transport','Work','Emergency','Misc','Transfer','Reward','Fine','Health',"Huck's undefined expense"];
  const METHODS = ['Cash','Bank'];

  const prompt = `Extract the bank transfer details from this screenshot.
Reply with ONLY a raw JSON object — no markdown, no backticks, no explanation.

Rules:
- timestamp: "DD/MM/YYYY HH:MM:SS" using the time shown
- type: one of ${JSON.stringify(TYPES)} — if description/note says "Expense" use that
- from: one of ${JSON.stringify(FROMS)}
  * The account owner sending money → "Treasury"
  * Money coming in from outside → "External"
- to: one of ${JSON.stringify(TOS)}
  * Match recipient name to known people if possible: Le Thi Thao = Megan, etc.
  * Unknown recipient → "External"
- category: one of ${JSON.stringify(CATS)} — guess from description
- amount: plain integer only, no symbols, no dots, no commas (e.g. 35000)
- description: ONLY the main purpose label, short and clean. E.g. "Tiền điện tháng 5", "Tiền nhà tháng 5", "Megan bún riêu". NO person name here.
- note: person name + item if relevant, e.g. "Bianca bánh canh". Empty string otherwise.
- method: "Bank" for app/transfer, "Cash" for cash

Output format:
{"timestamp":"...","type":"...","from":"...","to":"...","category":"...","amount":0,"description":"...","method":"...","note":"..."}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    const raw = data.content?.[0]?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON found', raw });
    return res.status(200).json(JSON.parse(match[0]));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

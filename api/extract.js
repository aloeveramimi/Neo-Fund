export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mime } = req.body;
  // Chúng ta sẽ dùng biến OPENAI_KEY trên Vercel
  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_KEY not set in environment' });

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

  const cleanMime = mime === 'image/jpg' ? 'image/jpeg' : (mime || 'image/jpeg');

  try {
    // Gọi đến API của OpenAI bằng mô hình gpt-4o-mini siêu nhanh và rẻ
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        response_format: { type: "json_object" }, // Ép ChatGPT trả về JSON chuẩn
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${cleanMime};base64,${image}` } }
          ]
        }]
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    
    const rawText = data.choices?.[0]?.message?.content || '';
    return res.status(200).json(JSON.parse(rawText));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

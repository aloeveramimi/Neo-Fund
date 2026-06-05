export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mime } = req.body;
  // Giờ chúng ta sẽ dùng biến GEMINI_KEY thay vì ANTHROPIC_KEY
  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_KEY not set in environment' });

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
- description: STRICT RULE FOR DESCRIPTION:
  * ONLY fill this field if the transaction is a MAJOR, PERIODIC, or FIXED budget item for the week or month.
  * Examples of valid descriptions: "Tiền nhà tháng 5", "Tiền điện tháng 5", "Tiền nước tháng 5", "Tiền lãi tháng 5", "Tiền buff tuần 1", "Tiền quỹ tuần".
  * If it is a regular daily purchase, small expense, or individual meal (e.g., buying banh mi, bún riêu, coffee, groceries, personal shopping), you MUST leave this field as an empty string "".
- note: person name + item if relevant, e.g. "Bianca bánh canh". Empty string otherwise.
- method: "Bank" for app/transfer, "Cash" for cash

Output format:
{"timestamp":"...","type":"...","from":"...","to":"...","category":"...","amount":0,"description":"...","method":"...","note":"..."}`;

  // Chuẩn hóa định dạng Mime-type cho đúng chuẩn Google yêu cầu
  const cleanMime = mime === 'image/jpg' ? 'image/jpeg' : (mime || 'image/jpeg');

  try {
    // Gọi thẳng đến endpoint API của Gemini 2.5 Flash 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: cleanMime, data: image } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json" // Ép Gemini luôn trả về định dạng JSON chuẩn
        }
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON found', raw: rawText });
    
    return res.status(200).json(JSON.parse(match[0]));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

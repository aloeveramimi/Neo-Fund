export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { image, mime, userSelected } = req.body;
  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_KEY not set in environment' });

  const TYPES   = ['Income','Expense','Advance & Reimbursement','Adjustment'];
  const FROMS   = ['Treasury','Lisa','Bianca','Huck','Megan','TPBank']; 
  const TOS     = ['Treasury','Lisa','Bianca','Huck','Megan','External'];
  const CATS    = ['Contribution','Groceries','Food and Drinks','Coffee','Rent','Utilities','Transport','Work','Emergency','Misc','Transfer','Reward','Fine','Health',"Huck's undefined expense"];

  const prompt = `Extract the bank transfer details from this screenshot.
The person uploading this screenshot right now is: "${userSelected || 'Unknown'}".

Reply with ONLY a raw JSON object — no markdown, no backticks, no explanation.

Strict Business Rules:
1. timestamp: "DD/MM/YYYY HH:MM:SS" using the time shown. If HH:MM:SS is missing or cropped from the screenshot, use the transaction date + "00:00:00".
2. type: One of ${JSON.stringify(TYPES)}.
   - Check if money is flowing INTO the fund or OUT of the fund/wallet.
   - If a member is sending money to the fund (e.g. Contribution / Đóng quỹ) -> Set type to "Income".
   - If a member is buying something or paying for general things -> Set type to "Expense".
3. from: One of ${JSON.stringify(FROMS)}. (STRICT: "External" is NOT allowed in this field).
- DEFAULT RULE: The "from" field MUST MATCH the person uploading this screenshot ("${userSelected || 'Unknown'}").
- CRITICAL EXCEPTION FOR INCOME: If the transaction is clearly a fund contribution or deposit (Income), AI MUST look closely at the screenshot. 
  + If the receiver account is TPBank with account number "00004425830" (or registered under names like "Duong Minh Giang", "Miami Yogurt"), this is a transfer INTO the Treasury fund. In this case, AI MUST identify the actual sender/depositor from the receipt and map it to their short name (e.g., "Duong Quynh Huong" -> "Bianca", "Do Quang Hoc" -> "Huck"). 
  + DO NOT blindly use "${userSelected}" for Income if "${userSelected}" is "Treasury", because the admin is just uploading on behalf of that member.
- EXPENSE NOTE: If it is an Expense (paying for meals, drinks, coffee), the "from" field MUST strictly remain "${userSelected}". Even if other member names appear in the transfer text because they ate together, DO NOT change the "from" field to those names.
4. to: One of ${JSON.stringify(TOS)}.
   - If money is coming into the fund account -> "to" MUST be "Treasury".
   - If money is spent at a public shop/vendor -> "to" MUST be "External".
5. amount: Plain integer only, no currency symbols, no dots, no commas (e.g. 35000).

6. Name & Bank Mapping Rules (Convert real Vietnamese names from screenshot):
   - "Nguyen Thuy Linh" -> Megan
   - "Duong Quynh Huong" -> Bianca
   - "Do Quang Hoc" -> Huck
   - "Duong Minh Giang" OR "Miami Yogurt" OR "Lisa":
     * IF the bank brand shown on the screenshot is "TPBank" -> Map exactly to "Treasury" (Official Fund Account).
     * IF the bank brand is ANY OTHER BANK (e.g. Vietcombank, Techcombank, MB Bank...) -> Map to "Lisa" (Personal Account).

7. Brand Memory & Context Mapping Rules (Save short shop name to "note" and assign correct "category"):
   - Recipient "Cong ty TNHH thuc pham Nguyen Nhi" -> note MUST contain "BMTT (bánh mì thảnh thơi)", category is "Coffee".
   - Recipient "Baci" -> note MUST contain "Baci coffee", category is "Coffee".
   - Recipient "Cong ty moon dining" -> note MUST contain "coffee moon dining", category is "Coffee".
   - Recipient "Tran Trung Cang" -> note MUST contain "vé Sinh cafe (xe buýt)", category is "Transport".
   - Recipient "Cong ty tnhh tai minh khang" -> note MUST contain "Bon Bon", category is "Food and Drinks" or "Coffee".
   - Recipient "McDonalds" -> note MUST contain "McDonalds", category is "Food and Drinks".
   - Recipient "Go Da lat" AND amount is exactly 12300 -> note MUST contain "sữa để uống coffee", category is "Coffee".
   - If the transaction text/context mentions "atiso" or "langfarm" and is related to "Huck" (e.g., uploaded by Huck, context for Huck) , category is "Health".

8. Category Rules by Type:
   - If type is "Income" -> category MUST be "Contribution".
   - If type is "Expense" -> category can be ['Groceries','Food and Drinks','Coffee','Rent','Utilities','Transport','Work','Emergency','Misc','Health',"Huck's undefined expense"].
     * STRICTION FOR EXPENSE CATEGORIZATION (CRITICAL FOR FOOD):
     * If the transaction note/text mentions ready-to-eat snacks, cooked/boiled meals, street food, or immediate personal food (e.g., "khoai lang", "khoai luoc", "bun rieu", "banh canh", "com", "McDonalds") -> MUST categorize exactly as "Food and Drinks".
     * If it mentions raw grocery items, market items, or raw ingredients for cooking (e.g., "mua rau", "thit", "trung", "di cho") -> MUST categorize as "Groceries".
     * DO NOT lazily put food, snack, or meal items into "Misc". Only use "Misc" when the transaction truly does not fit any other option.
   - If type is "Advance & Reimbursement" -> category can be ['Transfer','Reward','Fine'].

9. description: STRICT RULE FOR DESCRIPTION:
   - ONLY fill this field if the transaction is a MAJOR, PERIODIC, or FIXED budget item for the week or month (e.g., "Tiền nhà tháng 5", "Tiền điện tháng 5", "Tiền nước tháng 5", "Tiền lãi tháng 5", "Tiền buff tuần 1", "Tiền quỹ tuần").
   - If it is a regular daily purchase or individual meal, leave this field as an empty string "".

10. note: Fill this with the mapped name of the members involved + specific item/reason (e.g., "Megan bún riêu").
    - MAP REAL NAMES TO SHORT NAMES: Look at the names in the transaction text or sender name. ALWAYS convert them to their short English mapped names ("Megan", "Bianca", "Huck", "Lisa", "Treasury") using the rules from Rule 6.
    - CRITICAL FOR INCOME/CONTRIBUTIONS: If the transaction is "Income" and the sender is "Duong Quynh Huong", the note MUST contain be "Bianca đóng quỹ" (or the reason shown). NEVER write "Duong Minh Giang" or "Lisa" here just because she is the uploader or the recipient.
    - MULTIPLE MEMBERS FORMATTING RULE: If the text or context involves 2 or more members eating or buying together, you MUST strictly format the note as: [Name] + [Name] + [Name]: [reason]. Use a space around the "+" and a colon ":" right before the reason.
      * Right Example: "Bianca + Megan + Huck: phở"
      * Right Example: "Huck + Megan: coffee"
- NO GUESSWORK & NO AUTOMATIC NAMES: If there are NO member names on the bill (only random transaction codes, machine-generated numbers, internet banking automatic codes, or POS terminal IDs like Highlands/Starbucks codes), do NOT guess any names, and NEVER automatically insert "Megan", "Bianca", or the uploader's name ("${userSelected}") into the note. Just output the isolated merchant name/item (e.g., "Highlands", "Starbucks", "Grab") so the user can manually fill the member's name later.
    - DO NOT CHANGE TO UPLOADER FOR NOTE: Never blindly replace the actual names involved on the bill with the uploader's name ("${userSelected}") if the bill clearly indicates another member.
    - STRICT SECURITY CHOP: NEVER include the member's real Vietnamese names from the screenshot (like "Duong Quynh Huong", "Nguyen Thuy Linh", "Duong Minh Giang", etc.) or any outside stranger's name here. ONLY use the short mapped names ("Megan", "Bianca", "Huck", "Lisa", "Treasury").

11. method: "Bank" for app/transfer, "Cash" for cash.

Output format:
{"timestamp":"...","type":"...","from":"...","to":"...","category":"...","amount":0,"description":"...","method":"...","note":"..."}`;

  const cleanMime = mime === 'image/jpg' ? 'image/jpeg' : (mime || 'image/jpeg');

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:${cleanMime};base64,${image}`,
              
              } 
            }
          ]
        }]
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message || data.error });
    
    const rawText = data.choices?.[0]?.message?.content || '';
    return res.status(200).json(JSON.parse(rawText));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

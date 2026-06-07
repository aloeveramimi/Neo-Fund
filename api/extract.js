export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Thay đổi: Nhận images (mảng) thay vì image (đơn lẻ)
  const { images, mime, userSelected } = req.body;
  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_KEY not set' });

  const TYPES   = ['Income','Expense','Advance & Reimbursement','Adjustment'];
  const FROMS   = ['Treasury','Lisa','Bianca','Huck','Megan','TPBank']; 
  const TOS     = ['Treasury','Lisa','Bianca','Huck','Megan','External'];
  const CATS    = ['Contribution','Groceries','Food and Drinks','Coffee','Rent','Utilities','Transport','Work','Emergency','Misc','Transfer','Reward','Fine','Health',"Huck's undefined expense"];

  // Prompt logic giữ nguyên, chỉ thay đổi yêu cầu đầu ra là một mảng
  const prompt = `Bạn là kế toán Quỹ Neo. Hãy trích xuất thông tin từ DANH SÁCH ảnh hóa đơn này.
  Người upload là: "${userSelected || 'Unknown'}".
  Trả về JSON Array gồm các object giao dịch. Ví dụ: [{"timestamp":"...","type":"...",...}, {...}].
  Không markdown, không backticks, không giải thích.

  Các quy tắc (Giữ nguyên luật cũ):
  1. ... (Giữ nguyên các quy tắc logic như bạn đã có) ...
  2. ... (Đảm bảo quy tắc Income/Expense, ánh xạ tên thành viên, v.v.) ...
  `;

  // Xử lý mảng ảnh
  const imageContents = images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${mime || 'image/jpeg'};base64,${img}` }
  }));

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2000, // Tăng max_tokens để chứa kết quả của nhiều ảnh
        response_format: { type: "json_object" }, // Lưu ý: Nếu trả về mảng, AI đôi khi cần bọc trong object {"data": [...]}
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt + "\nTrả về cấu trúc: {\"transactions\": [...]}" },
            ...imageContents
          ]
        }]
      })
    });

    const data = await r.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    
    const rawText = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawText);
    
    // Trả về mảng các giao dịch
    return res.status(200).json(parsed.transactions || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

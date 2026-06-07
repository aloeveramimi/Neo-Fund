import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Nhận dữ liệu gửi từ Frontend lên, bốc thêm biến userSelected (Nút "I am" mọi người chọn)
  const { row, userSelected } = req.body;

  // 1. CẤU HÌNH CỨNG MÃ GID CỦA FILE GOOGLE SHEETS CỦA BẠN VÀO ĐÂY
  // (Bạn mở Sheet lên, bấm vào từng tab rồi copy dãy số sau chữ gid= trên đường link URL nha)
  const GID_MEMBER = "1444019689"; 
  const GID_TREASURY = "0";

  // Gọi mã ID từ biến môi trường Vercel ra xài
  const sheetId = process.env.SPREADSHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'Missing SPREADSHEET_ID in Vercel Environment Variables' });

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY not set in environment.' });
  }

  // Tự động phân loại xem dữ liệu này cần ghi vào những tab nào dựa trên "userSelected"
  let sheetsToAppend = [];
  let targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${GID_MEMBER}`; // Mặc định trả link tab Member

  if (userSelected === 'Treasury') {
    // Nếu Thủ quỹ up bill, ghi vào tab Treasury và trả về link dẫn trực tiếp đến tab Treasury luôn
    sheetsToAppend.push('Treasury');
    targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${GID_TREASURY}`;
  } else {
    // Nếu là thành viên khác (Megan, Bianca, Huck...) up bill, mặc định ghi vào tab Member
    sheetsToAppend.push('Member');
  }

  try {
    const auth = new GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    // Vòng lặp ghi dữ liệu vào các tab đã phân loại ở trên
    for (const name of sheetsToAppend) {
      const range = encodeURIComponent(`${name}!A1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      const r = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ values: [row] })
      });

      const data = await r.json();
      if (data.error) return res.status(500).json({ error: data.error.message });
    }

    // TRẢ KẾT QUẢ VỀ FRONTEND KÈM THEO ĐƯỜNG LINK ĐỘNG THEO USER 
    return res.status(200).json({ 
      ok: true,
      sheetUrl: targetUrl 
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

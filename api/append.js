import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Nhận dữ liệu gửi từ Frontend lên, bốc thêm biến "sheetName" do vòng lặp Frontend chỉ định
  const { row, userSelected, sheetName } = req.body;

  // 1. CẤU HÌNH CỨNG MÃ GID CỦA FILE GOOGLE SHEETS
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

  // 🎯 LUỒNG PHÂN LUỒNG NGHE LỜI FRONTEND TUYỆT ĐỐI:
  let sheetsToAppend = [];
  let targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${GID_MEMBER}`; 

  if (sheetName) {
    // Nếu Frontend chạy vòng lặp và chỉ định đích danh tab cần ghi ('Member' hoặc 'Treasury')
    sheetsToAppend.push(sheetName);
    targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${sheetName === 'Treasury' ? GID_TREASURY : GID_MEMBER}`;
  } else {
    // Luồng dự phòng nếu sau này có giao dịch đơn lẻ nào không truyền sheetName
    if (userSelected === 'Treasury') {
      sheetsToAppend.push('Treasury');
      targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${GID_TREASURY}`;
    } else {
      sheetsToAppend.push('Member');
    }
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

    // Vòng lặp ghi dữ liệu (Lúc này chỉ có đúng 1 tab được chỉ định từ Frontend)
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

    // TRẢ KẾT QUẢ VỀ FRONTEND KÈM THEO ĐƯỜNG LINK ĐỘNG THEO LUỒNG GIAO DỊCH
    return res.status(200).json({ 
      ok: true,
      sheetUrl: targetUrl 
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

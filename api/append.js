import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Nhận dữ liệu gửi từ Frontend lên, bốc thêm biến userSelected (Nút "I am" mọi người chọn)
  const { sheetName = 'Log', row, userSelected } = req.body;

  // Cấu hình cứng mã GID thực tế của bạn
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

  // Tự động chọn mã GID tương ứng theo sheetName đang chạy để ghép link dòng chuẩn xác
  let currentGid = GID_MEMBER;
  if (sheetName === 'Treasury') {
    currentGid = GID_TREASURY;
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

    const range = encodeURIComponent(`${sheetName}!A1`);
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

    // --- LOGIC TRÍCH XUẤT TỌA ĐỘ DÒNG VỪA CHÈN ---
    // Google API trả về dạng: "Member!A50:K50". Mình bốc dải ô đằng sau dấu "!" là "A50:K50"
    let cellRange = "A1";
    if (data.updates && data.updates.updatedRange) {
      const parts = data.updates.updatedRange.split('!');
      if (parts.length > 1) {
        cellRange = parts[1]; // Lấy được tọa độ thực tế (ví dụ: A50:K50)
      }
    }

    // Ghép tọa độ dòng và mã GID của tab để tạo link động dẫn thẳng tầm mắt
    const targetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${currentGid}&range=${cellRange}`;

    // TRẢ KẾT QUẢ VỀ FRONTEND KÈM THEO ĐƯỜNG LINK ĐỘNG DẪN ĐẾN ĐÚNG DÒNG VỪA CHÈN
    return res.status(200).json({ 
      ok: true,
      sheetUrl: targetUrl 
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { sheetId, sheetName = 'Log', row } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'Missing sheetId' });

  // Bốc thông tin Service Account từ biến môi trường Vercel ra
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY not set in environment.' });
  }

  try {
    // Tự động cấu hình xác thực bằng thông tin con Bot Service Account
    const auth = new GoogleAuth({
      credentials: {
        client_email: clientEmail,
        // Sửa lỗi xuống dòng \n của chuỗi khóa bí mật private_key khi lưu trên Cloud Vercel
        // Dòng thông minh tự nhận diện mọi kiểu dán key trên Vercel không lo lỗi Decoder
        private_key: privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Tạo mã Access Token cấp quyền từ Google để đi làm việc với Google Sheet
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    const range = encodeURIComponent(`${sheetName}!A1`);
    // Sử dụng endpoint chuẩn của Google API và loại bỏ tham số &key=${gKey} cũ bị từ chối
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    // Gọi API của Google kèm mã Access Token quyền Editor trong Header
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
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

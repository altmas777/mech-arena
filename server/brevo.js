const fetch = require('node-fetch');

/**
 * Sends an OTP email via Brevo (Sendinblue) Transactional Email API
 */
async function sendOTPEmail(toEmail, otp) {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey || apiKey === 'your_brevo_api_key_here') {
    console.warn('[BREVO] No real API key set. OTP would be:', otp);
    // In dev mode, just log the OTP instead of sending
    return { success: true, dev: true };
  }

  const payload = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || 'MECH ARENA',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@facefighter.com'
    },
    to: [{ email: toEmail }],
    subject: '⚡ Your MECH ARENA Login Code',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;background:#0a0a0f;font-family:Arial,sans-serif;">
          <div style="max-width:480px;margin:0 auto;padding:40px 20px;">
            <div style="text-align:center;margin-bottom:32px;">
              <h1 style="color:#ff3c00;font-size:36px;margin:0;text-transform:uppercase;letter-spacing:4px;">
                MECH ARENA
              </h1>
              <p style="color:#888;font-size:12px;margin:8px 0 0;letter-spacing:2px;">ARENA OF LEGENDS</p>
            </div>
            <div style="background:#111;border:1px solid #ff3c00;border-radius:8px;padding:32px;text-align:center;">
              <p style="color:#ccc;font-size:14px;margin:0 0 16px;">Your one-time login code is:</p>
              <div style="background:#0a0a0f;border-radius:8px;padding:24px;margin:16px 0;">
                <span style="color:#ff3c00;font-size:48px;font-weight:bold;letter-spacing:12px;">${otp}</span>
              </div>
              <p style="color:#666;font-size:12px;margin:16px 0 0;">This code expires in <strong style="color:#ffaa00;">10 minutes</strong>.</p>
              <p style="color:#666;font-size:12px;margin:8px 0 0;">Do not share this code with anyone.</p>
            </div>
            <p style="color:#333;font-size:11px;text-align:center;margin-top:24px;">
              If you did not request this, you can safely ignore this email.
            </p>
          </div>
        </body>
      </html>
    `
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${errText}`);
  }

  return { success: true };
}

module.exports = { sendOTPEmail };

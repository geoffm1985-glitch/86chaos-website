const MAX_FIELD_LENGTH = 3000;

function clean(value = '') {
  return String(value).replace(/[<>]/g, '').trim().slice(0, MAX_FIELD_LENGTH);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function emailLooksValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');

  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const body = await readBody(req);

  // Honeypot spam trap. Pretend success so bots do not learn anything.
  if (body.website) {
    return res.status(200).json({ ok: true, message: 'Thanks. Your beta request was sent.' });
  }

  const submission = {
    name: clean(body.name),
    restaurant: clean(body.restaurant),
    location: clean(body.location),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    headache: clean(body.headache || body.pain_point),
    message: clean(body.message),
    submittedAt: new Date().toISOString(),
  };

  const missing = [];
  if (!submission.name) missing.push('name');
  if (!submission.restaurant) missing.push('restaurant');
  if (!submission.location) missing.push('city and state');
  if (!submission.email || !emailLooksValid(submission.email)) missing.push('valid email');
  if (!submission.headache) missing.push('biggest headache');

  if (missing.length) {
    return res.status(400).json({
      ok: false,
      message: `Please add: ${missing.join(', ')}.`,
    });
  }

  const to = process.env.BETA_TO_EMAIL;
  const from = process.env.BETA_FROM_EMAIL || '86 Chaos Beta <onboarding@resend.dev>';
  const resendKey = process.env.RESEND_API_KEY;

  if (!to || !resendKey) {
    console.log('86 Chaos beta application received but email env vars are missing:', submission);
    return res.status(503).json({
      ok: false,
      message: 'The form is installed, but email is not configured yet. Set RESEND_API_KEY and BETA_TO_EMAIL in Vercel.',
    });
  }

  const subject = `86 Chaos Founder Beta request — ${submission.restaurant}`;
  const text = [
    'New 86 Chaos Founder Beta request',
    '',
    `Name: ${submission.name}`,
    `Restaurant: ${submission.restaurant}`,
    `Location: ${submission.location}`,
    `Email: ${submission.email}`,
    `Phone: ${submission.phone || 'Not provided'}`,
    `Biggest headache: ${submission.headache}`,
    '',
    'Message:',
    submission.message || 'Not provided',
    '',
    `Submitted: ${submission.submittedAt}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17202a;max-width:680px">
      <h2 style="margin:0 0 12px;color:#c65327">New 86 Chaos Founder Beta request</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.name)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Restaurant</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.restaurant)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Location</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.location)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Phone</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.phone || 'Not provided')}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Biggest headache</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.headache)}</td></tr>
      </table>
      <h3 style="margin:18px 0 8px">Message</h3>
      <p style="white-space:pre-wrap;background:#f6f4f1;padding:14px;border-radius:10px">${escapeHtml(submission.message || 'Not provided')}</p>
      <p style="color:#6b7280;font-size:12px">Submitted: ${escapeHtml(submission.submittedAt)}</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: submission.email,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend error:', errorText);
      return res.status(502).json({
        ok: false,
        message: 'The form could not send right now. Please try again in a few minutes.',
      });
    }

    return res.status(200).json({ ok: true, message: 'Thanks. Your beta request was sent.' });
  } catch (error) {
    console.error('Beta form send failed:', error);
    return res.status(500).json({
      ok: false,
      message: 'The form could not send right now. Please try again in a few minutes.',
    });
  }
};

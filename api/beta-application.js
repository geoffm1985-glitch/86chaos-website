
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
  if (typeof req.body === 'string') {
    const type = req.headers['content-type'] || '';
    if (type.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(req.body));
    }
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = req.headers['content-type'] || '';

  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  try { return JSON.parse(raw || '{}'); } catch { return {}; }
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

  if (body.website) {
    return res.status(200).json({ ok: true, message: 'Thanks. Your beta request was sent.' });
  }

  const submission = {
    name: clean(body.name),
    restaurant: clean(body.restaurant),
    address: clean(body.address),
    location: clean(body.location),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    plan: clean(body.plan),
    headache: clean(body.headache || body.pain_point),
    message: clean(body.message),
    submittedAt: new Date().toISOString(),
  };

  const missing = [];
  if (!submission.name) missing.push('name');
  if (!submission.restaurant) missing.push('restaurant');
  if (!submission.address) missing.push('restaurant address');
  if (!submission.location) missing.push('city and state');
  if (!submission.email || !emailLooksValid(submission.email)) missing.push('valid email');
  if (!submission.phone) missing.push('phone');
  if (!submission.headache) missing.push('biggest headache');

  if (missing.length) {
    return res.status(400).json({
      ok: false,
      message: `Please add: ${missing.join(', ')}.`,
    });
  }

  const to = process.env.BETA_TO_EMAIL;
  const from = process.env.BETA_FROM_EMAIL || '86 Chaos Founder Beta <onboarding@resend.dev>';
  const resendKey = process.env.RESEND_API_KEY;

  if (!to || !resendKey) {
    console.log('86 Chaos beta application received but email env vars are missing:', submission);
    return res.status(503).json({
      ok: false,
      message: 'The form is installed, but email is not configured yet. Set RESEND_API_KEY and BETA_TO_EMAIL in Vercel.',
    });
  }

  const subject = `86 Chaos Founder Beta request: ${submission.restaurant}`;
  const text = [
    'New 86 Chaos Founder Beta request',
    '',
    `Name: ${submission.name}`,
    `Restaurant: ${submission.restaurant}`,
    `Address: ${submission.address}`,
    `City/State: ${submission.location}`,
    `Email: ${submission.email}`,
    `Phone: ${submission.phone}`,
    `Plan: ${submission.plan || 'Not sure yet'}`,
    `Biggest headache: ${submission.headache}`,
    '',
    'Message:',
    submission.message || 'Not provided',
    '',
    `Submitted: ${submission.submittedAt}`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17202a;max-width:700px">
      <h2 style="margin:0 0 12px;color:#c98f6d">New 86 Chaos Founder Beta request</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.name)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Restaurant</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.restaurant)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Address</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.address)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>City/State</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.location)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Phone</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.phone)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Plan</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.plan || 'Not sure yet')}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Biggest headache</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(submission.headache)}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Message</strong></td><td style="padding:8px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(submission.message || 'Not provided')}</td></tr>
        <tr><td style="padding:8px"><strong>Submitted</strong></td><td style="padding:8px">${escapeHtml(submission.submittedAt)}</td></tr>
      </table>
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

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Resend error:', result);
      return res.status(502).json({
        ok: false,
        message: result?.message || 'The email service could not send the request right now.',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Thanks. Your beta request was sent. I will follow up soon.',
    });
  } catch (error) {
    console.error('Beta form send failed:', error);
    return res.status(500).json({
      ok: false,
      message: 'The form could not send right now. Please try again in a few minutes.',
    });
  }
};

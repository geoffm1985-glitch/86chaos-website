import { Resend } from "resend";

const TO_EMAIL = process.env.BETA_TO_EMAIL || "geoffrey@86chaos.com";
const FROM_EMAIL = process.env.BETA_FROM_EMAIL || "86 Chaos <beta@86chaos.com>";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { name, restaurant, email, headache } = req.body || {};

  if (!name || !restaurant || !email) {
    return res.status(400).json({ error: "Name, restaurant, and email are required." });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY environment variable.");
    return res.status(501).json({
      error: "Email sending is not configured yet. Add RESEND_API_KEY in Vercel, then redeploy."
    });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const safeName = escapeHtml(name);
  const safeRestaurant = escapeHtml(restaurant);
  const safeEmail = escapeHtml(email);
  const safeHeadache = escapeHtml(headache || "Not provided");

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      replyTo: safeEmail,
      subject: `86 Chaos Founder Beta: ${restaurant}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
          <h2>New 86 Chaos Founder Beta Request</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Restaurant:</strong> ${safeRestaurant}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Biggest headache:</strong></p>
          <div style="white-space:pre-wrap;border-left:4px solid #d5a07d;padding-left:12px">${safeHeadache}</div>
        </div>
      `,
      text: `New 86 Chaos Founder Beta Request

Name: ${name}
Restaurant: ${restaurant}
Email: ${email}

Biggest headache:
${headache || "Not provided"}`
    });

    if (error) {
      console.error("Resend returned an error:", error);
      return res.status(500).json({
        error: error.message || "Email failed to send. Check Resend domain/API key settings."
      });
    }

    console.log("Founder Beta email sent:", data?.id || "no id returned");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Founder Beta email failed:", error);
    return res.status(500).json({
      error: error?.message || "Email failed to send. Check Vercel function logs."
    });
  }
}

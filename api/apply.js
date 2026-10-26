// Retire the old unprotected beta form; new signups use /api/launch-signup.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ok:false,message:'The beta application has closed. Visit 86chaos.com for launch updates.'});
}

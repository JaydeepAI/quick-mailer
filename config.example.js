// Copy this file to config.js and fill in your values.
// config.js is gitignored, so your real URL and personal details never end
// up in the repo.
//
// While APPS_SCRIPT_URL is still the placeholder, the app runs in demo mode
// and never sends anything.
window.QUICK_MAILER_CONFIG = {
  APPS_SCRIPT_URL: "YOUR_APPS_SCRIPT_WEB_APP_URL",

  // Defaults pre-filled into the form. You can still edit them before sending.
  SUBJECT: "Application for [Role] | [N]+ Years Exp | [Your Name]",

  // HTML for the message body. Use inline styles; mail clients ignore <style>.
  BODY_HTML: [
    '<p>Hi Team,</p>',
    '<p>I\'m [Your Name], a <b>Your Title</b> with <span style="background-color:#fce8b2">N+ years of experience</span>. ',
    'I\'d like to apply for the role at your organization. My resume is attached below.</p>',
    '<p><span style="background-color:#ffff00">Quick snapshot about me:</span><br>',
    '• Achievement one<br>',
    '• Achievement two<br>',
    '• Achievement three</p>',
    '<p>Happy to connect whenever it suits you.</p>',
    '<p>Thanks,<br>',
    'Your Name<br>',
    '<a href="https://linkedin.com/in/your-profile">linkedin.com/in/your-profile</a></p>'
  ].join(""),
};

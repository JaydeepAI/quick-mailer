/**
 * Copy this file to Personal.gs and put in your own subject and message.
 * Personal.gs is gitignored, so your details stay out of the public repo.
 * The website loads these defaults only after the access key is entered.
 *
 * Use inline styles in BODY_HTML; mail clients ignore <style> blocks.
 */
var PERSONAL = {
  SUBJECT: 'Application for [Role] | [N]+ Years Exp | [Your Name]',

  BODY_HTML: [
    '<p>Hi Team,</p>',
    '<p>I\'m [Your Name], a <b>[Your Title]</b> with <span style="background-color:#fce8b2">[N]+ years of experience</span>. ',
    'I\'d like to apply for the role at your organization. My resume is attached below.</p>',
    '<p><span style="background-color:#ffff00">Quick snapshot about me:</span><br>',
    '• Achievement one<br>',
    '• Achievement two<br>',
    '• Achievement three</p>',
    '<p>Happy to connect whenever it suits you.</p>',
    '<p>Thanks,<br>',
    '[Your Name]<br>',
    '<a href="https://linkedin.com/in/your-profile">linkedin.com/in/your-profile</a></p>'
  ].join('')
};

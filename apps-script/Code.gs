/**
 * Quick Mailer backend (Google Apps Script web app).
 *
 * Receives POST {to, key, subject?, html?} as a JSON string body and sends
 * the email from your Gmail account with GmailApp, so it appears in your
 * Sent folder. The website pre-fills subject and html from config.js; if
 * either is missing, the defaults below are used.
 *
 * Setup: see README.md. The access key lives in Script Properties under
 * ACCESS_KEY and is never stored in this file.
 */

// Replace these in the Apps Script editor only. Don't commit real values.
var DEFAULT_SUBJECT = 'Your subject line here';
var ATTACHMENT_FILE_ID = 'YOUR_DRIVE_FILE_ID';
var TEMPLATE_FILE = 'template'; // template.html, used when no html is sent

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var MAX_SUBJECT_LENGTH = 250;
var MAX_HTML_LENGTH = 100000;

function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!body) return json_({ ok: false, error: 'Invalid request.' });

    if (!isValidKey_(body.key)) {
      return json_({ ok: false, error: 'Invalid access key.' });
    }

    var to = String(body.to || '').trim();
    if (!EMAIL_RE.test(to) || to.length > 254) {
      return json_({ ok: false, error: 'Invalid email address.' });
    }

    var subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    if (subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
      return json_({ ok: false, error: 'Invalid subject.' });
    }

    var html = typeof body.html === 'string' ? body.html : '';
    if (html.length > MAX_HTML_LENGTH) {
      return json_({ ok: false, error: 'Message is too long.' });
    }

    sendMail_(to, subject || DEFAULT_SUBJECT, html.trim() ? html : null);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Could not send the email. Check the Apps Script logs.' });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    var data = JSON.parse(e.postData.contents);
    return data && typeof data === 'object' ? data : null;
  } catch (err) {
    return null;
  }
}

function isValidKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (!expected || typeof key !== 'string' || key.length !== expected.length) return false;
  // Compare every character so the response time doesn't reveal how much matched.
  var diff = 0;
  for (var i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ key.charCodeAt(i);
  }
  return diff === 0;
}

function sendMail_(to, subject, html) {
  var bodyHtml = html || HtmlService.createHtmlOutputFromFile(TEMPLATE_FILE).getContent();
  var attachment = DriveApp.getFileById(ATTACHMENT_FILE_ID).getBlob();

  GmailApp.sendEmail(to, subject, htmlToText_(bodyHtml), {
    htmlBody: wrapHtml_(bodyHtml),
    attachments: [attachment]
  });
}

// Give a bare HTML fragment from the website the same font as the editor.
function wrapHtml_(html) {
  if (/<body[\s>]/i.test(html)) return html;
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2328;">' +
    html + '</div>';
}

// Plain-text fallback for mail clients that don't render HTML.
function htmlToText_(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor to authorize Gmail and Drive and to check your
 * setup. It sends a test email to your own address.
 */
function testSendToSelf() {
  sendMail_(Session.getActiveUser().getEmail(), DEFAULT_SUBJECT, null);
}

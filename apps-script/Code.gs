/**
 * Quick Mailer backend (Google Apps Script web app).
 *
 * Accepts POST requests whose body is a JSON string:
 *   {key, to, subject?, html?}  sends the email from your Gmail with GmailApp
 *                               (so it appears in Sent), attaching the newest
 *                               resume from the GitHub "Latest Resume" folder.
 *   {key, action: "resume"}     returns the name of the resume that would be
 *                               attached, so the website can show it.
 *
 * Script Properties (Project Settings > Script Properties):
 *   ACCESS_KEY    required. The key the website sends with each request.
 *   GITHUB_TOKEN  required while the repo is private. A fine-grained token
 *                 with read-only "Contents" access to this repo only.
 *
 * Setup: see README.md.
 */

var DEFAULT_SUBJECT = 'Your subject line here';
var TEMPLATE_FILE = 'template'; // template.html, used when no html is sent

var GITHUB_REPO = 'JaydeepAI/quick-mailer';
var GITHUB_BRANCH = 'main';
var RESUME_FOLDER = 'Latest Resume';
var RESUME_EXTENSIONS = /\.(pdf|docx?)$/i;

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

    if (body.action === 'resume') {
      var resume = findLatestResume_();
      return json_({ ok: true, resume: { name: resume.name, updated: resume.date.toISOString() } });
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

    var attached = sendMail_(to, subject || DEFAULT_SUBJECT, html.trim() ? html : null);
    return json_({ ok: true, attachment: attached });
  } catch (err) {
    console.error(err);
    return json_({
      ok: false,
      error: err && err.userFacing ? err.message : 'Could not send the email. Check the Apps Script logs.'
    });
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

/** Sends the email and returns the attached file's name. */
function sendMail_(to, subject, html) {
  var bodyHtml = html || HtmlService.createHtmlOutputFromFile(TEMPLATE_FILE).getContent();
  var resume = findLatestResume_();
  var attachment = downloadResume_(resume);

  GmailApp.sendEmail(to, subject, htmlToText_(bodyHtml), {
    htmlBody: wrapHtml_(bodyHtml),
    attachments: [attachment]
  });
  return resume.name;
}

// ---------------------------------------------------------------------------
// GitHub: pick the most recently committed resume in the folder.
// ---------------------------------------------------------------------------

function findLatestResume_() {
  var folderUrl = '/repos/' + GITHUB_REPO + '/contents/' + encodePath_(RESUME_FOLDER) +
    '?ref=' + encodeURIComponent(GITHUB_BRANCH);
  var listing;
  try {
    listing = JSON.parse(githubFetch_(folderUrl).getContentText());
  } catch (err) {
    if (err.status === 404) {
      throw userError_('Could not find the "' + RESUME_FOLDER + '" folder on GitHub. Check GITHUB_REPO and GITHUB_TOKEN.');
    }
    throw err;
  }

  var files = (Array.isArray(listing) ? listing : []).filter(function (item) {
    return item.type === 'file' && RESUME_EXTENSIONS.test(item.name);
  });
  if (!files.length) {
    throw userError_('No resume found in the "' + RESUME_FOLDER + '" folder. Upload a PDF, DOC or DOCX file.');
  }

  // "Latest" means the file whose most recent commit is newest, so uploading
  // a new file or replacing an existing one both count.
  var latest = null;
  files.forEach(function (file) {
    var commitsUrl = '/repos/' + GITHUB_REPO + '/commits?per_page=1' +
      '&sha=' + encodeURIComponent(GITHUB_BRANCH) +
      '&path=' + encodeURIComponent(file.path);
    var commits = JSON.parse(githubFetch_(commitsUrl).getContentText());
    var date = commits.length ? new Date(commits[0].commit.committer.date) : new Date(0);
    if (!latest || date > latest.date) {
      latest = { name: file.name, path: file.path, date: date };
    }
  });
  return latest;
}

function downloadResume_(resume) {
  var url = '/repos/' + GITHUB_REPO + '/contents/' + encodePath_(resume.path) +
    '?ref=' + encodeURIComponent(GITHUB_BRANCH);
  return githubFetch_(url, 'application/vnd.github.raw+json')
    .getBlob()
    .setName(resume.name)
    .setContentType(mimeTypeFor_(resume.name));
}

function githubFetch_(path, accept) {
  var headers = {
    Accept: accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (token) headers.Authorization = 'Bearer ' + token;

  var res = UrlFetchApp.fetch('https://api.github.com' + path, {
    headers: headers,
    muteHttpExceptions: true
  });
  var status = res.getResponseCode();
  if (status === 401) throw userError_('GitHub rejected the token. Update GITHUB_TOKEN in Script Properties.');
  if (status !== 200) {
    var err = new Error('GitHub API returned ' + status + ' for ' + path + ': ' +
      res.getContentText().slice(0, 300));
    err.status = status;
    throw err;
  }
  return res;
}

function encodePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function mimeTypeFor_(name) {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.docx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.doc$/i.test(name)) return 'application/msword';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Errors whose message is safe and useful to show on the website.
function userError_(message) {
  var err = new Error(message);
  err.userFacing = true;
  return err;
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

// ---------------------------------------------------------------------------
// Run these from the editor during setup.
// ---------------------------------------------------------------------------

/** Logs which resume would be attached. Also triggers the authorization prompt. */
function testLatestResume() {
  var resume = findLatestResume_();
  console.log('Latest resume: ' + resume.name + ' (committed ' + resume.date.toISOString() + ')');
}

/** Sends a test email with the latest resume to your own address. */
function testSendToSelf() {
  sendMail_(Session.getActiveUser().getEmail(), DEFAULT_SUBJECT, null);
}

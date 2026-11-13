/**
 * Quick Mailer backend (Google Apps Script web app).
 *
 * Accepts POST requests whose body is a JSON string. Every request needs the
 * access key.
 *   {key, action: "defaults"}   returns the default subject and message and
 *                               the name of the resume that will be attached.
 *   {key, to, subject?, html?}  sends the email from your Gmail with GmailApp
 *                               (so it appears in Sent), attaching the newest
 *                               resume from the private resume repo.
 *
 * Personal content (default subject and message) lives in Personal.gs, which
 * is gitignored. See Personal.example.gs.
 *
 * Script Properties (Project Settings > Script Properties):
 *   ACCESS_KEY    The key the website sends with each request.
 *   GITHUB_TOKEN  Fine-grained token with read-only Contents access to the
 *                 resume repo.
 */

var GITHUB_REPO = 'JaydeepAI/latest-resume';
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

    if (body.action === 'defaults') return json_(getDefaults_());

    var to = String(body.to || '').trim();
    if (!EMAIL_RE.test(to) || to.length > 254) {
      return json_({ ok: false, error: 'Invalid email address.' });
    }

    var defaults = personal_();
    var subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    if (subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
      return json_({ ok: false, error: 'Invalid subject.' });
    }

    var html = typeof body.html === 'string' ? body.html : '';
    if (html.length > MAX_HTML_LENGTH) {
      return json_({ ok: false, error: 'Message is too long.' });
    }

    var attached = sendMail_(to, subject || defaults.SUBJECT, html.trim() ? html : defaults.BODY_HTML);
    return json_({ ok: true, attachment: attached });
  } catch (err) {
    console.error(err);
    return json_({
      ok: false,
      error: err && err.userFacing ? err.message : 'Something went wrong. Check the Apps Script logs.'
    });
  }
}

function getDefaults_() {
  var defaults = personal_();
  var result = { ok: true, subject: defaults.SUBJECT, html: defaults.BODY_HTML };
  try {
    var resume = findLatestResume_();
    result.resume = { name: resume.name, updated: resume.date.toISOString() };
  } catch (err) {
    console.error(err);
    result.resumeError = err && err.userFacing ? err.message : 'Could not check the resume folder.';
  }
  return result;
}

// Personal.gs defines PERSONAL. Fall back to placeholders if it's missing.
function personal_() {
  var p = typeof PERSONAL === 'object' && PERSONAL ? PERSONAL : {};
  return {
    SUBJECT: p.SUBJECT || 'Your subject line here',
    BODY_HTML: p.BODY_HTML || '<p>Hello,</p><p>Your message here.</p>'
  };
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
  var resume = findLatestResume_();
  var attachment = downloadResume_(resume);

  GmailApp.sendEmail(to, subject, htmlToText_(html), {
    htmlBody: wrapHtml_(html),
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
      throw userError_('Could not find the "' + RESUME_FOLDER + '" folder on GitHub. Check GITHUB_REPO and the token\'s repository access.');
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

// Give a bare HTML fragment the same font as the website's editor.
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

/** Sends the default email with the latest resume to your own address. */
function testSendToSelf() {
  var defaults = personal_();
  var to = Session.getEffectiveUser().getEmail();
  var attached = sendMail_(to, defaults.SUBJECT, defaults.BODY_HTML);
  console.log('Sent to ' + to + ' with ' + attached);
}

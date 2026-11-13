# Quick Mailer

A tiny single-page site for sending one pre-written email: type a recipient address, press **Send**, and the email goes out from your own Gmail account with your latest resume attached. The resume is picked automatically from the [`Latest Resume`](Latest%20Resume/) folder in this repo: whichever file was uploaded or updated most recently. The subject and message are pre-filled from your defaults in `config.js`, and you can still edit them before sending. Because it's sent with `GmailApp`, it shows up in your Gmail **Sent** folder.

It's completely free. The frontend is plain HTML, CSS and vanilla JavaScript with no build step, and the backend is a Google Apps Script web app running on your own Google account.

## How it works

```
Browser (index.html + app.js)
   │  POST {to, key, subject, html}  (Content-Type: text/plain to avoid a CORS preflight)
   ▼
Apps Script web app (apps-script/Code.gs)
   │  checks key against Script Properties, validates the address
   │  asks the GitHub API for the newest file in "Latest Resume/"
   ▼
GmailApp.sendEmail(...)  →  your subject and HTML body, plus that resume
```

## Project structure

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The single-page frontend |
| `config.example.js` | Config template with the default subject and body; copy it to `config.js` (gitignored) |
| `apps-script/Code.gs` | Backend: `doPost` handler that sends the email |
| `apps-script/template.html` | Fallback HTML body, used only if a request arrives without one |
| `Latest Resume/` | Upload your resume here (PDF, DOC or DOCX); the newest file is attached |

## Run locally

1. Copy the config template, then put your own default `SUBJECT` and `BODY_HTML` in it:
   ```sh
   cp config.example.js config.js
   ```
2. Serve the folder with any static server, for example:
   ```sh
   npx serve .
   # or
   python -m http.server 8000
   ```
3. Open the URL it prints.

While `APPS_SCRIPT_URL` in `config.js` is still the placeholder, the app runs in **demo mode**: the whole UI works, but nothing is sent.

## Setup later

- [ ] **Create the Apps Script project.** Go to [script.google.com](https://script.google.com), create a new project, paste in `apps-script/Code.gs`, then add an HTML file named `template` and paste in `apps-script/template.html`. That template and `DEFAULT_SUBJECT` are only fallbacks (and what `testSendToSelf` sends); normally the website sends the subject and body from the form.
- [ ] **Set the access key.** In the Apps Script editor, open *Project Settings → Script Properties* and add a property named `ACCESS_KEY` with a long random value. Never put it in the code.
- [ ] **Upload your resume.** Put a PDF, DOC or DOCX in the `Latest Resume` folder on GitHub (*Add file → Upload files*).
- [ ] **Create a GitHub token** (needed while the repo is private). On GitHub go to *Settings → Developer settings → Fine-grained tokens → Generate new token*. Under *Repository access* choose **Only select repositories → quick-mailer**, and under *Permissions* set **Contents: Read-only**. Add it as a Script Property named `GITHUB_TOKEN`. Tokens expire, so note the date and replace it before then. If the repo becomes public, the token is optional.
- [ ] **Authorize.** Run `testLatestResume` from the editor and approve the permissions (Gmail, and connecting to an external service). The log should show your resume's name. Then run `testSendToSelf` and check that the test email arrives with the resume attached.
- [ ] **Deploy as a web app.** Choose *Deploy → New deployment → Web app*, set **Execute as: Me** and **Who has access: Anyone**, then deploy and copy the `/exec` URL.
- [ ] **Connect the frontend.** Paste the URL into `APPS_SCRIPT_URL` in `config.js`, open the site, enter your access key once (it's saved in the browser), and send.

> After changing `Code.gs`, update the deployment (*Manage deployments → Edit → New version*) or the web app keeps running the old code.

## Notes

- **Limits:** a free Gmail account can send about 100 emails a day through Apps Script.
- **Security:** the web app URL is public, so the access key is what stops strangers from sending mail as you. Use a long random key and change it in Script Properties if it ever leaks.
- **Keep the repo clean:** real values (web app URL, access key, GitHub token) belong only in `config.js` (gitignored) or Script Properties, never in committed files.
- **Before making the repo public:** your resume in `Latest Resume/` would become public too, and deleting it later doesn't remove it from Git history.

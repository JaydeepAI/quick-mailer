# Quick Mailer

A tiny single-page site for sending one fixed email: type a recipient address, press **Send**, and a pre-written email with a fixed subject, body and attachment goes out from your own Gmail account. Because it's sent with `GmailApp`, it shows up in your Gmail **Sent** folder.

It's completely free. The frontend is plain HTML, CSS and vanilla JavaScript with no build step, and the backend is a Google Apps Script web app running on your own Google account.

## How it works

```
Browser (index.html + app.js)
   │  POST {to, key}  (Content-Type: text/plain to avoid a CORS preflight)
   ▼
Apps Script web app (apps-script/Code.gs)
   │  checks key against Script Properties, validates the address
   ▼
GmailApp.sendEmail(...)  →  fixed subject, template.html body, Drive attachment
```

## Project structure

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The single-page frontend |
| `config.example.js` | Config template; copy it to `config.js` (gitignored) |
| `apps-script/Code.gs` | Backend: `doPost` handler that sends the email |
| `apps-script/template.html` | HTML body of the email |

## Run locally

1. Copy the config template:
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

- [ ] **Create the Apps Script project.** Go to [script.google.com](https://script.google.com), create a new project, paste in `apps-script/Code.gs`, then add an HTML file named `template` and paste in `apps-script/template.html`. Edit the body text.
- [ ] **Set the subject.** Edit `SUBJECT` at the top of `Code.gs`, and put the same text in `SUBJECT` in your `config.js` so the preview matches.
- [ ] **Set the access key.** In the Apps Script editor, open *Project Settings → Script Properties* and add a property named `ACCESS_KEY` with a long random value. Never put it in the code.
- [ ] **Set the Drive file ID.** Upload the attachment to Google Drive and copy its ID from the share link (`https://drive.google.com/file/d/<FILE_ID>/view`). Paste it into `ATTACHMENT_FILE_ID` in the Apps Script editor, and set `ATTACHMENT_NAME` in `config.js` to the file's name.
- [ ] **Authorize.** Run `testSendToSelf` once from the editor, approve the Gmail and Drive permissions, and check that the test email arrives.
- [ ] **Deploy as a web app.** Choose *Deploy → New deployment → Web app*, set **Execute as: Me** and **Who has access: Anyone**, then deploy and copy the `/exec` URL.
- [ ] **Connect the frontend.** Paste the URL into `APPS_SCRIPT_URL` in `config.js`, open the site, enter your access key once (it's saved in the browser), and send.

> After changing `Code.gs`, update the deployment (*Manage deployments → Edit → New version*) or the web app keeps running the old code.

## Notes

- **Limits:** a free Gmail account can send about 100 emails a day through Apps Script.
- **Security:** the web app URL is public, so the access key is what stops strangers from sending mail as you. Use a long random key and change it in Script Properties if it ever leaks.
- **Keep the repo clean:** real values (web app URL, access key, Drive file ID) belong only in `config.js` (gitignored), Script Properties, or the Apps Script editor, never in committed files.

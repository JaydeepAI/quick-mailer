# Quick Mailer

A one-screen web app for sending a job application from your phone: open the site, type the recipient's address, press **Send**. The email goes out from your own Gmail account (so it shows up in **Sent**) with your latest resume attached.

Everything runs on free tiers: GitHub Pages hosts the page, and a Google Apps Script web app on your own Google account does the sending.

## How it works

```
GitHub Pages: index.html + app.js          (public, nothing personal in it)
   │  POST {key, action: "defaults"}  →  default subject + message + resume name
   │  POST {key, to, subject, html}   →  send
   │  (Content-Type: text/plain, so no CORS preflight)
   ▼
Apps Script web app: Code.gs + Personal.gs (runs as you)
   │  checks the key against Script Properties
   │  asks the GitHub API for the newest file in a private resume repo
   ▼
GmailApp.sendEmail(...)  →  your subject, HTML message and resume
```

- **Personal content stays private.** The default subject and message live in `apps-script/Personal.gs`, which is gitignored and only pushed to Apps Script. The page fetches them after you enter your access key.
- **Resume comes from a private repo.** Upload a PDF, DOC or DOCX to the `Latest Resume/` folder of a separate private repo; the most recently uploaded or updated file is attached.
- **The access key protects the endpoint.** The web app URL is public, so every request must carry the key, which is stored in Script Properties on the server and in `localStorage` on your devices.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The page (mobile-first, light and dark mode) |
| `config.js` | Public config: just the Apps Script web app URL |
| `apps-script/Code.gs` | Backend: `doPost` handler, GitHub resume lookup, Gmail send |
| `apps-script/Personal.example.gs` | Template for your gitignored `Personal.gs` |
| `apps-script/appsscript.json` | Apps Script manifest (web app runs as you, open to anyone with the key) |

## Run locally

```sh
npx serve .
```

While `APPS_SCRIPT_URL` in `config.js` is the placeholder, the page runs in **demo mode** and never sends anything.

## Setup

1. **Resume repo.** Create a private repo with a `Latest Resume/` folder and upload your resume. Set `GITHUB_REPO` in `Code.gs` to it.
2. **Personal defaults.** Copy `apps-script/Personal.example.gs` to `apps-script/Personal.gs` and write your subject and message.
3. **Apps Script project.** Enable the Apps Script API at [script.google.com/home/usersettings](https://script.google.com/home/usersettings), then:
   ```sh
   npm install -g @google/clasp
   clasp login
   clasp create-script --type standalone --title "Quick Mailer" --rootDir apps-script
   clasp push
   ```
4. **GitHub token.** Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to **only the resume repo** and **Contents: Read-only**.
5. **Script Properties.** In the Apps Script editor, open *Project Settings → Script Properties* and add `ACCESS_KEY` (a long random string) and `GITHUB_TOKEN`.
6. **Authorize.** Run `testLatestResume` in the editor and approve the permissions. Google shows "Google hasn't verified this app" for personal scripts: choose *Advanced → Go to Quick Mailer*. Then run `testSendToSelf`.
7. **Deploy.** `clasp create-deployment --description "v1"`, or *Deploy → New deployment → Web app* in the editor. Put the `/exec` URL in `config.js`.
8. **Host.** Push to GitHub and enable Pages (*Settings → Pages → Deploy from branch → main / root*).

After changing `Code.gs` or `Personal.gs`: `clasp push`, then update the existing deployment (`clasp update-deployment <deploymentId>`, or *Manage deployments → Edit → New version*) so the URL stays the same.

## Notes

- **Limits:** a free Gmail account can send about 100 emails a day through Apps Script.
- **Key leaked?** Change `ACCESS_KEY` in Script Properties, then enter the new key on your devices.
- **Token expiry:** fine-grained tokens expire. Replace `GITHUB_TOKEN` before then, or sending fails with a token error.

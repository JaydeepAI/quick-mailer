(function () {
  "use strict";

  var STORAGE_KEY = "quickMailer.accessKey";
  var PLACEHOLDER_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL";
  var REQUEST_TIMEOUT_MS = 30000;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var config = window.QUICK_MAILER_CONFIG || {};
  var hasConfigFile = Boolean(window.QUICK_MAILER_CONFIG);
  var backendUrl = String(config.APPS_SCRIPT_URL || "").trim();
  var demoMode = !isRealUrl(backendUrl);

  var els = {
    form: document.getElementById("send-form"),
    to: document.getElementById("to"),
    toError: document.getElementById("to-error"),
    key: document.getElementById("key"),
    toggleKey: document.getElementById("toggle-key"),
    send: document.getElementById("send"),
    sendLabel: document.querySelector("#send .label"),
    status: document.getElementById("status"),
    modeNote: document.getElementById("mode-note"),
    subject: document.getElementById("preview-subject"),
    attachment: document.getElementById("preview-attachment")
  };

  function isRealUrl(url) {
    if (!url || url.indexOf(PLACEHOLDER_URL) !== -1) return false;
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/.test(url);
  }

  // localStorage can throw (private mode, blocked storage); never let that break the page.
  function loadKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (e) { return ""; }
  }

  function saveKey(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  function setStatus(state, message) {
    els.status.dataset.state = state;
    els.status.textContent = message;
  }

  function setSending(isSending) {
    els.send.disabled = isSending;
    els.send.setAttribute("aria-busy", String(isSending));
    els.sendLabel.textContent = isSending ? "Sending…" : "Send";
  }

  function validateEmail() {
    var value = els.to.value.trim();
    var message = "";
    if (!value) message = "Enter a recipient email address.";
    else if (!EMAIL_RE.test(value)) message = "That doesn't look like a valid email address.";

    els.to.setAttribute("aria-invalid", String(Boolean(message)));
    els.toError.textContent = message;
    els.toError.hidden = !message;
    return message ? null : value;
  }

  function postToBackend(payload) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;

    // text/plain is a "simple" content type, so the browser skips the CORS
    // preflight that Apps Script web apps can't answer.
    return fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Server responded with HTTP " + res.status + ".");
        return res.text();
      })
      .then(function (text) {
        try { return JSON.parse(text); }
        catch (e) { throw new Error("Unexpected response from the server. Check the web app deployment and access settings."); }
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function handleSubmit(event) {
    event.preventDefault();

    var to = validateEmail();
    if (!to) { els.to.focus(); return; }

    var key = els.key.value.trim();
    saveKey(key);

    if (demoMode) {
      setStatus("demo", "Backend not configured yet. Demo mode: nothing was sent to " + to + ".");
      return;
    }

    if (!key) {
      setStatus("error", "Enter your access key first.");
      els.key.focus();
      return;
    }

    setSending(true);
    setStatus("sending", "Sending to " + to + "…");

    postToBackend({ to: to, key: key })
      .then(function (data) {
        if (data && data.ok) {
          setStatus("success", "Sent to " + to + ". It's in your Gmail Sent folder.");
          els.to.value = "";
        } else {
          setStatus("error", (data && data.error) || "The server couldn't send the email.");
        }
      })
      .catch(function (err) {
        var message = err && err.name === "AbortError"
          ? "The request timed out. Check your connection and try again."
          : (err && err.message) || "Network error. Check your connection and try again.";
        setStatus("error", message);
      })
      .finally(function () { setSending(false); });
  }

  function init() {
    els.subject.textContent = config.SUBJECT || "(subject not set)";
    els.attachment.textContent = config.ATTACHMENT_NAME || "(attachment not set)";
    els.key.value = loadKey();

    if (demoMode) {
      setStatus("demo", "Backend not configured yet. You can try the form; nothing will be sent.");
      els.modeNote.hidden = false;
      els.modeNote.textContent = hasConfigFile
        ? "Demo mode: set APPS_SCRIPT_URL in config.js to enable sending."
        : "Demo mode: config.js not found. Copy config.example.js to config.js.";
    }

    els.form.addEventListener("submit", handleSubmit);

    els.to.addEventListener("input", function () {
      if (els.to.getAttribute("aria-invalid") === "true") validateEmail();
    });

    els.key.addEventListener("change", function () { saveKey(els.key.value.trim()); });

    els.toggleKey.addEventListener("click", function () {
      var show = els.key.type === "password";
      els.key.type = show ? "text" : "password";
      els.toggleKey.textContent = show ? "Hide" : "Show";
      els.toggleKey.setAttribute("aria-pressed", String(show));
    });
  }

  init();
})();

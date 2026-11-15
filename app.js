(function () {
  "use strict";

  var STORAGE_KEY = "quickMailer.accessKey";
  var PLACEHOLDER_URL = "YOUR_APPS_SCRIPT_WEB_APP_URL";
  var REQUEST_TIMEOUT_MS = 45000;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var config = window.QUICK_MAILER_CONFIG || {};
  var backendUrl = String(config.APPS_SCRIPT_URL || "").trim();
  var demoMode = !isRealUrl(backendUrl);

  // Subject and message come from the backend (Personal.gs) once the key is
  // accepted.
  var defaults = null;

  var els = {
    form: document.getElementById("send-form"),
    to: document.getElementById("to"),
    toError: document.getElementById("to-error"),
    send: document.getElementById("send"),
    sendLabel: document.querySelector("#send .label"),
    status: document.getElementById("status"),
    subject: document.getElementById("subject"),
    subjectError: document.getElementById("subject-error"),
    body: document.getElementById("body"),
    bodyError: document.getElementById("body-error"),
    reset: document.getElementById("reset"),
    attachment: document.getElementById("attachment"),
    keyPanel: document.getElementById("key-panel"),
    keyState: document.getElementById("key-state"),
    key: document.getElementById("key"),
    toggleKey: document.getElementById("toggle-key"),
    saveKey: document.getElementById("save-key"),
    modeNote: document.getElementById("mode-note")
  };

  function isRealUrl(url) {
    if (!url || url.indexOf(PLACEHOLDER_URL) !== -1) return false;
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/.test(url);
  }

  // ---- storage (can throw in private mode; never let that break the page) ----

  function loadKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (e) { return ""; }
  }

  function storeKey(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  // ---- UI helpers ----

  function setStatus(state, message) {
    els.status.dataset.state = state;
    els.status.textContent = message;
  }

  function setSending(isSending) {
    els.send.disabled = isSending;
    els.send.setAttribute("aria-busy", String(isSending));
    els.sendLabel.textContent = isSending ? "Sending…" : "Send";
  }

  function setKeyState(text) {
    els.keyState.textContent = text ? "· " + text : "";
  }

  function setEditorEnabled(enabled) {
    els.subject.disabled = !enabled;
    els.body.contentEditable = String(enabled);
    els.body.setAttribute("aria-disabled", String(!enabled));
    els.reset.hidden = !enabled;
  }

  function showFieldError(input, errorEl, message) {
    input.setAttribute("aria-invalid", String(Boolean(message)));
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  // Put the cursor in "To" so you can paste + Enter without clicking. Leaves
  // focus alone if you were editing the subject, message or access key.
  function focusRecipient() {
    var active = document.activeElement;
    if (active === els.subject || active === els.body || active === els.key) return;
    if (active === els.to) return;
    try { els.to.focus({ preventScroll: true }); } catch (e) { els.to.focus(); }
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  // ---- validation ----

  function validateEmail() {
    var value = els.to.value.trim();
    var message = "";
    if (!value) message = "Enter a recipient email address.";
    else if (!EMAIL_RE.test(value)) message = "That doesn't look like a valid email address.";
    showFieldError(els.to, els.toError, message);
    return message ? null : value;
  }

  function validateSubject() {
    var value = els.subject.value.trim();
    showFieldError(els.subject, els.subjectError, value ? "" : "Enter a subject.");
    return value || null;
  }

  function validateBody() {
    var empty = !els.body.textContent.trim();
    showFieldError(els.body, els.bodyError, empty ? "The message can't be empty." : "");
    return empty ? null : els.body.innerHTML;
  }

  // ---- backend ----

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
        catch (e) { throw new Error("Unexpected response from the server. Check the web app deployment."); }
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") throw new Error("The request timed out. Try again.");
        if (err instanceof TypeError) throw new Error("Network error. Check your connection and try again.");
        throw err;
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function applyDefaults() {
    if (!defaults) return;
    els.subject.value = defaults.subject || "";
    els.body.innerHTML = defaults.html || "";
    showFieldError(els.subject, els.subjectError, "");
    showFieldError(els.body, els.bodyError, "");
  }

  function showResume(data) {
    if (data.resume) {
      var date = formatDate(data.resume.updated);
      els.attachment.textContent = data.resume.name + (date ? " · updated " + date : "");
    } else {
      els.attachment.textContent = data.resumeError || "Couldn't check the resume folder.";
    }
  }

  function loadDefaults() {
    var key = els.key.value.trim();
    if (!key) {
      setKeyState("not set");
      els.keyPanel.open = true;
      setStatus("idle", "Enter your access key below to get started.");
      return;
    }

    setStatus("sending", "Loading your email…");
    els.attachment.textContent = "Checking your resume folder…";

    postToBackend({ action: "defaults", key: key })
      .then(function (data) {
        if (!data || !data.ok) {
          setKeyState("not accepted");
          els.keyPanel.open = true;
          els.attachment.textContent = "—";
          setStatus("error", (data && data.error) || "Couldn't load your email.");
          return;
        }
        var firstLoad = !defaults;
        defaults = { subject: data.subject, html: data.html };
        if (firstLoad) applyDefaults();
        setEditorEnabled(true);
        showResume(data);
        setKeyState("saved");
        els.keyPanel.open = false;
        setStatus("idle", "Ready.");
      })
      .catch(function (err) {
        els.attachment.textContent = "—";
        setStatus("error", err.message);
      });
  }

  // ---- actions ----

  function handleSubmit(event) {
    event.preventDefault();

    var to = validateEmail();
    if (!to) { els.to.focus(); return; }

    var payload = { to: to, key: els.key.value.trim() };

    // Once defaults are loaded the editor is live, so send what's in it.
    // Before that, the backend falls back to the same defaults.
    if (defaults) {
      var subject = validateSubject();
      var html = validateBody();
      if (!subject) { els.subject.focus(); return; }
      if (!html) { els.body.focus(); return; }
      payload.subject = subject;
      payload.html = html;
    }

    if (demoMode) {
      setStatus("demo", "Demo mode: nothing was sent to " + to + ".");
      return;
    }

    if (!payload.key) {
      setStatus("error", "Enter your access key first.");
      els.keyPanel.open = true;
      els.key.focus();
      return;
    }

    setSending(true);
    setStatus("sending", "Sending to " + to + "…");

    postToBackend(payload)
      .then(function (data) {
        if (data && data.ok) {
          var withFile = data.attachment ? " with " + data.attachment : "";
          setStatus("success", "Sent to " + to + withFile + ".");
          els.to.value = "";
        } else {
          setStatus("error", (data && data.error) || "The server couldn't send the email.");
        }
      })
      .catch(function (err) { setStatus("error", err.message); })
      .finally(function () {
        setSending(false);
        els.to.focus();
      });
  }

  function saveKeyAndReload() {
    var key = els.key.value.trim();
    storeKey(key);
    if (!demoMode) loadDefaults();
  }

  // ---- init ----

  function init() {
    els.key.value = loadKey();

    els.form.addEventListener("submit", handleSubmit);

    // Refocus "To" whenever you come back to this tab/window.
    window.addEventListener("focus", focusRecipient);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") focusRecipient();
    });
    focusRecipient();
    els.to.addEventListener("input", function () {
      if (els.to.getAttribute("aria-invalid") === "true") validateEmail();
    });
    els.subject.addEventListener("input", function () {
      if (els.subject.getAttribute("aria-invalid") === "true") validateSubject();
    });
    els.body.addEventListener("input", function () {
      if (els.body.getAttribute("aria-invalid") === "true") validateBody();
    });
    els.reset.addEventListener("click", applyDefaults);
    els.saveKey.addEventListener("click", saveKeyAndReload);
    els.key.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); saveKeyAndReload(); }
    });
    els.toggleKey.addEventListener("click", function () {
      var show = els.key.type === "password";
      els.key.type = show ? "text" : "password";
      els.toggleKey.textContent = show ? "Hide" : "Show";
      els.toggleKey.setAttribute("aria-pressed", String(show));
    });

    if (demoMode) {
      defaults = {
        subject: "Demo subject",
        html: "<p>Demo mode. Your real message loads here once the backend is connected.</p>"
      };
      applyDefaults();
      setEditorEnabled(true);
      els.attachment.textContent = "Newest file in your resume folder";
      setKeyState(els.key.value ? "saved" : "");
      setStatus("demo", "Backend not configured yet. You can try the form; nothing will be sent.");
      els.modeNote.hidden = false;
      els.modeNote.textContent = "Demo mode: set APPS_SCRIPT_URL in config.js to enable sending.";
      return;
    }

    loadDefaults();
  }

  init();
})();

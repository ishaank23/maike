/* Maike lead capture.
   MAIKE.lead(payload) posts a JSON lead to MAIKE_CONFIG.leadEndpoint, adds page/UTM context, and queues it in
   localStorage if the network fails so it is retried on the next page load. Also wires the home-page form and
   every [data-wa] WhatsApp link. */
(function () {
  const CFG = window.MAIKE_CONFIG || {};
  const Q_KEY = "maike.leadQueue", ID_KEY = "maike.visitorId";

  function uid() { try { let v = localStorage.getItem(ID_KEY); if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(ID_KEY, v); } return v; } catch (e) { return "anon"; } }
  function utm() { const p = new URLSearchParams(location.search), o = {}; ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => { if (p.get(k)) o[k] = p.get(k); }); return o; }
  function normPhone(p) { let d = String(p || "").replace(/\D/g, ""); if (d.length === 10) d = "91" + d; if (d.length === 12 && d.startsWith("91")) return "+" + d; return d ? "+" + d : ""; }
  function queue() { try { return JSON.parse(localStorage.getItem(Q_KEY) || "[]"); } catch (e) { return []; } }
  function setQueue(q) { try { localStorage.setItem(Q_KEY, JSON.stringify(q.slice(-50))); } catch (e) {} }

  async function post(lead) {
    if (!CFG.leadEndpoint) { console.info("[maike] lead (no endpoint configured)", lead); return { ok: true, local: true }; }
    // Google Apps Script web apps can't answer a CORS preflight, so send a plain-text "simple" request there.
    // The response can't be read in that mode; a network failure still throws, so the retry queue still works.
    if (/script\.google\.com/.test(CFG.leadEndpoint)) {
      await fetch(CFG.leadEndpoint, { method: "POST", mode: "no-cors", body: JSON.stringify(lead) });
      return { ok: true };
    }
    const r = await fetch(CFG.leadEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lead) });
    if (!r.ok) throw new Error("lead endpoint " + r.status);
    return r.json().catch(() => ({ ok: true }));
  }

  async function lead(payload) {
    const l = Object.assign({
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      ts: new Date().toISOString(), visitor: uid(), page: location.pathname, referrer: document.referrer || "", city: CFG.city || "",
      ua: navigator.userAgent,
    }, utm(), payload);
    if (l.phone) l.phone = normPhone(l.phone);
    if (l.partner) l.partner = normPhone(l.partner);
    try { const res = await post(l); flush(); return res; }
    catch (e) { setQueue(queue().concat([l])); console.warn("[maike] lead queued", e.message); return { ok: false, queued: true }; }
  }

  async function flush() {
    const q = queue(); if (!q.length || !CFG.leadEndpoint) return;
    const rest = [];
    for (const l of q) { try { await post(l); } catch (e) { rest.push(l); } }
    setQueue(rest);
  }

  function waLink(text) { return "https://wa.me/" + (CFG.whatsappNumber || "") + "?text=" + encodeURIComponent(text || "Hi Maike"); }

  // When Kavitha will call, from the chosen option and the time now. Calls run 10 am to 7 pm.
  function callSlot(when, now) {
    now = now || new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const at = (dayOff, hr, min) => { const d = new Date(now); d.setDate(d.getDate() + dayOff); d.setHours(hr, min || 0, 0, 0); return d; };
    const soon = (mins) => { const d = new Date(now.getTime() + mins * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; };
    const tomorrow = { txt: "tomorrow morning, around 10 am", start: at(1, 10), exact: true };
    if (when === "tomorrow") return tomorrow;
    if (when === "evening") {
      if (h < 18) return { txt: "this evening, around 6 pm", start: at(0, 18), exact: true };
      if (h < 19) return { txt: "in the next half hour", start: soon(30), exact: false };
      return tomorrow;
    }
    if (h < 10) return { txt: "this morning, around 10 am", start: at(0, 10), exact: true };
    if (h < 18.5) return { txt: "within the hour", start: soon(45), exact: false };
    return tomorrow;
  }

  function wireForm() {
    const f = document.getElementById("leadform"); if (!f) return;
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("lf-msg"), btn = document.getElementById("lf-submit");
      const name = f.name.value.trim(), phone = f.phone.value.trim();
      if (!name) { msg.textContent = "Your name, so the nurse knows whom she’s calling."; f.name.focus(); return; }
      const digits = phone.replace(/\D/g, "").slice(-10);
      if (!/^[6-9]\d{9}$/.test(digits)) { msg.textContent = digits.length < 10 ? "A ten-digit mobile number, please." : "That doesn’t look like an Indian mobile number. It should start with 6, 7, 8 or 9."; f.phone.focus(); return; }
      btn.disabled = true; msg.textContent = "Sending…";
      const when = f.when ? f.when.value : "asap", slot = callSlot(when);
      const detail = { name, phone: normPhone(digits), stage: f.stage.value, date: f.date.value, plan: f.plan.value, area: f.area.value.trim(), when, whenTxt: slot.txt, slot, consent: f.consent.checked, note: "", entry: "", queued: false, handled: false };
      // The page fills detail.note (Kavitha's first message) so the WhatsApp we send says what the page shows.
      f.dispatchEvent(new CustomEvent("maike:lead-compose", { detail }));
      // Apps Script can take ~5 s to answer. Wait at most 1.5 s; the send carries on and queues itself if it fails.
      const res = await Promise.race([lead({ source: "home", event: "callback_request", name, phone: digits, stage: detail.stage, date: detail.date, plan: detail.plan, area: detail.area, when, call_slot: slot.txt, call_at: slot.start.toISOString(), note: detail.note, consent: detail.consent }), new Promise((r) => setTimeout(() => r({ ok: true, pending: true }), 1500))]);
      btn.disabled = false;
      detail.queued = !!res.queued;
      f.dispatchEvent(new CustomEvent("maike:lead-sent", { detail }));
      if (!detail.handled) {
        msg.style.color = "var(--sage)";
        msg.textContent = res.queued ? "Saved. We’ll send it the moment you’re back online." : `Done. A nurse calls you ${slot.txt}, and a WhatsApp confirmation is on its way.`;
        f.reset(); f.consent.checked = true;
      } else msg.textContent = "";
    });
  }

  function wireWa() {
    document.querySelectorAll("[data-wa]").forEach((a) => { a.href = waLink(a.dataset.wa); a.target = "_blank"; a.rel = "noopener"; if (!CFG.whatsappNumber) a.hidden = true; });
  }

  function analytics() {
    if (!CFG.gaId) return;
    const s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + CFG.gaId; document.head.appendChild(s);
    window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag("js", new Date()); gtag("config", CFG.gaId);
  }

  window.MAIKE = { lead, flush, waLink, callSlot, config: CFG };
  document.addEventListener("DOMContentLoaded", () => { wireForm(); wireWa(); analytics(); flush(); });
})();

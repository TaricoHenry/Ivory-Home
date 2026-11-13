// Ivory shared front-end. Every setting comes from window.IVORY, which the
// layout builds from _data/event.yml — nothing event-specific belongs here.
(() => {
  const config = window.IVORY || {};
  const features = config.features || {};
  const endpoints = config.endpoints || {};
  const copy = config.rsvp || {};
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = new URLSearchParams(window.location.search).get("token");

  // ---------------------------------------------------------------- helpers
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function endpoint(name, params = {}) {
    const path = endpoints[name];
    if (!path) throw new Error(`No "${name}" endpoint is configured for this event.`);
    const filled = path.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ""));
    return `${config.apiBase}${filled}`;
  }

  async function api(name, { params, method = "GET", body } = {}) {
    const response = await fetch(endpoint(name, params), {
      method,
      credentials: "omit",
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error?.message || "Something went wrong. Please try again.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function goToThankYou() {
    const url = new URL(config.thankYouUrl || "/thank-you/", window.location.origin);
    if (token) url.searchParams.set("token", token);
    window.location.href = url.toString();
  }

  // Links marked data-keep-token carry ?token= across pages.
  if (token) {
    $$("a[data-keep-token]").forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      url.searchParams.set("token", token);
      link.href = url.toString();
    });
  }

  // ------------------------------------------------------- reveal on load
  function initScrollReveals() {
    const items = $$("[data-scroll-reveal]");
    if (!items.length || !("IntersectionObserver" in window) || prefersReducedMotion) return;

    document.documentElement.dataset.scrollAnimations = "ready";
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.dataset.scrollVisible = "true";
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.2, rootMargin: "0px 0px -20% 0px" });
    items.forEach((item) => observer.observe(item));
  }

  const showPageItems = $$(".show-page");
  if (showPageItems.length) {
    setTimeout(() => {
      showPageItems.forEach((item) => { item.hidden = false; });
      initScrollReveals();
    }, 100);
  } else {
    initScrollReveals();
  }

  // ------------------------------------------------------- smooth scroll
  let scrollFrame = 0;
  const cancelScroll = () => {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  };

  $$("a[data-smooth-scroll]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = $(link.getAttribute("href"));
      if (!target) return;
      event.preventDefault();
      cancelScroll();
      history.pushState(null, "", link.getAttribute("href"));
      if (prefersReducedMotion) return target.scrollIntoView();

      const startY = window.scrollY;
      const distance = target.getBoundingClientRect().top;
      const duration = Math.min(Math.max(Math.abs(distance) * 0.75, 800), 1800);
      const start = performance.now();
      const step = (time) => {
        const p = Math.min((time - start) / duration, 1);
        const eased = p < 0.5 ? 4 * p ** 3 : 1 - ((-2 * p + 2) ** 3) / 2;
        window.scrollTo(0, startY + distance * (p * 0.2 + eased * 0.8));
        scrollFrame = p < 1 ? requestAnimationFrame(step) : 0;
      };
      scrollFrame = requestAnimationFrame(step);
    });
  });
  window.addEventListener("wheel", cancelScroll, { passive: true });
  window.addEventListener("touchstart", cancelScroll, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) cancelScroll();
  });

  // ------------------------------------------------------------ countdown
  function initCountdown() {
    const root = $("[data-countdown]");
    if (!root || !config.datetime) return;
    const target = new Date(config.datetime).getTime();
    const slots = ["days", "hours", "minutes", "seconds"].map((unit) => $(`[data-countdown-${unit}]`, root));
    const tick = () => {
      const distance = Math.max(target - Date.now(), 0);
      const values = [
        Math.floor(distance / 86_400_000),
        Math.floor((distance % 86_400_000) / 3_600_000),
        Math.floor((distance % 3_600_000) / 60_000),
        Math.floor((distance % 60_000) / 1000),
      ];
      slots.forEach((slot, i) => { if (slot) slot.textContent = String(values[i]).padStart(2, "0"); });
      if (distance === 0) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    tick();
  }
  if (features.countdown) initCountdown();

  // ---------------------------------------------------- contributions menu
  const dishForm = $("#dish-form");

  function updateDishCount() {
    const count = $$('input[name="dish"]:checked', dishForm).length;
    $("#dish-count").textContent = count ? `${count} ${count === 1 ? "item" : "items"} selected` : "Nothing selected yet";
  }

  async function loadFoodItems() {
    const container = $("#food-options");
    const message = $("#food-options-message");
    const template = $("#food-option-template");
    try {
      const result = await api("food_items");
      if (!Array.isArray(result.foodItems)) throw new Error("The menu response was not in the expected format.");
      const fragment = document.createDocumentFragment();
      result.foodItems.forEach((item, index) => {
        const node = template.content.cloneNode(true);
        $("input", node).value = item.id;
        $('[data-slot="number"]', node).textContent = String(index + 1).padStart(2, "0");
        $('[data-slot="name"]', node).textContent = item.name;
        $('[data-slot="unit"]', node).textContent = item.unit || "";
        fragment.append(node);
      });
      container.replaceChildren(fragment);
      message.textContent = result.foodItems.length ? "" : "There are no options available right now.";
    } catch (error) {
      console.error("Unable to load menu:", error);
      message.textContent = error.message || "Unable to load the menu. Please try again.";
    }
  }

  // --------------------------------------------------------- open RSVP
  function initOpenRsvp(form) {
    const message = $("#rsvp-message");
    const guestDetails = $("#guest-details");
    const nameInput = $("#guest-name");
    const plusYes = $("#plus-one");
    const plusNo = $("#plus-one-no");
    const plusDetails = $("#plus-one-details");
    const plusName = $("#plus-one-name");
    const bring = $("#bring");
    const prompt = $("#contribution-prompt");
    const submitWrapper = $("#submit-wrapper");
    const submitButton = $("#submit");
    let pending = null;

    if (dishForm) {
      loadFoodItems();
      dishForm.addEventListener("change", updateDishCount);
    }

    const updatePlusOne = () => {
      if (!plusYes) return;
      plusDetails.hidden = !plusYes.checked;
      plusName.required = plusYes.checked;
      if (!plusYes.checked) plusName.value = "";
    };

    const updateAttendance = (showMessage = true) => {
      const attending = $('input[name="attendance"]:checked', form)?.value === "yes";
      guestDetails.hidden = !attending;
      if (bring) bring.hidden = !attending;
      if (prompt) prompt.hidden = !attending;
      if (submitWrapper) submitWrapper.hidden = !attending;
      if (showMessage) message.textContent = attending ? "" : (copy.decline_message || "Maybe next time");
      if (!attending) {
        if (dishForm) { dishForm.reset(); updateDishCount(); }
        if (plusNo) plusNo.checked = true;
      }
      updatePlusOne();
    };

    form.addEventListener("change", (event) => {
      if (event.target.name === "plusOneChoice") return updatePlusOne();
      if (event.target.name === "attendance") updateAttendance();
    });
    form.addEventListener("reset", () => requestAnimationFrame(() => updateAttendance(false)));
    window.addEventListener("pageshow", () => updateAttendance(false));
    updateAttendance(false);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const attendance = new FormData(form).get("attendance");
      if (attendance !== "yes") {
        message.textContent = attendance === "no" ? (copy.decline_message || "Maybe next time") : "Please choose whether you’ll be joining us.";
        return;
      }
      const name = nameInput.value.trim();
      if (!name) {
        message.textContent = "Please enter your name.";
        return nameInput.focus();
      }
      const bringingPlusOne = Boolean(plusYes?.checked);
      const plusOneName = plusName?.value.trim() || "";
      if (bringingPlusOne && !plusOneName) {
        message.textContent = "Please enter your plus-one’s name.";
        return plusName.focus();
      }

      // The event is identified by api_base, not the body: the backends validate bodies strictly.
      const body = {
        name,
        plusOne: bringingPlusOne,
        ...(bringingPlusOne ? { plusOneName } : {}),
        items: dishForm
          ? $$('input[name="dish"]:checked', dishForm).map((input) => ({ foodItemId: input.value, quantity: 1, notes: "" }))
          : [],
      };
      // Same answers resubmitted (e.g. after a network error) reuse the requestId so the backend can de-duplicate.
      const fingerprint = JSON.stringify(body);
      if (!pending || pending.fingerprint !== fingerprint) pending = { requestId: crypto.randomUUID(), fingerprint };

      submitButton.disabled = true;
      message.textContent = "Submitting your response…";
      try {
        await api("registrations", { method: "POST", body: { ...body, requestId: pending.requestId } });
        message.textContent = "Thank you! Your response has been submitted.";
        pending = null;
        goToThankYou();
      } catch (error) {
        console.error("Unable to submit RSVP:", error);
        message.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  // ------------------------------------------------------ personal RSVP
  async function initPersonalRsvp(form) {
    if (!token) return; // generic link: details only, no form
    const message = $("#rsvp-message");
    const members = $("#rsvp-members");
    const submitButton = $("#submit");
    const greeting = $("[data-guest-greeting]");

    try {
      const status = await api("token_status", { params: { token } });
      if (!status.valid) return;
      const household = await api("token_details", { params: { token } });

      if (greeting && household.household) greeting.textContent = household.household;
      members.replaceChildren(...(household.members || []).map((member) => {
        const label = document.createElement("label");
        label.className = "flex cursor-pointer items-center justify-between gap-4 border border-field px-4 py-4 font-display text-lg transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-on-dark";
        label.textContent = member.personalizedAddy || member.name || "Guest";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "size-5 accent-[var(--color-highlight)]";
        input.dataset.memberId = member.memberId;
        input.checked = member.rsvp === "yes";
        label.append(input);
        return label;
      }));
      form.hidden = false;

      if (status.used) {
        form.classList.add("is-submitted");
        $$("input", form).forEach((input) => { input.disabled = true; });
        submitButton.disabled = true;
        message.textContent = "Your response has been received. Thank you!";
        return;
      }
    } catch (error) {
      console.error("Unable to load invitation:", error);
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submitButton.disabled = true;
      message.textContent = "Submitting your response…";
      const responses = $$("input[data-member-id]", form).map((input) => ({
        memberId: input.dataset.memberId,
        rsvp: input.checked ? "yes" : "no",
      }));
      try {
        await api("token_reply", { params: { token }, method: "POST", body: { responses } });
        goToThankYou();
      } catch (error) {
        console.error("Unable to submit RSVP:", error);
        message.textContent = error.message;
        submitButton.disabled = false;
      }
    });
  }

  // ------------------------------------------------------ booking slots
  // A `choice` field with a `schedule` gets its buttons built here: every
  // opening time for the next `days_ahead` days, in the event's time zone.
  // Some slots show as already booked so the calendar looks in demand. That is
  // cosmetic only, and fully deterministic (no Math.random): every visitor sees
  // the same slots taken on a given day, and a reload changes nothing.
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");

  // FNV-1a plus a final mix: a tiny, stable hash whose output looks random
  // but is always the same for the same text.
  function hashString(text) {
    let hash = 2166136261;
    for (const ch of text) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    return hash >>> 0;
  }

  function formatTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return { text: `${h % 12 || 12}:${pad(m)}`, meridiem: h < 12 ? "AM" : "PM" };
  }

  function formatRange(start, end) {
    const a = formatTime(start);
    const b = formatTime(end);
    return a.meridiem === b.meridiem
      ? `${a.text}–${b.text} ${b.meridiem}`
      : `${a.text} ${a.meridiem}–${b.text} ${b.meridiem}`;
  }

  // "Fills up as it nears". Each slot has a fixed number, 0–99, from its date,
  // time and `seed`. It shows as booked when that number is below a cut-off
  // that rises from `far_percent` (the last day shown) to `near_percent`
  // (tomorrow). A slot's number never changes and its cut-off only rises, so
  // once a slot is booked it stays booked on every later day.
  // Guards: at least `min_booked` slots are booked (the ones nearest their
  // cut-off), and at most `max_share` of all slots, so plenty stay open.
  function markBooked(days, rule = {}, daysAhead = 7) {
    const near = rule.near_percent ?? 50;
    const far = rule.far_percent ?? 15;
    const seed = rule.seed ?? "";
    const all = days.flatMap((day) => day.slots.map((slot) => {
      const step = daysAhead > 1 ? (day.daysAway - 1) / (daysAhead - 1) : 0;
      const cutoff = near + (far - near) * step;
      // Below 0: under the cut-off (booked). The closer to 0, the nearer it is to tipping.
      return { slot, margin: (hashString(`${seed}|${slot.value}`) % 100) - cutoff };
    }));
    if (all.length < 2) return;
    all.sort((a, b) => a.margin - b.margin);
    const minBooked = Math.min(rule.min_booked ?? 2, all.length - 1);
    const maxBooked = Math.max(minBooked, Math.floor(all.length * (rule.max_share ?? 0.5)));
    const booked = Math.min(Math.max(all.filter((s) => s.margin < 0).length, minBooked), maxBooked);
    all.slice(0, booked).forEach(({ slot }) => { slot.booked = true; });
  }

  // The slots on show on `today` (a UTC date holding the event's local date), all open.
  function windowDays(schedule, today, offset, daysAhead) {
    const hours = schedule.hours || {};
    const days = [];
    for (let i = 1; i <= daysAhead; i += 1) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
      const weekday = date.getUTCDay();
      const ranges = hours[DAY_KEYS[weekday]] || (weekday >= 1 && weekday <= 5 ? hours.weekdays : null) || [];
      if (!ranges.length) continue;
      const ymd = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
      days.push({
        daysAway: i,
        label: `${DAY_NAMES[weekday]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`,
        slots: ranges.map((range) => {
          const [start, end] = range.split("-").map((t) => t.trim());
          return { value: `${ymd}T${start}:00${offset}`, label: formatRange(start, end), booked: false };
        }),
      });
    }
    return days;
  }

  function scheduleDays(schedule) {
    const offset = /^[+-]\d{2}:\d{2}$/.test(schedule.utc_offset || "") ? schedule.utc_offset : "+00:00";
    const offsetMinutes = (offset[0] === "-" ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
    // "Now" shifted into the event's time zone, read back with the UTC getters.
    const now = new Date(Date.now() + offsetMinutes * 60000);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysAhead = schedule.days_ahead || 7;

    // A slot is booked if it was booked on any earlier day it was on show, so
    // the minimum-booked top-up can never make a slot look free again later.
    const booked = new Set();
    for (let back = daysAhead - 1; back >= 0; back -= 1) {
      const past = new Date(today.getTime() - back * 864e5);
      const view = windowDays(schedule, past, offset, daysAhead);
      markBooked(view, schedule.blocked, daysAhead);
      view.forEach((day) => day.slots.forEach((slot) => { if (slot.booked) booked.add(slot.value); }));
    }

    const days = windowDays(schedule, today, offset, daysAhead);
    days.forEach((day) => day.slots.forEach((slot) => { slot.booked = booked.has(slot.value); }));
    return days;
  }

  function renderSchedule(group) {
    const container = $("[data-schedule-slots]", group);
    let schedule;
    try {
      schedule = JSON.parse(group.dataset.schedule);
    } catch {
      return;
    }
    const required = group.hasAttribute("data-required");
    container.replaceChildren(...scheduleDays(schedule).map((day) => {
      const row = document.createElement("div");
      row.className = "grid gap-2";
      const heading = document.createElement("p");
      heading.className = "text-[11px] font-semibold tracking-[.12em] text-muted uppercase";
      heading.textContent = day.label;
      const grid = document.createElement("div");
      grid.className = "grid grid-cols-2 gap-3";
      grid.append(...day.slots.map((slot) => {
        const label = document.createElement("label");
        label.className = `group relative block min-w-0 ${slot.booked ? "cursor-not-allowed" : "cursor-pointer"}`;
        const input = document.createElement("input");
        Object.assign(input, { className: "peer sr-only", type: "radio", name: group.dataset.choiceGroup, value: slot.value, required, disabled: slot.booked });
        input.setAttribute("aria-label", `${day.label}, ${slot.label}${slot.booked ? ", already booked" : ""}`);
        const face = document.createElement("span");
        face.className = "flex w-full flex-col items-center justify-center gap-0.5 border border-field bg-paper/60 px-2 py-[13px] text-center text-[14px] font-semibold tracking-[.03em] text-ink transition-colors hover:border-primary peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-dark peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent peer-disabled:border-line peer-disabled:bg-line/50 peer-disabled:text-muted peer-disabled:hover:border-line";
        const time = document.createElement("span");
        time.textContent = slot.label;
        // Every slot gets a status line (Booked / Available / Selected) so all buttons are the same height.
        const tag = document.createElement("span");
        tag.className = "text-[9px] font-bold tracking-[.16em] uppercase";
        tag.setAttribute("aria-hidden", "true"); // the radio's aria-label already says whether it's booked
        if (slot.booked) {
          time.className = "line-through decoration-1";
          tag.textContent = "Booked";
        } else {
          const available = document.createElement("span");
          available.className = "text-accent group-has-checked:hidden";
          available.textContent = "Available";
          const selected = document.createElement("span");
          selected.className = "hidden text-highlight group-has-checked:inline";
          selected.textContent = "Selected";
          tag.append(available, selected);
        }
        face.append(time, tag);
        label.append(input, face);
        return label;
      }));
      row.append(heading, grid);
      return row;
    }));
  }

  // --------------------------------------------------------- form RSVP
  // Sends { <field name>: value, ..., requestId } to the submissions endpoint.
  function initFormRsvp(form) {
    $$("[data-schedule]", form).forEach(renderSchedule);
    const message = $("#rsvp-message");
    const submitButton = $("#submit");
    // Text-like controls plus button groups (type: choice), in page order.
    const controls = $$("input:not([type=radio]), select, textarea, [data-choice-group]", form);
    let pending = null;

    // Live greeting: the first-name input (data-greeting-source) fills [data-greeting-name].
    const greetingName = $("[data-greeting-name]");
    const greetingSource = $("[data-greeting-source]", form);
    if (greetingName && greetingSource) {
      const fallback = greetingName.dataset.fallback ?? greetingName.textContent;
      greetingSource.addEventListener("input", () => {
        greetingName.textContent = greetingSource.value.trim() || fallback;
      });
    }

    const problem = (field) => {
      if (field.dataset.choiceGroup) {
        const required = field.hasAttribute("data-required");
        const label = field.dataset.label.toLowerCase();
        const ask = label.startsWith("choose") || label.startsWith("pick") ? label : `choose ${label}`;
        return required && !$("input:checked", field) ? `Please ${ask}.` : "";
      }
      const value = field.value.trim();
      const label = $(`label[for="${field.id}"]`)?.firstChild?.textContent.trim() || field.name;
      if (field.required && !value) return `Please fill in ${label.toLowerCase()}.`;
      if (value && field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email address.";
      if (value && field.type === "tel" && value.replace(/\D/g, "").length < 7) return "Please enter a valid phone number, including the country code.";
      return "";
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      for (const field of controls) {
        const error = problem(field);
        if (error) {
          message.textContent = error;
          return (field.dataset.choiceGroup ? $("input:not(:disabled)", field) : field).focus();
        }
      }

      // Split inputs (data-join) are joined into one value, so the body keeps the API contract's keys.
      const body = {};
      for (const field of controls) {
        if (field.dataset.choiceGroup) body[field.dataset.choiceGroup] = $("input:checked", field)?.value || "";
        else if (field.dataset.join) body[field.dataset.join] = [body[field.dataset.join], field.value.trim()].filter(Boolean).join(" ");
        else if (field.name) body[field.name] = field.value.trim();
      }
      const fingerprint = JSON.stringify(body);
      if (!pending || pending.fingerprint !== fingerprint) pending = { requestId: crypto.randomUUID(), fingerprint };

      submitButton.disabled = true;
      message.textContent = "Submitting…";
      try {
        await api("submissions", { method: "POST", body: { ...body, requestId: pending.requestId } });
        pending = null;
        goToThankYou();
      } catch (error) {
        console.error("Unable to submit form:", error);
        message.textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const rsvpForm = $("#rsvp");
  if (rsvpForm?.dataset.rsvpMode === "form") initFormRsvp(rsvpForm);
  if (rsvpForm?.dataset.rsvpMode === "open") initOpenRsvp(rsvpForm);
  if (rsvpForm?.dataset.rsvpMode === "personal") initPersonalRsvp(rsvpForm);
})();

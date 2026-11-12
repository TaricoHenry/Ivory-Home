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

  // --------------------------------------------------------- form RSVP
  // Sends { <field name>: value, ..., requestId } to the submissions endpoint.
  function initFormRsvp(form) {
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
        return required && !$("input:checked", field) ? `Please choose ${field.dataset.label.toLowerCase()}.` : "";
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
          return (field.dataset.choiceGroup ? $("input", field) : field).focus();
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

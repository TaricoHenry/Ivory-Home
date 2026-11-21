document.addEventListener("DOMContentLoaded", () => {
  const eventCards = document.querySelectorAll("[data-event-card]");
  const contactButton = document.querySelector("#contact-button");
  const contactMenu = document.querySelector("#contact-menu");
  const emailLink = document.querySelector("#email-link");

  const setContactMenuOpen = (isOpen) => {
    if (!contactButton || !contactMenu) {
      return;
    }

    contactMenu.dataset.open = String(isOpen);
    contactButton.setAttribute("aria-expanded", String(isOpen));
  };

  contactButton?.addEventListener("click", () => {
    setContactMenuOpen(contactMenu.dataset.open !== "true");
  });

  document.addEventListener("click", (event) => {
    if (contactMenu && !contactMenu.contains(event.target)) {
      setContactMenuOpen(false);
    }
  });

  if (!eventCards.length) {
    return;
  }

  const contactSection = document.querySelector("#contact");
  const contactHeading = document.querySelector("[data-contact-title]");
  const whatsappLink = document.querySelector("[data-whatsapp-link]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Clicking a tile picks that occasion, personalises the contact section
  // (heading, email subject, WhatsApp message) and scrolls down to it.
  eventCards.forEach((card) => {
    card.addEventListener("click", () => {
      const selectedEvent = card.dataset.eventType;

      eventCards.forEach((currentCard) => {
        const isSelected = currentCard === card;

        currentCard.dataset.selected = String(isSelected);
        currentCard.setAttribute("aria-pressed", String(isSelected));
      });

      if (emailLink) {
        const subject = encodeURIComponent(
          `${selectedEvent} digital invitation enquiry`
        );

        emailLink.href = `mailto:sales@ivory-gy.com?subject=${subject}`;
      }

      if (whatsappLink && card.dataset.enquiry) {
        const message = encodeURIComponent(
          `Hello Ivory Invitations, I'd like to enquire about a digital invitation for ${card.dataset.enquiry}.`
        );

        whatsappLink.href = `https://wa.me/5927069433?text=${message}`;
      }

      if (contactHeading && card.dataset.contactHeading) {
        contactHeading.textContent = card.dataset.contactHeading;

        if (!reduceMotion) {
          contactHeading.animate(
            [
              { opacity: 0, transform: "translateY(16px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 800, delay: 350, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" }
          );
        }
      }

      contactSection?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });
});

/*
 * Home hero showcase (index.html, _data/showcase.yml).
 * The section is taller than the screen and its stage is sticky, so scrolling
 * through it gives a progress value from 0 to 1 that drives each piece:
 *   0.00–0.18  intro text fades out
 *   0.04–0.32  laptop slides off to the right
 *   0.12–0.82  phone spins once while moving to the end spot on the left
 *   0.78–0.92  outro text fades in
 * Change the numbers in TIMING to retime it.
 */
(() => {
  const root = document.querySelector("[data-hero-showcase]");
  if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const TIMING = {
    intro: [0, 0.18],
    laptop: [0.04, 0.32],
    phone: [0.12, 0.82],
    outro: [0.78, 0.92],
  };

  const layout = root.querySelector(".hero-layout");
  const intro = root.querySelector("[data-hero-intro]");
  const outro = root.querySelector("[data-hero-outro]");
  const laptop = root.querySelector("[data-hero-laptop]");
  const phone = root.querySelector("[data-hero-phone]");
  const phoneEnd = root.querySelector("[data-hero-phone-end]");
  const flip = root.querySelector("[data-hero-flip]");
  const faceStart = root.querySelector("[data-face-start]");
  const faceEnd = root.querySelector("[data-face-end]");
  const frameImg = root.querySelector("[data-frame-count]");

  const clamp = (value) => Math.min(1, Math.max(0, value));
  const span = (p, [from, to]) => clamp((p - from) / (to - from));
  const easeIn = (t) => t * t * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Rendered spin: build the frame list and preload it so swaps don't flicker.
  let frames = [];
  let currentFrame = 0;
  if (frameImg) {
    const { framePath, frameCount, frameExt } = frameImg.dataset;
    frames = Array.from({ length: Number(frameCount) }, (_, i) =>
      `${framePath}${String(i + 1).padStart(3, "0")}.${frameExt}`
    );
    frames.forEach((src) => { new Image().src = src; });
    const fitAspect = () => {
      if (frameImg.naturalWidth) {
        layout.style.setProperty("--phone-aspect", `${frameImg.naturalWidth} / ${frameImg.naturalHeight}`);
        measure();
        update();
      }
    };
    frameImg.complete ? requestAnimationFrame(fitAspect) : frameImg.addEventListener("load", fitAspect, { once: true });
  }

  // Distances, measured with nothing moved: phone start -> end spot, laptop -> off screen.
  let move = { x: 0, y: 0, scale: 1 };
  let laptopExit = 0;

  function measure() {
    phone.style.transform = "";
    laptop.style.transform = "";
    const from = phone.getBoundingClientRect();
    const to = phoneEnd.getBoundingClientRect();
    move = {
      x: to.left + to.width / 2 - (from.left + from.width / 2),
      y: to.top + to.height / 2 - (from.top + from.height / 2),
      scale: to.height / from.height,
    };
    laptopExit = window.innerWidth - laptop.getBoundingClientRect().left + 40;
  }

  function update() {
    frame = 0;
    const scrollable = root.offsetHeight - window.innerHeight;
    const p = scrollable > 0 ? clamp(-root.getBoundingClientRect().top / scrollable) : 0;

    const tIntro = span(p, TIMING.intro);
    intro.style.opacity = String(1 - tIntro);
    intro.style.transform = `translate3d(0, ${-40 * tIntro}px, 0)`;
    intro.style.pointerEvents = tIntro > 0.5 ? "none" : "";

    const tLaptop = easeIn(span(p, TIMING.laptop));
    laptop.style.transform = `translate3d(${laptopExit * tLaptop}px, 0, 0)`;

    const tPhone = easeInOut(span(p, TIMING.phone));
    const scale = 1 + (move.scale - 1) * tPhone;
    phone.style.transform = `translate3d(${move.x * tPhone}px, ${move.y * tPhone}px, 0) scale(${scale})`;

    if (frames.length) {
      const index = Math.round(tPhone * (frames.length - 1));
      if (index !== currentFrame) {
        currentFrame = index;
        frameImg.src = frames[index];
      }
    } else if (flip) {
      // One full turn; the start image shows for the first half, the end image after.
      const angle = tPhone * 360;
      flip.style.transform = `rotateY(${angle}deg)`;
      const showEnd = angle >= 180;
      faceStart.hidden = showEnd;
      faceEnd.hidden = !showEnd;
    }

    const tOutro = span(p, TIMING.outro);
    outro.style.opacity = String(tOutro);
    outro.style.transform = `translate3d(0, ${30 * (1 - tOutro)}px, 0)`;
    outro.style.pointerEvents = tOutro > 0.5 ? "" : "none";
  }

  // "See how it works": scroll slowly to where the outro has fully appeared, so the
  // whole animation plays. Any wheel, touch or key press hands control back.
  const PLAY_DURATION = 3500; // ms
  const playLink = root.querySelector("[data-hero-play]");
  let playFrame = 0;
  const stopPlay = () => {
    if (playFrame) cancelAnimationFrame(playFrame);
    playFrame = 0;
  };
  ["wheel", "touchstart", "keydown", "mousedown"].forEach((type) =>
    window.addEventListener(type, stopPlay, { passive: true })
  );
  playLink?.addEventListener("click", (event) => {
    event.preventDefault();
    stopPlay();
    const sectionTop = root.getBoundingClientRect().top + window.scrollY;
    const target = sectionTop + (root.offsetHeight - window.innerHeight) * TIMING.outro[1];
    const start = window.scrollY;
    const startTime = performance.now();
    // Mostly steady speed (so the spin isn't rushed), with soft start and stop.
    const ease = (t) => 0.7 * t + 0.3 * (-(Math.cos(Math.PI * t) - 1) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / PLAY_DURATION);
      window.scrollTo({ top: start + (target - start) * ease(t), behavior: "instant" });
      playFrame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    playFrame = requestAnimationFrame(step);
  });

  let frame = 0;
  const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", () => { measure(); requestUpdate(); });
  measure();
  update();
})();

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
    });
  });
});
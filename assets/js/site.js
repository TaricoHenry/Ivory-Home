document.addEventListener("DOMContentLoaded", () => {
  const eventCards = document.querySelectorAll("[data-event-card]");
  const selectionMessage = document.querySelector(
    "#event-selection-message"
  );
  const contactButton = document.querySelector("#contact-button");

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

      if (selectionMessage) {
        selectionMessage.textContent = `${selectedEvent} selected`;
      }

      if (contactButton) {
        const subject = encodeURIComponent(
          `${selectedEvent} digital invitation enquiry`
        );

        contactButton.href = `mailto:hello@example.com?subject=${subject}`;
      }
    });
  });
});
const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

const shotData = {
  schedule: {
    src: 'assets/schedule.webp',
    alt: '86 Chaos Time Clock and Schedule screen',
    title: 'Time Clock & Schedule',
    body: 'A real shift view with Kitchen 10a-10p, trade board, request off, month shifts, and schedule builder access.'
  },
  prep: {
    src: 'assets/prep.webp',
    alt: '86 Chaos Prep and Tasks screen',
    title: 'Prep & Tasks',
    body: 'Prep work is populated with kitchen items like Pull soups, Ranch, Bacon, Dressings, Pull bread, Pull delis, Wings, Green peppers, and Onion.'
  },
  recipes: {
    src: 'assets/recipes.webp',
    alt: '86 Chaos Recipe Book screen',
    title: 'Recipe Book',
    body: 'Recipe Book shows working kitchen specs such as Beer Cheese, Beer Dip, Cheesy Potato Bacon Soup, Chili, and House Ranch.'
  },
  inventory: {
    src: 'assets/inventory.webp',
    alt: '86 Chaos Inventory and Invoice History screen',
    title: 'Inventory & Invoices',
    body: 'Inventory shows vendor and invoice history with Performance Foodservice examples, invoice totals, print controls, and burn log access.'
  },
  financials: {
    src: 'assets/financials.webp',
    alt: '86 Chaos Financial Center screen',
    title: 'Financial Center',
    body: 'Financial Center previews daily close, labor, COGS, profit, cash variance, food/beverage targets, and needs-attention alerts.'
  },
  maintenance: {
    src: 'assets/maintenance.webp',
    alt: '86 Chaos Maintenance Center screen',
    title: 'Maintenance Center',
    body: 'Maintenance Center shows an actual repair-board style flow for Fryer #2, high-priority status, preventative maintenance, and issue notes.'
  }
};

const shotButtons = document.querySelectorAll('[data-shot]');
const mainShot = document.querySelector('[data-main-shot]');
const shotNotes = document.querySelector('[data-shot-notes]');

shotButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.shot;
    const shot = shotData[key];
    if (!shot || !mainShot || !shotNotes) return;

    shotButtons.forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');

    mainShot.animate([
      { opacity: 0.25, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 220, easing: 'ease-out' });

    mainShot.src = shot.src;
    mainShot.alt = shot.alt;
    shotNotes.innerHTML = `<h3>${shot.title}</h3><p>${shot.body}</p>`;
  });
});

const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('is-visible'));
}

const betaForm = document.querySelector('[data-beta-form]');
const formStatus = document.querySelector('[data-form-status]');
const submitButton = betaForm?.querySelector('button[type="submit"]');

function setFormStatus(message, type = '') {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.classList.remove('success', 'error');
  if (type) formStatus.classList.add(type);
}

if (betaForm && formStatus) {
  betaForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const endpoint = betaForm.getAttribute('action') || '/api/beta-application';
    const originalText = submitButton?.dataset.submitText || submitButton?.textContent || 'Apply for Founder Beta';
    const formData = new FormData(betaForm);
    const payload = Object.fromEntries(formData.entries());

    if (payload.website) return;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';
    }
    setFormStatus('Sending your beta request...', '');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok === false) {
        throw new Error(result.message || 'The form could not send right now.');
      }

      betaForm.reset();
      setFormStatus(result.message || 'Thanks. Your beta request was sent.', 'success');
    } catch (error) {
      setFormStatus(error.message || 'The form could not send right now. Please try again in a few minutes.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

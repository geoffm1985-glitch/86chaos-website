const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.addEventListener('click', (event) => {
    if (event.target.matches('a')) {
      navLinks.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

const shotData = {
  schedule: {
    src: 'assets/schedule.webp',
    alt: '86 Chaos Time Clock and Schedule screen',
    title: 'Time Clock & Schedule',
    body: 'Clock in, view shifts, request off, trade shifts, and keep the schedule in everyone’s pocket.'
  },
  prep: {
    src: 'assets/prep.webp',
    alt: '86 Chaos Prep and Tasks screen',
    title: 'Prep & Tasks',
    body: 'Food prep, line checks, daily tasks, weekly tasks, and monthly tasks stay organized by date and station.'
  },
  recipes: {
    src: 'assets/recipes.webp',
    alt: '86 Chaos Recipe Book screen',
    title: 'Recipe Book',
    body: 'Search recipes, ingredients, specs, yields, and uploaded recipe files from the same kitchen workspace.'
  },
  inventory: {
    src: 'assets/inventory.webp',
    alt: '86 Chaos Inventory and Invoice History screen',
    title: 'Inventory & Invoices',
    body: 'Counts, orders, vendors, invoices, burn log, and inventory history live where managers can actually use them.'
  },
  financials: {
    src: 'assets/financials.webp',
    alt: '86 Chaos Financial Center screen',
    title: 'Financial Center',
    body: 'Daily close, sales mix, labor, tips, COGS, expenses, and payroll signals come together in one command center.'
  },
  maintenance: {
    src: 'assets/maintenance.webp',
    alt: '86 Chaos Maintenance Center screen',
    title: 'Maintenance Center',
    body: 'Track repairs, preventative maintenance, vendors, costs, and urgent equipment issues before they become service killers.'
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

    mainShot.animate([{ opacity: 0.25, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 260,
      easing: 'ease-out'
    });
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

  reveals.forEach((el) => observer.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-visible'));
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

    const endpoint = betaForm.dataset.endpoint || betaForm.getAttribute('action') || '/api/beta-application';
    const originalText = submitButton?.dataset.submitText || submitButton?.textContent || 'Send beta request';
    const formData = new FormData(betaForm);
    const payload = Object.fromEntries(formData.entries());

    if (payload.website) return;

    betaForm.classList.add('is-sending');
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
      betaForm.classList.remove('is-sending');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}


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
  prep: {
    src: 'assets/prep.webp',
    alt: '86 Chaos Prep and Tasks screen with restaurant prep data',
    title: 'Prep & Tasks',
    body: 'Stations, quantities, completion status, print controls, and mark-done actions show an active kitchen list instead of empty test rows.'
  },
  schedule: {
    src: 'assets/schedule.webp',
    alt: '86 Chaos Time Clock and Schedule screen with working restaurant data',
    title: 'Time Clock & Schedule',
    body: 'My Schedule, month shifts, trade board, request off, and clock-in flow make staffing information visible without manager guesswork.'
  },
  recipes: {
    src: 'assets/recipes.webp',
    alt: '86 Chaos Recipe Book screen with realistic restaurant recipes',
    title: 'Recipe Book',
    body: 'Recipes include categories, prep times, and yields for real bar-and-grill items like Beer Cheese, Chili, House Ranch, and Sicilian Stuffed Chicken.'
  },
  inventory: {
    src: 'assets/inventory.webp',
    alt: '86 Chaos Inventory and Invoice History screen with vendor invoices',
    title: 'Inventory & Invoices',
    body: 'Vendor invoices, dates, totals, processed-by records, print controls, and burn log access make purchasing history easier to scan.'
  },
  financials: {
    src: 'assets/financials.webp',
    alt: '86 Chaos Financial Center screen with sales, prime cost, labor, and cash variance',
    title: 'Financial Center',
    body: 'Net sales, prime cost, labor, food, beverage, cash variance, and needs-attention items turn daily close into owner-ready signals.'
  },
  maintenance: {
    src: 'assets/maintenance.webp',
    alt: '86 Chaos Maintenance Center screen with equipment repairs',
    title: 'Maintenance Center',
    body: 'Repair board items, priority badges, reporters, dates, and costs help equipment issues stop disappearing into hallway conversations.'
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
    shotNotes.innerHTML = `<span class="eyebrow">${shot.title}</span><h3>${shot.title}</h3><p>${shot.body}</p>`;
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
  }, { threshold: 0.10 });
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


const roiMinutes = document.querySelector('[data-roi-minutes]');
const roiRate = document.querySelector('[data-roi-rate]');
const roiDays = document.querySelector('[data-roi-days]');
const roiResult = document.querySelector('[data-roi-result]');

function updateRoiCalculator() {
  if (!roiMinutes || !roiRate || !roiDays || !roiResult) return;
  const minutes = Math.max(0, Number(roiMinutes.value || 0));
  const rate = Math.max(0, Number(roiRate.value || 0));
  const days = Math.max(0, Number(roiDays.value || 0));
  const savings = (minutes / 60) * rate * days;
  roiResult.textContent = savings.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

[roiMinutes, roiRate, roiDays].forEach((input) => {
  if (input) input.addEventListener('input', updateRoiCalculator);
});
updateRoiCalculator();

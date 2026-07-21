
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
    const originalText = submitButton?.dataset.submitText || submitButton?.textContent || 'Apply Free';
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


// Clickable poster-style comparison columns.
(function () {
  function initPosterComparisonColumns() {
    document.querySelectorAll(".comparison-poster-grid").forEach(function (chart) {
      if (chart.dataset.posterColumnReady === "true") return;

      var columns = Array.from(chart.querySelectorAll(":scope > .poster-col"));
      if (columns.length < 2) return;

      var cells = Array.from(chart.querySelectorAll(":scope > .poster-mark, :scope > .poster-cell"));
      if (!cells.length) return;

      chart.dataset.posterColumnSelectable = "true";
      chart.dataset.posterColumnReady = "true";

      function clearSelection() {
        chart.classList.remove("has-poster-column-selection");
        chart.removeAttribute("data-selected-poster-column");
        columns.concat(cells).forEach(function (el) {
          el.classList.remove("is-poster-column-selected", "is-poster-column-muted");
        });
        columns.forEach(function (col) {
          col.setAttribute("aria-pressed", "false");
        });
      }

      function selectColumn(index) {
        var current = Number(chart.getAttribute("data-selected-poster-column") || 0);
        var selected = index + 1;

        if (current === selected) {
          clearSelection();
          return;
        }

        clearSelection();
        chart.classList.add("has-poster-column-selection");
        chart.setAttribute("data-selected-poster-column", String(selected));

        columns.forEach(function (col, colIndex) {
          col.classList.add(colIndex === index ? "is-poster-column-selected" : "is-poster-column-muted");
          col.setAttribute("aria-pressed", colIndex === index ? "true" : "false");
        });

        cells.forEach(function (cell, cellIndex) {
          var colIndex = cellIndex % columns.length;
          cell.classList.add(colIndex === index ? "is-poster-column-selected" : "is-poster-column-muted");
        });
      }

      columns.forEach(function (col, index) {
        var name = (col.querySelector("h3")?.textContent || "column").replace(/\s+/g, " ").trim();
        col.setAttribute("role", "button");
        col.setAttribute("tabindex", "0");
        col.setAttribute("aria-pressed", "false");
        col.setAttribute("aria-label", "Highlight " + name + " column");
        col.title = "Highlight " + name;

        col.addEventListener("click", function () {
          selectColumn(index);
        });

        col.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectColumn(index);
        });
      });

      cells.forEach(function (cell, cellIndex) {
        var colIndex = cellIndex % columns.length;
        var name = (columns[colIndex].querySelector("h3")?.textContent || "column").replace(/\s+/g, " ").trim();
        cell.setAttribute("data-poster-column", String(colIndex + 1));
        cell.title = "Highlight " + name;
        cell.addEventListener("click", function () {
          selectColumn(colIndex);
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPosterComparisonColumns);
  } else {
    initPosterComparisonColumns();
  }
})();

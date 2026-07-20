
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

// Interactive comparison tables: click any data column to bring it forward.
const comparisonTables = document.querySelectorAll('.comparison-table');

comparisonTables.forEach((table, tableIndex) => {
  const headerRow = table.tHead?.rows?.[0];
  if (!headerRow || headerRow.cells.length < 2) return;

  const wrapper = table.closest('.comparison-table-wrap');
  const hint = document.createElement('p');
  const hintId = `comparison-hint-${tableIndex + 1}`;

  hint.id = hintId;
  hint.className = 'comparison-click-hint';
  hint.textContent = 'Click any plan or comparison column to highlight it. Click the same column again to clear.';

  if (wrapper) {
    wrapper.insertAdjacentElement('afterend', hint);
  } else {
    table.insertAdjacentElement('afterend', hint);
  }

  table.dataset.columnSelectable = 'true';
  table.setAttribute('aria-describedby', hintId);

  const headerCells = Array.from(headerRow.cells);
  headerCells.slice(1).forEach((headerCell, offset) => {
    const columnIndex = offset + 1;
    const columnName = headerCell.textContent.trim() || `Column ${columnIndex}`;

    headerCell.classList.add('column-select-control');
    headerCell.setAttribute('role', 'button');
    headerCell.setAttribute('tabindex', '0');
    headerCell.setAttribute('aria-pressed', 'false');
    headerCell.setAttribute('aria-label', `Highlight ${columnName} column`);
    headerCell.title = `Highlight ${columnName}`;
  });

  function clearColumnSelection() {
    table.classList.remove('has-column-selection');
    table.removeAttribute('data-selected-column');

    table.querySelectorAll('.is-column-selected, .is-column-muted').forEach((cell) => {
      cell.classList.remove('is-column-selected', 'is-column-muted');
    });

    headerCells.slice(1).forEach((headerCell) => {
      headerCell.setAttribute('aria-pressed', 'false');
    });
  }

  function selectColumn(columnIndex) {
    const currentColumn = Number(table.dataset.selectedColumn || 0);
    if (currentColumn === columnIndex) {
      clearColumnSelection();
      return;
    }

    clearColumnSelection();
    table.classList.add('has-column-selection');
    table.dataset.selectedColumn = String(columnIndex);

    Array.from(table.rows).forEach((row) => {
      Array.from(row.cells).forEach((cell, cellIndex) => {
        if (cellIndex === 0) return;
        cell.classList.add(cellIndex === columnIndex ? 'is-column-selected' : 'is-column-muted');
      });
    });

    headerCells[columnIndex]?.setAttribute('aria-pressed', 'true');
  }

  table.addEventListener('click', (event) => {
    const cell = event.target.closest('th, td');
    if (!cell || !table.contains(cell) || cell.cellIndex === 0) return;
    selectColumn(cell.cellIndex);
  });

  headerCells.slice(1).forEach((headerCell) => {
    headerCell.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectColumn(headerCell.cellIndex);
    });
  });
});


// V63 mobile comparison labels and safer mobile interactions.
(function () {
  function labelComparisonTables() {
    var tables = document.querySelectorAll(".comparison-table, .real-app-comparison-table");
    tables.forEach(function (table) {
      var headers = Array.from(table.querySelectorAll("thead th")).map(function (th) {
        return (th.innerText || th.textContent || "").replace(/\s+/g, " ").trim();
      });

      Array.from(table.querySelectorAll("tbody tr")).forEach(function (row) {
        Array.from(row.children).forEach(function (cell, index) {
          if (index === 0) {
            cell.setAttribute("data-row-title", "true");
            return;
          }

          var label = headers[index] || "Plan";
          if (!cell.getAttribute("data-label")) {
            cell.setAttribute("data-label", label);
          }

          cell.setAttribute("data-comparison-cell", "true");
        });
      });
    });
  }

  function updateMobileState() {
    var isMobile = window.matchMedia("(max-width: 920px)").matches;
    document.documentElement.toggleAttribute("data-mobile-layout", isMobile);
  }

  function closeMobileNavOnLinkTap() {
    var nav = document.querySelector(".nav-links");
    if (!nav) return;

    nav.addEventListener("click", function (event) {
      var link = event.target.closest("a");
      if (!link) return;
      if (window.matchMedia("(max-width: 920px)").matches) {
        nav.classList.remove("is-open");
        var toggle = document.querySelector(".nav-toggle");
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initMobilePass() {
    labelComparisonTables();
    updateMobileState();
    closeMobileNavOnLinkTap();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobilePass);
  } else {
    initMobilePass();
  }

  window.addEventListener("resize", updateMobileState, { passive: true });
})();


// V64: shorten mobile comparison labels so compact charts do not become giant blocks.
(function () {
  function shortLabel(label) {
    var cleaned = String(label || "").replace(/\s+/g, " ").trim();
    var lower = cleaned.toLowerCase();

    if (lower.includes("86 chaos")) return "86 Chaos";
    if (lower.includes("smart kitchen")) return "Smart Kitchen";
    if (lower.includes("owner pro")) return "Owner Pro";
    if (lower.includes("operations")) return "Operations";
    if (lower.includes("shift")) return "Shift";
    if (lower.includes("7shifts")) return "7shifts";
    if (lower.includes("hotschedules")) return "HotSchedules";
    if (lower.includes("marketman")) return "MarketMan";
    if (lower.includes("marginedge")) return "MarginEdge";
    if (lower.includes("restaurant365")) return "R365";
    if (lower.includes("toast")) return "POS";
    if (lower.includes("square")) return "POS";
    return cleaned.split(" ").slice(0, 3).join(" ");
  }

  function relabelComparisonTables() {
    document.querySelectorAll(".comparison-table, .real-app-comparison-table").forEach(function (table) {
      var headers = Array.from(table.querySelectorAll("thead th")).map(function (th) {
        return shortLabel(th.innerText || th.textContent || "");
      });

      table.querySelectorAll("tbody tr").forEach(function (row) {
        Array.from(row.children).forEach(function (cell, index) {
          if (index === 0) return;
          cell.setAttribute("data-label", headers[index] || "Plan");
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", relabelComparisonTables);
  } else {
    relabelComparisonTables();
  }
})();


// V66: replace mobile comparison tables with compact expandable comparison rows.
(function () {
  function shortHeader(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    var lower = t.toLowerCase();

    if (lower.includes("86 chaos")) return "86 Chaos";
    if (lower.includes("smart kitchen")) return "Smart Kitchen";
    if (lower.includes("owner pro")) return "Owner Pro";
    if (lower === "operations" || lower.includes("operations")) return "Operations";
    if (lower === "shift" || lower.includes("shift")) return "Shift";
    if (lower.includes("7shifts")) return "7shifts";
    if (lower.includes("hotschedules")) return "HotSchedules";
    if (lower.includes("marketman")) return "MarketMan";
    if (lower.includes("marginedge")) return "MarginEdge";
    if (lower.includes("restaurant365")) return "Restaurant365";
    if (lower.includes("toast") || lower.includes("square")) return "POS";
    if (lower.includes("public price")) return "Price";
    if (lower.includes("main lane")) return "Lane";
    if (lower.includes("kitchen coverage")) return "Coverage";
    if (lower.includes("sales takeaway")) return "Takeaway";
    return t.split(" ").slice(0, 3).join(" ");
  }

  function cleanCellText(cell) {
    return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
  }

  function makeMobileComparison(table) {
    if (table.dataset.mobileBuilt === "true") return;

    var headers = Array.from(table.querySelectorAll("thead th")).map(function (th) {
      return shortHeader(th.innerText || th.textContent || "");
    });

    if (!headers.length) return;

    var list = document.createElement("div");
    list.className = "mobile-compare-list";
    list.setAttribute("aria-label", "Mobile comparison list");

    Array.from(table.querySelectorAll("tbody tr")).forEach(function (row, rowIndex) {
      var cells = Array.from(row.children);
      if (!cells.length) return;

      var title = cleanCellText(cells[0]);
      if (!title) title = "Comparison row";

      var item = document.createElement("details");
      item.className = "mobile-compare-item";

      // Open the first row only when it is very short/helpful, otherwise keep all collapsed.
      if (rowIndex === 0 && cells.length <= 5) {
        item.open = true;
      }

      var summary = document.createElement("summary");
      summary.textContent = title;
      item.appendChild(summary);

      var values = document.createElement("div");
      values.className = "mobile-compare-values";

      cells.slice(1).forEach(function (cell, index) {
        var valueText = cleanCellText(cell);
        if (!valueText) valueText = "—";

        var value = document.createElement("div");
        value.className = "mobile-compare-value";

        var label = document.createElement("span");
        label.className = "mobile-compare-label";
        label.textContent = headers[index + 1] || "Value";

        var result = document.createElement("span");
        result.className = "mobile-compare-result";

        if (cell.classList.contains("yes")) result.classList.add("yes");
        if (cell.classList.contains("no")) result.classList.add("no");
        if (cell.classList.contains("partial")) result.classList.add("partial");
        if (cell.classList.contains("highlight-col")) result.classList.add("highlight-col");

        result.innerHTML = cell.innerHTML.trim() || "—";

        value.appendChild(label);
        value.appendChild(result);
        values.appendChild(value);
      });

      item.appendChild(values);
      list.appendChild(item);
    });

    var wrapper = table.closest(".comparison-wrap, .comparison-table-wrap, .real-app-comparison-wrap");
    if (wrapper && wrapper.parentNode) {
      wrapper.insertAdjacentElement("afterend", list);
    } else {
      table.insertAdjacentElement("afterend", list);
    }

    table.dataset.mobileBuilt = "true";
  }

  function initV66MobileComparisons() {
    document.querySelectorAll(".comparison-table, .real-app-comparison-table").forEach(makeMobileComparison);
    document.documentElement.classList.add("has-mobile-compare");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initV66MobileComparisons);
  } else {
    initV66MobileComparisons();
  }
})();


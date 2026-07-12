const screens = {
  manager: {
    title: "Manager Brief",
    sub: "A fast read on what needs attention before the shift gets loud.",
    bullets: [
      "Highlights schedule, labor, messages, maintenance, and 86 alerts.",
      "Keeps urgent items from getting buried in group texts.",
      "Gives managers a short action list instead of another dashboard maze."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Sat, Jul 11</div></div>
        <h3 class="app-title">Manager Brief</h3>
        <p class="app-subtitle">Ridge & Rail Tavern • Dinner shift</p>
        <div class="metric-grid">
          <div class="metric"><strong>8</strong><span>Scheduled</span></div>
          <div class="metric"><strong>3</strong><span>Clocked in</span></div>
          <div class="metric"><strong class="danger">2</strong><span>Needs eyes</span></div>
        </div>
        <div class="app-card">
          <h4>Need Attention</h4>
          <div class="list">
            <div class="list-row"><b>Cash drawer variance</b><span class="tag red">-$14.75</span></div>
            <div class="list-row"><b>Fryer #2 filter overdue</b><span class="tag gold">Before rush</span></div>
            <div class="list-row"><b>Ribeye steak 86 alert</b><span class="tag red">4 items</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Role Home</h4>
          <div class="list">
            <div class="list-row"><b>Kitchen</b><span>2 / 4 clocked in</span></div>
            <div class="list-row"><b>Bar</b><span>1 / 2 clocked in</span></div>
            <div class="list-row"><b>Servers</b><span>0 / 2 clocked in</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Important Messages</h4>
          <div class="list">
            <div class="list-row"><b>Line note</b><span>Extra ranch prepped for patio party</span></div>
            <div class="list-row"><b>Owner note</b><span>Deposit due by 10:30 AM</span></div>
          </div>
        </div>
      </div>`
  },

  financials: {
    title: "Financial Center",
    sub: "Daily close, labor, tips, COGS, prime cost, and owner-ready reporting in one place.",
    bullets: [
      "Shows labor, food, beverage, prime cost, cash variance, and missing close days.",
      "Connects closeout discipline to owner visibility.",
      "Keeps the numbers readable without turning the shift into accounting class."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>July 2026</div></div>
        <h3 class="app-title">Financial Center</h3>
        <p class="app-subtitle">Week-to-date performance • Ridge & Rail Tavern</p>
        <div class="app-card">
          <h4>Overview</h4>
          <div class="split">
            <div><div class="big-num money">$47,382</div><div class="small-muted">Net sales</div></div>
            <div><div class="big-num">58.9%</div><div class="small-muted">Prime cost</div></div>
          </div>
          <div class="kpi-line"><span>Labor</span><strong>28.7%</strong></div>
          <div class="progress"><span style="width:82%"></span></div>
          <div class="kpi-line"><span>Food + Bev</span><strong>30.2%</strong></div>
          <div class="progress"><span style="width:76%"></span></div>
        </div>
        <div class="app-card">
          <h4>Needs Attention</h4>
          <div class="list">
            <div class="list-row"><b>Missing daily close</b><span class="tag gold">1 day</span></div>
            <div class="list-row"><b>Cash variance</b><span class="tag red">-$14.75</span></div>
            <div class="list-row"><b>Open payroll issue</b><span class="tag gold">2 punches</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Sales Mix</h4>
          <div class="kpi-line"><span>Food</span><strong>$27,616 • 58%</strong></div>
          <div class="kpi-line"><span>Bar</span><strong>$18,472 • 39%</strong></div>
          <div class="kpi-line"><span>Specials</span><strong>$1,294 • 3%</strong></div>
        </div>
      </div>`
  },

  dailyclose: {
    title: "Daily Close",
    sub: "A repeatable closeout workflow for sales, cash, tips, deposits, notes, and manager signoff.",
    bullets: [
      "Tracks gross sales, net sales, cash, cards, gift cards, discounts, comps, refunds, and tax.",
      "Flags over/short drawers and missing close days.",
      "Creates cleaner owner records without relying on a notebook and a tired manager."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Closeout</div></div>
        <h3 class="app-title">Daily Close</h3>
        <p class="app-subtitle">Saturday close • Manager review</p>
        <div class="metric-grid">
          <div class="metric"><strong>$6.8k</strong><span>Net sales</span></div>
          <div class="metric"><strong>$912</strong><span>Cash</span></div>
          <div class="metric"><strong class="danger">-$14</strong><span>Variance</span></div>
        </div>
        <div class="app-card">
          <h4>Closeout Checklist</h4>
          <div class="list">
            <div class="task-row"><span class="check done"></span><b>Sales entered</b><span class="tag">Done</span></div>
            <div class="task-row"><span class="check done"></span><b>Tips reviewed</b><span class="tag">Done</span></div>
            <div class="task-row"><span class="check"></span><b>Deposit photo</b><span class="tag gold">Needed</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Payments</h4>
          <div class="kpi-line"><span>Cards</span><strong>$5,930.22</strong></div>
          <div class="kpi-line"><span>Cash expected</span><strong>$927.00</strong></div>
          <div class="kpi-line"><span>Cash counted</span><strong>$912.25</strong></div>
        </div>
      </div>`
  },

  labor: {
    title: "Labor Command",
    sub: "Labor visibility by roster role, punch status, overtime risk, and payroll readiness.",
    bullets: [
      "Shows scheduled vs. actual labor before payroll gets messy.",
      "Flags long shifts, missing punches, and overtime risk.",
      "Uses the restaurant’s custom roster roles instead of generic hardcoded roles."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Labor</div></div>
        <h3 class="app-title">Labor Command</h3>
        <p class="app-subtitle">Today • Scheduled vs actual</p>
        <div class="metric-grid">
          <div class="metric"><strong>28.7%</strong><span>Labor</span></div>
          <div class="metric"><strong class="warning">2</strong><span>Punch issues</span></div>
          <div class="metric"><strong>1</strong><span>OT risk</span></div>
        </div>
        <div class="app-card">
          <h4>Role Labor</h4>
          <div class="list">
            <div class="list-row"><b>Line Cook</b><span>17.4 hrs • $284</span></div>
            <div class="list-row"><b>Bartender</b><span>12.0 hrs • $156</span></div>
            <div class="list-row"><b>Server</b><span>15.5 hrs • $124</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Needs Review</h4>
          <div class="list">
            <div class="list-row"><b>Missing clock-out</b><span class="tag gold">1 user</span></div>
            <div class="list-row"><b>Long shift</b><span class="tag gold">9.8 hrs</span></div>
          </div>
        </div>
      </div>`
  },

  schedule: {
    title: "Schedule Builder",
    sub: "Build schedules around real roster roles, coverage targets, templates, and shift visibility.",
    bullets: [
      "Shows coverage gaps by the owner’s custom roster roles.",
      "Supports schedule templates and published shift views.",
      "Helps owners and managers see who is supposed to be where before service starts."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Schedule</div></div>
        <h3 class="app-title">Schedule Builder</h3>
        <p class="app-subtitle">Saturday • Dinner coverage</p>
        <div class="app-card">
          <h4>Coverage Targets</h4>
          <div class="list">
            <div class="list-row"><b>Line Cook</b><span class="tag gold">2 / 3</span></div>
            <div class="list-row"><b>Bartender</b><span class="tag">2 / 2</span></div>
            <div class="list-row"><b>Server</b><span class="tag">4 / 4</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Next Shifts</h4>
          <div class="list">
            <div class="list-row"><b>Marissa</b><span>10:00 AM - 4:00 PM</span></div>
            <div class="list-row"><b>Jenna</b><span>4:00 PM - Close</span></div>
            <div class="list-row"><b>Nick</b><span>5:00 PM - Close</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Template</h4>
          <div class="kpi-line"><span>Weekend Dinner</span><strong>Applied</strong></div>
        </div>
      </div>`
  },

  timeclock: {
    title: "Time Clock",
    sub: "Fast clock-ins, punch review, geofence flags, and cleaner timesheets.",
    bullets: [
      "Gives staff a simple clock-in flow.",
      "Flags suspicious or incomplete punches for manager review.",
      "Feeds labor and payroll reports without duplicate entry."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Time Clock</div></div>
        <h3 class="app-title">Clocked In</h3>
        <p class="app-subtitle">Dinner crew • active punches</p>
        <div class="metric-grid">
          <div class="metric"><strong>5</strong><span>Active</span></div>
          <div class="metric"><strong>2</strong><span>Breaks</span></div>
          <div class="metric"><strong class="warning">1</strong><span>Flag</span></div>
        </div>
        <div class="app-card">
          <h4>Active Punches</h4>
          <div class="list">
            <div class="list-row"><b>Ryan</b><span>Line Cook • 3h 12m</span></div>
            <div class="list-row"><b>Tasha</b><span>Bar • 2h 45m</span></div>
            <div class="list-row"><b>Maddie</b><span>Server • 2h 18m</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Flagged</h4>
          <div class="list-row"><b>Clock-out outside geofence</b><span class="tag gold">Review</span></div>
        </div>
      </div>`
  },

  prep: {
    title: "Prep & Task Board",
    sub: "Food prep, line checks, daily tasks, weekly tasks, and monthly cleaning live in one shift-friendly board.",
    bullets: [
      "Uses quantities, stations, dates, and recurring master tasks.",
      "Helps managers see what is done, what is not, and what needs labels.",
      "Keeps prep visible without another paper list taped to the cooler."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Sat, Jul 11</div></div>
        <h3 class="app-title">Food Prep</h3>
        <p class="app-subtitle">Target date 07/11/2026 • Dinner service</p>
        <div class="metric-grid">
          <div class="metric"><strong>15</strong><span>Total</span></div>
          <div class="metric"><strong class="money">11</strong><span>Done</span></div>
          <div class="metric"><strong class="warning">4</strong><span>Open</span></div>
        </div>
        <div class="app-card">
          <h4>Prep Table</h4>
          <div class="list">
            <div class="task-row"><span class="check done"></span><b>Slice tomatoes</b><span class="qty">3 pans</span></div>
            <div class="task-row"><span class="check"></span><b>Dice onions</b><span class="qty">2 pans</span></div>
            <div class="task-row"><span class="check done"></span><b>Fill sauce bottles</b><span class="qty">18</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Grill Station</h4>
          <div class="list">
            <div class="task-row"><span class="check"></span><b>Portion burgers</b><span class="qty">48</span></div>
            <div class="task-row"><span class="check done"></span><b>Pull ribeye backups</b><span class="qty">0 left</span></div>
          </div>
        </div>
      </div>`
  },

  inventory: {
    title: "Inventory",
    sub: "Counts, vendors, invoices, burn logs, and par levels stay tied to what the kitchen actually uses.",
    bullets: [
      "Shows below-par focus before service.",
      "Tracks invoices and vendor spend for better cost visibility.",
      "Turns low stock into useful kitchen action instead of surprise apologies."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Inventory</div></div>
        <h3 class="app-title">Inventory</h3>
        <p class="app-subtitle">Below-par focus • invoices reviewed</p>
        <div class="app-card">
          <h4>Below Par</h4>
          <div class="list">
            <div class="list-row"><b>Chicken Breast</b><span class="tag gold">Order 2</span></div>
            <div class="list-row"><b>Fryer Oil</b><span class="tag gold">Order 3</span></div>
            <div class="list-row"><b>Brioche Buns</b><span class="tag red">Low</span></div>
            <div class="list-row"><b>Ribeye Steak</b><span class="tag red">Out</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Invoice History</h4>
          <div class="list">
            <div class="list-row"><b>Performance Foodservice</b><span class="money">$1,340.44</span></div>
            <div class="list-row"><b>Badger Liquor</b><span class="money">$824.45</span></div>
            <div class="list-row"><b>Local Produce Co.</b><span class="money">$219.38</span></div>
          </div>
        </div>
      </div>`
  },

  menu: {
    title: "Menu Intelligence",
    sub: "Connect inventory to menu items so 86 alerts show what guests cannot order.",
    bullets: [
      "Scans menus and helps match ingredients to inventory.",
      "Shows affected menu items when stock hits zero.",
      "Keeps managers from discovering problems after guests order."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>AI Tools</div></div>
        <h3 class="app-title">Menu Intelligence</h3>
        <p class="app-subtitle">Review ingredient links and power 86 Menu Impact Alerts.</p>
        <div class="app-card">
          <h4>Menu AI Pages</h4>
          <div class="kpi-line"><span>This month</span><strong>4 / 10 pages</strong></div>
          <div class="progress"><span style="width:40%"></span></div>
        </div>
        <div class="app-card">
          <h4>Current Menu Impacts</h4>
          <div class="list">
            <div class="list-row"><b>Chicken Breast</b><span class="tag red">6 items</span></div>
            <div class="list-row"><b>Ribeye Steak</b><span class="tag red">4 items</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Affected Items</h4>
          <div class="list">
            <div class="list-row"><b>Chicken Bacon Ranch Wrap</b><span>Unavailable</span></div>
            <div class="list-row"><b>Buffalo Chicken Mac</b><span>Unavailable</span></div>
            <div class="list-row"><b>Ribeye Sandwich</b><span>Unavailable</span></div>
          </div>
        </div>
      </div>`
  },

  recipes: {
    title: "Recipe Book",
    sub: "Keep kitchen standards, station procedures, ingredients, and notes in the restaurant.",
    bullets: [
      "Helps new employees learn without draining your best people as much.",
      "Keeps procedures and specials from living only in someone’s memory.",
      "Connects recipes to menu intelligence and inventory over time."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Recipes</div></div>
        <h3 class="app-title">Recipe Book</h3>
        <p class="app-subtitle">Kitchen standards • active menu</p>
        <div class="app-card">
          <h4>Featured Recipe</h4>
          <div class="list">
            <div class="list-row"><b>Buffalo Chicken Mac</b><span class="tag">Popular</span></div>
            <div class="list-row"><b>Portion</b><span>12 oz mac • 5 oz chicken</span></div>
            <div class="list-row"><b>Station</b><span>Flat top + oven finish</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Prep Notes</h4>
          <div class="list">
            <div class="list-row"><b>Buffalo sauce</b><span>Use house blend</span></div>
            <div class="list-row"><b>Cheese pull</b><span>Cover before bake</span></div>
            <div class="list-row"><b>Garnish</b><span>Scallions + ranch drizzle</span></div>
          </div>
        </div>
      </div>`
  },

  reminders: {
    title: "Reminders",
    sub: "Personal and shared reminders for the tasks that usually depend on one person remembering.",
    bullets: [
      "Managers can create shared daily, weekly, or monthly reminders.",
      "Team members can keep personal reminders private.",
      "Keeps repeatable work from disappearing when the shift gets busy."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>Reminders</div></div>
        <h3 class="app-title">Reminders</h3>
        <p class="app-subtitle">Today and upcoming</p>
        <div class="metric-grid">
          <div class="metric"><strong>6</strong><span>Today</span></div>
          <div class="metric"><strong>2</strong><span>Shared</span></div>
          <div class="metric"><strong>1</strong><span>Overdue</span></div>
        </div>
        <div class="app-card">
          <h4>Shared Team Tasks</h4>
          <div class="list">
            <div class="list-row"><b>Dump hood oil pan</b><span class="tag gold">Tonight</span></div>
            <div class="list-row"><b>Order fryer oil</b><span>Tomorrow 10 AM</span></div>
            <div class="list-row"><b>Deep clean ovens</b><span>Monthly</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Personal</h4>
          <div class="list-row"><b>Call vendor about buns</b><span>9:30 AM</span></div>
        </div>
      </div>`
  },

  alerts: {
    title: "86 Alerts",
    sub: "When an item is out, the team sees the alert and the affected menu items before guests order.",
    bullets: [
      "Creates clear 86 alerts from typed or voice commands.",
      "Shows affected menu items when ingredients run out.",
      "Pushes important out-of-stock information into the shift, not just the inventory screen."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand"><img src="/assets/86chaos-logo.png" alt="86 Chaos" /></div><div>86 Alerts</div></div>
        <h3 class="app-title">86 Board</h3>
        <p class="app-subtitle">Active guest-impact alerts</p>
        <div class="app-card">
          <h4>Active Alerts</h4>
          <div class="list">
            <div class="list-row"><b>Ribeye Steak</b><span class="tag red">86</span></div>
            <div class="list-row"><b>Chicken Breast</b><span class="tag red">Low</span></div>
            <div class="list-row"><b>Brioche Buns</b><span class="tag gold">Check</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Menu Impact</h4>
          <div class="list">
            <div class="list-row"><b>Ribeye Sandwich</b><span>Unavailable</span></div>
            <div class="list-row"><b>Steak Salad</b><span>Unavailable</span></div>
            <div class="list-row"><b>Chicken Bacon Ranch Wrap</b><span>Limited</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Posted To</h4>
          <div class="kpi-line"><span>Command Center</span><strong>Yes</strong></div>
          <div class="kpi-line"><span>Message Board</span><strong>Yes</strong></div>
        </div>
      </div>`
  }
};

const phone = document.getElementById("phoneMockup");
const copy = document.getElementById("screenCopy");
const tabButtons = document.querySelectorAll(".preview-tabs button");
const galleryButtons = document.querySelectorAll(".screenshot-grid button");

function renderScreen(key){
  const s = screens[key] || screens.manager;
  phone.innerHTML = s.html;
  copy.innerHTML = `<p class="eyebrow">Preview</p><h3>${s.title}</h3><p>${s.sub}</p><ul>${s.bullets.map(item => `<li>${item}</li>`).join("")}</ul>`;
  tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.screen === key));
  galleryButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.screen === key));
}

tabButtons.forEach(btn => btn.addEventListener("click", () => renderScreen(btn.dataset.screen)));
galleryButtons.forEach(btn => btn.addEventListener("click", () => {
  renderScreen(btn.dataset.screen);
  document.getElementById("product")?.scrollIntoView({behavior:"smooth", block:"start"});
}));
renderScreen("manager");

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle?.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});
navLinks?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => navLinks.classList.remove("open")));


const featureTabs = document.getElementById("featureTabs");
document.querySelectorAll("[data-tab-scroll]").forEach(arrow => {
  arrow.addEventListener("click", () => {
    const direction = Number(arrow.dataset.tabScroll || 1);
    const distance = Math.max(180, Math.round((featureTabs?.clientWidth || 300) * 0.72));
    featureTabs?.scrollBy({ left: direction * distance, behavior: "smooth" });
  });
});

function keepActiveFeatureVisible(key){
  const active = document.querySelector(`.preview-tabs button[data-screen="${key}"]`);
  active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

const betaForm = document.getElementById("betaForm");
const formStatus = document.getElementById("formStatus");
betaForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  formStatus.className = "form-status";
  formStatus.textContent = "Sending your Founder Beta request...";
  const payload = Object.fromEntries(new FormData(betaForm).entries());
  try {
    const response = await fetch("/api/apply", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The form could not be sent.");
    formStatus.className = "form-status ok";
    formStatus.textContent = "Request sent. I’ll reach out soon.";
    betaForm.reset();
  } catch (error) {
    formStatus.className = "form-status bad";
    formStatus.textContent = error.message || "Something went wrong. Email geoffrey@86chaos.com directly.";
  }
});

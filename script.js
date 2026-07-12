const OWNER_EMAIL = "founder@86chaos.com"; // TODO: replace with your real beta signup email or replace the form with Tally/Formspree.

const screens = {
  manager: {
    title: "Manager Brief",
    sub: "A 10-second answer for what needs attention before the shift gets loud.",
    bullets: [
      "Highlights schedule, labor, messages, maintenance, and 86 alerts.",
      "Keeps urgent items from getting buried in texts.",
      "Gives managers a short action list instead of another dashboard maze."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand">86<span>chaos</span></div><div class="phone-date">Sat, Jul 11</div></div>
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
      </div>
    `
  },
  financials: {
    title: "Financial Center",
    sub: "Daily close, labor, tips, COGS, prime cost, and owner-ready reporting in one place.",
    bullets: [
      "Turns closeout discipline into a repeatable workflow.",
      "Shows labor, food, beverage, prime cost, cash variance, and missing close days.",
      "Gives owners a quick financial pulse without digging through three systems."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand">86<span>chaos</span></div><div class="phone-date">July 2026</div></div>
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
      </div>
    `
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
        <div class="phone-header"><div class="phone-brand">86<span>chaos</span></div><div class="phone-date">Sat, Jul 11</div></div>
        <h3 class="app-title">Food Prep</h3>
        <p class="app-subtitle">Target date 07/11/2026 • Dinner service</p>
        <div class="metric-grid">
          <div class="metric"><strong>15</strong><span>Total</span></div>
          <div class="metric"><strong class="money">11</strong><span>Done</span></div>
          <div class="metric"><strong class="warning">4</strong><span>Open</span></div>
        </div>
        <div class="app-card">
          <h4>Prep Table Station</h4>
          <div class="list">
            <div class="task-row"><span class="check done"></span><b>Slice tomatoes</b><span class="qty">3 pans</span></div>
            <div class="task-row"><span class="check"></span><b>Dice onions</b><span class="qty">2 pans</span></div>
            <div class="task-row"><span class="check done"></span><b>Fill sauce bottles</b><span class="qty">18</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Grill Station</h4>
          <div class="list">
            <div class="task-row"><span class="check"></span><b>Portion burger patties</b><span class="qty">48</span></div>
            <div class="task-row"><span class="check done"></span><b>Pull ribeye backups</b><span class="qty">0 left</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Daily Tasks</h4>
          <div class="list-row"><b>Clean behind fryers</b><span class="tag gold">Wed/Sat</span></div>
        </div>
      </div>
    `
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
        <div class="phone-header"><div class="phone-brand">86<span>chaos</span></div><div class="phone-date">Inventory</div></div>
        <h3 class="app-title">Count</h3>
        <p class="app-subtitle">Below-par focus • Performance Foodservice invoice reviewed</p>
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
        <div class="app-card">
          <h4>Burn Log</h4>
          <div class="kpi-line"><span>Waste today</span><strong>$38.12</strong></div>
        </div>
      </div>
    `
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
        <div class="phone-header"><div class="phone-brand">86<span>chaos</span></div><div class="phone-date">AI Tools</div></div>
        <h3 class="app-title">Menu Intelligence</h3>
        <p class="app-subtitle">Upload a menu, review AI ingredient links, and power 86 Menu Impact Alerts.</p>
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
      </div>
    `
  },
  command: {
    title: "Kitchen Command Center",
    sub: "A service-time command board that tells managers what to fix first.",
    bullets: [
      "Combines prep, inventory, menu impact, maintenance, labor, and specials.",
      "Turns scattered alerts into a ranked priority list.",
      "Built for the rush, when nobody has time to hunt through tabs."
    ],
    html: `
      <div class="phone-screen">
        <div class="phone-header"><div class="phone-brand">86<span>chaos</span></div><div class="phone-date">4:15 PM</div></div>
        <h3 class="app-title">Kitchen Command</h3>
        <p class="app-subtitle">Short list of what needs attention right now.</p>
        <div class="metric-grid">
          <div class="metric"><strong>72</strong><span>Health</span></div>
          <div class="metric"><strong>11</strong><span>Open tasks</span></div>
          <div class="metric"><strong class="danger">6</strong><span>Menu impact</span></div>
        </div>
        <div class="app-card">
          <h4>Today's Priorities</h4>
          <div class="list">
            <div class="list-row"><b>1. Chicken breast affects 6 menu items</b><span class="tag red">86</span></div>
            <div class="list-row"><b>2. Fryer #2 filter due before dinner</b><span class="tag gold">Fix</span></div>
            <div class="list-row"><b>3. Prep ranch and tomatoes for patio party</b><span class="tag">Prep</span></div>
            <div class="list-row"><b>4. Geoff has 6 scheduled days this week</b><span class="tag gold">Labor</span></div>
          </div>
        </div>
        <div class="app-card">
          <h4>Stock to Check</h4>
          <div class="list-row"><b>Brioche buns</b><span>2 bags / par 5</span></div>
        </div>
      </div>
    `
  }
};

const phone = document.getElementById("phoneMockup");
const copy = document.getElementById("screenCopy");
const tabButtons = document.querySelectorAll(".mockup-tabs button");

function renderScreen(key){
  const s = screens[key] || screens.manager;
  phone.innerHTML = s.html;
  copy.innerHTML = `
    <p class="eyebrow">Preview</p>
    <h3>${s.title}</h3>
    <p>${s.sub}</p>
    <ul>${s.bullets.map(item => `<li>${item}</li>`).join("")}</ul>
  `;
  tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.screen === key));
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => renderScreen(btn.dataset.screen));
});

renderScreen("manager");

const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle?.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});
navLinks?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => navLinks.classList.remove("open"));
});

const betaForm = document.getElementById("betaForm");
betaForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(betaForm);
  const subject = encodeURIComponent("86 Chaos Founder Beta Application");
  const body = encodeURIComponent(
`Name: ${form.get("name") || ""}
Restaurant: ${form.get("restaurant") || ""}
Email: ${form.get("email") || ""}

Biggest headache:
${form.get("headache") || ""}

Sent from the 86 Chaos landing page.`
  );
  window.location.href = `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`;
});

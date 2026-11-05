"use strict";

// Frontend-only preview of future canteen add-ons. All data below is sample data.
(() => {
  const MENU = [
    { name: "Chicken rice bowl", tags: [], price: 55, soldOut: false },
    { name: "Creamy veggie pasta", tags: ["Vegetarian"], price: 45, soldOut: false },
    { name: "Tomato soup & bread", tags: ["Vegan"], price: 35, soldOut: false },
    { name: "Falafel wrap", tags: ["Vegetarian"], price: 40, soldOut: true },
  ];

  const PICKUP_TIMES = ["12:15", "12:30", "12:45"];

  const QUEUES = [
    { counter: "Hot food", people: 6, minutes: 4 },
    { counter: "Salads & drinks", people: 2, minutes: 1 },
  ];

  // Typical crowding (0-100) per half hour, 11:00 to 15:00.
  const BUSY = [
    ["11:00", 25], ["11:30", 45], ["12:00", 85], ["12:30", 95], ["13:00", 80],
    ["13:30", 50], ["14:00", 30], ["14:30", 20], ["15:00", 10],
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderMenu() {
    const list = document.getElementById("menu-list");
    for (const dish of MENU) {
      const item = el("li", dish.soldOut ? "sold-out" : "");
      const info = el("div");
      info.appendChild(el("span", "dish-name", dish.name));
      for (const tag of dish.tags) info.appendChild(el("span", "dish-tag", tag));
      if (dish.soldOut) info.appendChild(el("span", "dish-tag sold", "Sold out"));
      item.append(info, el("span", "dish-price", `${dish.price} kr`));
      list.appendChild(item);
    }
  }

  function renderPreorder() {
    const select = document.getElementById("preorder-item");
    const times = document.getElementById("pickup-times");
    const button = document.getElementById("preorder-button");
    const ticket = document.getElementById("pickup-ticket");
    let pickupTime = PICKUP_TIMES[0];

    for (const dish of MENU.filter((d) => !d.soldOut)) {
      const option = el("option", "", `${dish.name} · ${dish.price} kr`);
      option.value = dish.name;
      select.appendChild(option);
    }

    for (const time of PICKUP_TIMES) {
      const chip = el("button", "time-chip", time);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(time === pickupTime));
      chip.addEventListener("click", () => {
        pickupTime = time;
        for (const other of times.children) {
          other.setAttribute("aria-pressed", String(other === chip));
        }
      });
      times.appendChild(chip);
    }

    button.addEventListener("click", () => {
      const number = `A-${Math.floor(10 + Math.random() * 90)}`;
      ticket.replaceChildren(
        el("span", "ticket-number", number),
        el("span", "ticket-detail", `${select.value} · ready at ${pickupTime}`),
        el("span", "ticket-note", "Demo only. No order was placed."),
      );
      ticket.hidden = false;
    });
  }

  function renderQueues() {
    const list = document.getElementById("queue-list");
    const longest = Math.max(...QUEUES.map((q) => q.people), 1);
    for (const queue of QUEUES) {
      const row = el("div", "queue-row");
      const top = el("div", "queue-top");
      top.append(
        el("span", "", queue.counter),
        el("span", "queue-wait", `${queue.people} people · ~${queue.minutes} min`),
      );
      const track = el("div", "queue-track");
      const fill = el("div", queue.minutes >= 3 ? "queue-fill long" : "queue-fill");
      fill.style.width = `${(queue.people / longest) * 100}%`;
      track.appendChild(fill);
      row.append(top, track);
      list.appendChild(row);
    }
  }

  function renderBusy() {
    const chart = document.getElementById("busy-chart");
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    for (const [time, level] of BUSY) {
      const [h, m] = time.split(":").map(Number);
      const slot = h * 60 + m;
      const isNow = minutes >= slot && minutes < slot + 30;

      const column = el("div", isNow ? "busy-col now" : "busy-col");
      const bar = el("div", level >= 75 ? "busy-bar high" : "busy-bar");
      bar.style.height = `${level}%`;
      bar.title = `${time}: ${level >= 75 ? "very busy" : level >= 40 ? "busy" : "quiet"}`;
      column.append(bar, el("span", "busy-time", time.endsWith(":00") ? time.slice(0, 2) : ""));
      chart.appendChild(column);
    }

    document.getElementById("busy-hint").textContent =
      "Usually packed 12:00–13:00 · quieter after 13:30";
  }

  if (document.getElementById("menu-list")) {
    renderMenu();
    renderPreorder();
    renderQueues();
    renderBusy();
  }
})();

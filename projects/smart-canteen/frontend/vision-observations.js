
"use strict";

(() => {
  const list = document.getElementById("vision-observation-list");
  const sync = document.getElementById("vision-observation-sync");

  let loading = false;

  function describeObservation(observation) {
    switch (observation) {
      case "person_detected":
        return "Person detected in zone — occupancy unconfirmed";
      case "no_person_detected":
        return "No person detected — availability unknown";
      default:
        return "Unknown — insufficient evidence";
    }
  }

  async function loadVisionObservations() {
    if (loading) return;

    loading = true;

    try {
      const response = await fetch(
        "/api/db/vision-observations",
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data.observations)) {
        throw new Error("Invalid observations response");
      }

      // Remove previous records.
      list.replaceChildren();

      if (data.observations.length === 0) {
        const item = document.createElement("li");
        item.textContent = "No camera observations saved yet.";
        list.appendChild(item);
      }

      for (const observation of data.observations) {
        const item = document.createElement("li");

        const title = document.createElement("strong");
        title.textContent =
          `${observation.table_id} (${observation.camera_id})`;

        const detail = document.createElement("div");
        detail.textContent = describeObservation(
          observation.observation
        );

        const timestamp = document.createElement("small");
        timestamp.textContent =
          `Recorded at ${observation.observed_at} UTC`;

        item.append(title, detail, timestamp);
        list.appendChild(item);
      }

      sync.textContent =
        "Recorded-video demo · Last API refresh: " +
        new Date().toLocaleTimeString() +
        " · Not live occupancy";
    } catch (error) {
      console.error("Vision observations error:", error);

      sync.textContent =
        "Camera observation connection failed. " +
        "Displayed results may be outdated.";
    } finally {
      loading = false;
    }
  }

  loadVisionObservations();

  // Refresh saved observations every five seconds.
  setInterval(loadVisionObservations, 5000);
})();

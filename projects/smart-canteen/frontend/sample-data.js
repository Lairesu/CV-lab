/*
 * SAMPLE DATA ONLY — NOT CONNECTED TO A CAMERA OR BACKEND.
 * Venue information is separate from display logic so future installations
 * can represent cafes, restaurants, libraries and other venues.
 */
window.SMART_CANTEEN_DEMO = {
  venue: {
    id: "campus-canteen-demo",
    name: "North Campus Canteen",
    type: "Canteen",
    description: "Example campus location · Single-camera concept",
  },
  tables: [
    {
      id: "T-01",
      label: "Table 01",
      area: "Window side",
      seats: 4,
      status: "available",
    },
    {
      id: "T-02",
      label: "Table 02",
      area: "Window side",
      seats: 4,
      status: "unknown",
    },
    {
      id: "T-03",
      label: "Table 03",
      area: "Central area",
      seats: 6,
      status: "available",
    },
    {
      id: "T-04",
      label: "Table 04",
      area: "Central area",
      seats: 4,
      status: "unknown",
    },
    {
      id: "T-05",
      label: "Table 05",
      area: "Near entrance",
      seats: 2,
      status: "occupied",
    },
    {
      id: "T-06",
      label: "Table 06",
      area: "Near entrance",
      seats: 2,
      status: "occupied",
    },
    {
      id: "T-07",
      label: "Table 07",
      area: "Central area",
      seats: 3,
      status: "occupied",
    },
  ],
};

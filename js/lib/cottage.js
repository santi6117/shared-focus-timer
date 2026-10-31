// Cottage rewards use personal logged seconds; spent hours never act as currency.
export const REWARDS = [
  { id: 'rug', name: 'Woven rug', hours: 105 },
  { id: 'plant', name: 'Little plant', hours: 110 },
  { id: 'books', name: 'Bookshelf', hours: 120 },
  { id: 'lamp', name: 'Warm lamp', hours: 130 },
  { id: 'flowers', name: 'Window flowers', hours: 135 },
  { id: 'curtains', name: 'Linen curtains', hours: 145 },
  { id: 'tea', name: 'Coffee', hours: 150 },
  { id: 'art', name: 'Botanical print', hours: 155 },
  { id: 'chair', name: 'Reading armchair', hours: 165 },
  { id: 'blanket', name: 'Blanket', hours: 170 },
  { id: 'fire', name: 'Fireplace', hours: 180 },
  { id: 'basket', name: 'Log basket', hours: 185 },
  { id: 'cat', name: 'Sleeping cat', hours: 195 },
  { id: 'portrait', name: 'You & Kristina', hours: 200 },
];
export function totalHours(seconds) {
  return Number.isFinite(seconds) ? Math.max(0, seconds) / 3600 : 0;
}

// A per-browser high-water mark keeps earned furniture after session corrections.
export function earnedHours(currentSeconds, savedHours = 0) {
  return Math.max(totalHours(currentSeconds), Number.isFinite(savedHours) ? Math.max(0, savedHours) : 0);
}
export function validPlaced(ids, hours) {
  return REWARDS.filter(r => r.hours <= hours && Array.isArray(ids) && ids.includes(r.id)).map(r => r.id);
}

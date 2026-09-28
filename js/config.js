// Firebase project settings and the two people who share the room.
//
// The apiKey is not a secret. Firebase web config is public by design; it
// only says which project to talk to. What protects the data is the
// security ruleset in database.rules.json.

export const firebaseConfig = {
  apiKey: "AIzaSyD5QPIpjkOymkcVViRQ2W2ZZ-IG_6rl_zc",
  authDomain: "shared-focus-timer.firebaseapp.com",
  projectId: "shared-focus-timer",
  storageBucket: "shared-focus-timer.firebasestorage.app",
  messagingSenderId: "757153186313",
  appId: "1:757153186313:web:063af68600b38538cfaed8",
  measurementId: "G-TWR6B31MP2",
};

export const DISPLAY_NAME = { santi: "Santi", kristina: "Kristina" };

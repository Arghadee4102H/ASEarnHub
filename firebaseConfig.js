// firebaseConfig.js
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD0cSoiwR7o9TK0HjsV6pVUUzKphuvjhKw",
  authDomain: "asearnhub-8c230.firebaseapp.com",
  projectId: "asearnhub-8c230",
  storageBucket: "asearnhub-8c230.firebasestorage.app",
  messagingSenderId: "84557363534",
  appId: "1:84557363534:web:e2dddae2394c40de9d861f",
  measurementId: "G-NEZH5KXF9B"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); // Get a reference to the Firestore database

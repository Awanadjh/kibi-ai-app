const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// 1. API UNTUK MEMULAI MINING (Otomatis Berjalan)
exports.startMining = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Harus login dulu, bro.");
  
  const userId = context.auth.uid;
  const sessionRef = db.collection("mining_sessions").doc(userId);
  
  const startTime = admin.firestore.Timestamp.now();
  const endTime = admin.firestore.Timestamp.fromMillis(startTime.toMillis() + 4 * 60 * 60 * 1000); // +4 Jam

  await sessionRef.set({
    start_time: startTime,
    end_time: endTime,
    status: "MINING"
  });

  return { status: "SUCCESS", message: "Mining KIBI AI dimulai otomatis!" };
});

// 2. API UNTUK KLAIM REWARD (Wajib Nonton Iklan)
exports.claimReward = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Harus login dulu, bro.");
  
  const userId = context.auth.uid;
  const sessionRef = db.collection("mining_sessions").doc(userId);
  const balanceRef = db.collection("balances").doc(userId);
  
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new functions.https.HttpsError("not-found", "Sesi mining tidak ditemukan.");
  
  const sessionData = sessionSnap.data();
  const now = admin.firestore.Timestamp.now();

  // Cek apakah waktu mining sudah lewat 4 jam
  if (now.toMillis() < sessionData.end_time.toMillis()) {
    throw new functions.https.HttpsError("failed-precondition", "Belum lewat 4 jam, bro, sabar.");
  }

  // UPDATE SALDO (100 KIBI & 0.00001 SOL)
  await db.runTransaction(async (transaction) => {
    const balanceSnap = await transaction.get(balanceRef);
    let currentKibi = 0;
    let currentSol = 0.0;

    if (balanceSnap.exists) {
      currentKibi = balanceSnap.data().kibi_points || 0;
      currentSol = parseFloat(balanceSnap.data().sol_balance) || 0.0;
    }

    transaction.set(balanceRef, {
      kibi_points: currentKibi + 100,
      sol_balance: (currentSol + 0.00001).toFixed(9)
    }, { merge: true });

    // Reset status mining ke CLAIMED agar bisa mulai lagi
    transaction.update(sessionRef, { status: "CLAIMED" });
  });

  return { status: "SUCCESS", message: "Reward sukses diklaim ke saldo!" };
});

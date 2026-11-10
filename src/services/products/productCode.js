
const { db } = require('../../config/firebase');

const COUNTER_PATH = 'meta/productCodeSequence';

function formatProductCode(number) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('invalid_product_code_number');
  }

  if (number <= 9999) {
    return `ER-${String(number).padStart(4, '0')}`;
  }

  return `ER-${String(number - 9999).padStart(5, '0')}`;
}

function parseProductCode(code) {
  const match = /^ER-(\d{4,5})$/.exec(String(code || '').trim());
  if (!match) return 0;

  const digits = match[1];
  const value = Number(digits);

  if (digits.length === 4) return value;
  return 9999 + value;
}

async function allocateProductCode(productId) {
  const counterRef = db.doc(COUNTER_PATH);

  return db.runTransaction(async tx => {
    const counterSnap = await tx.get(counterRef);
    let number = Math.max(
      0,
      Number(counterSnap.data()?.lastNumber) || 0
    );

    let code;
    let codeRef;
    let codeSnap;

    // Existing sequential codes are checked before allocation.
    do {
      number += 1;
      code = formatProductCode(number);
      codeRef = db.doc(`shortCodes/${code}`);
      codeSnap = await tx.get(codeRef);
    } while (
      codeSnap.exists &&
      codeSnap.data()?.productId !== productId
    );

    const now = Date.now();

    tx.set(counterRef, {
      lastNumber: number,
      updatedAt: now
    }, { merge: true });

    tx.set(codeRef, {
      productId,
      updatedAt: now
    }, { merge: true });

    return code;
  });
}

module.exports = {
  allocateProductCode,
  formatProductCode,
  parseProductCode
};

// The order pipeline on the White Glove Auto side, in order of work:
//
//   new → in_shopmonkey → scheduled → in_progress → awaiting_payment → complete      (+ cancelled)
//
// awaiting_payment — the work is done and White Glove Auto is waiting to be paid. An order is
//   moved there BY HAND (WGA orders page, or the WGA Command app). ShopMonkey then moves it to
//   complete on its own once the RO is paid in full (lib/smSync.ts).
// "Invoiced" is not a step. It is a checkmark on the order — dealer_quotes.invoiced_on (a Tulsa
//   date) + invoiced_by — because the dealership is often invoiced while the car is still in the
//   shop. Statements and "payment expected" run off that date.
// The dealership sees neither: to them awaiting_payment is simply "complete" (lib/dealerAccess).
//
// "invoiced" as a STATUS is the old name of awaiting_payment (until Nov 2026). Nothing writes it
// any more; anything that reads a status treats it as awaiting_payment.

export const ORDER_STATUSES = ["new", "in_shopmonkey", "scheduled", "in_progress", "awaiting_payment", "complete", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const AWAITING_PAYMENT = "awaiting_payment";

export const normalizeStatus = (s: string) => (s === "invoiced" ? AWAITING_PAYMENT : s);

// The work is finished: waiting to be paid, or paid.
export const workDone = (s: string) => {
  const n = normalizeStatus(s);
  return n === AWAITING_PAYMENT || n === "complete";
};

// Order-history events that are White Glove Auto's own bookkeeping (never shown to the dealership).
export const BILLING_EVENTS = ["invoiced", "invoice_cleared", "invoice_date"];

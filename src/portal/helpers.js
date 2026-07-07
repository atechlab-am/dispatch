// Whether a client can pay this invoice online: it has an outstanding balance and
// isn't already settled or voided. Gates the portal "Pay Now" button.
export const isInvoicePayable = (inv) =>
  !!inv && Number(inv.balance) > 0 && !["Paid", "Void"].includes(inv.status);

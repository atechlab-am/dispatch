import { isInvoicePayable } from "../portal/helpers.js";

describe("isInvoicePayable — gates the portal Pay Now button", () => {
  test("payable when there is an outstanding balance and status is Sent", () => {
    expect(isInvoicePayable({ status: "Sent", balance: 120.5 })).toBe(true);
  });

  test("payable for a partially-paid invoice", () => {
    expect(isInvoicePayable({ status: "Sent", balance: 20 })).toBe(true);
  });

  test("not payable when fully paid", () => {
    expect(isInvoicePayable({ status: "Paid", balance: 0 })).toBe(false);
  });

  test("not payable when balance is zero even if not marked Paid", () => {
    expect(isInvoicePayable({ status: "Sent", balance: 0 })).toBe(false);
  });

  test("not payable when voided", () => {
    expect(isInvoicePayable({ status: "Void", balance: 100 })).toBe(false);
  });

  test("safe on null/undefined", () => {
    expect(isInvoicePayable(null)).toBe(false);
    expect(isInvoicePayable(undefined)).toBe(false);
  });
});

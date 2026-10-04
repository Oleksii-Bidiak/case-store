/**
 * Letters and digits a customer can read off a banner and type without
 * guessing: no 0/O, 1/I/L — the code is entered by hand in the cart.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 8;

/**
 * A random promo code for «Згенерувати» (DiscountsProposal ПК4). Uniqueness is
 * the server's job — a clash comes back as its own 409 with the code named.
 */
export function generateDiscountCode(
  random: (size: number) => Uint8Array = (size) =>
    crypto.getRandomValues(new Uint8Array(size)),
): string {
  const bytes = random(LENGTH);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

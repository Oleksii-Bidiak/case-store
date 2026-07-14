-- Defence-in-depth: guarantee variant stock can never go negative at the
-- database level. The application already prevents oversell with a conditional
-- decrement in OrderRepository.createFromCart (WHERE stock >= quantity, TASK-053),
-- but a CHECK constraint protects against any future write path — manual SQL,
-- admin tooling, a missed guard — that could otherwise drive stock below zero.
ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_stock_non_negative" CHECK ("stock" >= 0);

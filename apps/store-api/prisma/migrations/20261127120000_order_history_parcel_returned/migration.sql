-- TASK-2575: «Посилку повернуто на склад» — the history note on the CANCELLED → CANCELLED
-- row written when a refused parcel's units are credited back to stock.

-- AlterEnum
ALTER TYPE "OrderHistoryNote" ADD VALUE 'PARCEL_RETURNED_TO_STOCK';

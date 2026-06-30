import { PartialType } from '@nestjs/swagger';
import { CreateDiscountDto } from './create-discount.dto';

/**
 * DTO for updating a discount (admin only). All fields optional — only the
 * provided ones are changed. `code` may be updated but stays normalized to
 * uppercase via the inherited transform.
 */
export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

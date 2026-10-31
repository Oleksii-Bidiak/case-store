import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RepairResult, ReturnRepairStep } from '@prisma/client';

/** Trim a free-text field; blank becomes null, anything not a string is left to the validator. */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * One step of a repair (TASK-2045 — B-12 theme 1.7). Only on a return decided
 * as REPAIR; the steps go strictly in order, and the service enforces both.
 */
export class AddRepairStepDto {
  @ApiProperty({
    description:
      'The step, strictly in order: ACCEPTED → SENT_TO_SERVICE → RETURNED_FROM_SERVICE → ' +
      'HANDED_TO_CUSTOMER. None is skipped or repeated.',
    enum: ReturnRepairStep,
    enumName: 'ReturnRepairStep',
    example: ReturnRepairStep.ACCEPTED,
  })
  @IsEnum(ReturnRepairStep)
  step!: ReturnRepairStep;

  @ApiProperty({
    description:
      'The outcome — required on RETURNED_FROM_SERVICE and refused on every other step. ' +
      'UNREPAIRABLE does not change the decision; the operator does that, with a reason.',
    enum: RepairResult,
    enumName: 'RepairResult',
    required: false,
  })
  @IsOptional()
  @IsEnum(RepairResult)
  result?: RepairResult;

  @ApiProperty({
    description: 'The service centre, free text. Shown to the customer. Trimmed; blank → null.',
    required: false,
    nullable: true,
    maxLength: 300,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trimToNull)
  destination?: string | null;

  @ApiProperty({
    description: 'Nova Poshta waybill (ТТН). Shown to the customer. Trimmed; blank → null.',
    required: false,
    nullable: true,
    maxLength: 64,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(trimToNull)
  ttn?: string | null;

  @ApiProperty({
    description: 'Operator-only note — never shown to the customer. Trimmed; blank → null.',
    required: false,
    nullable: true,
    maxLength: 2000,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trimToNull)
  note?: string | null;
}

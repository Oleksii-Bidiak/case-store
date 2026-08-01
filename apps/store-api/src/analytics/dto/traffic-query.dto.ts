import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Default reporting window — matches the dashboard's other "recent" tiles. */
export const DEFAULT_TRAFFIC_DAYS = 7;

export class TrafficQueryDto {
  @ApiPropertyOptional({
    description: 'Window length in days (1–90)',
    default: DEFAULT_TRAFFIC_DAYS,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

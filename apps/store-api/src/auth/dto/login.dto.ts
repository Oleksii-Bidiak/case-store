import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/validators';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    maxLength: 254,
  })
  // TASK-772: the stored address is lowercased, so the lookup must be too.
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  // TASK-1984: the cap every stored address has (RegisterDto), so the storefront's
  // one email rule (`emailField`) is the server's rule here too (forms Rule 5c).
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  email!: string;

  @ApiProperty({
    description: 'User password',
    example: 'StrongP@ss123',
  })
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}

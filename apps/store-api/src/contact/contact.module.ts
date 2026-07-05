import { Module } from '@nestjs/common';
import { ContactRepository } from './contact.repository';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { AdminContactController } from './admin-contact.controller';

/**
 * ContactModule — customer contact / support messages (TASK-177).
 * Public submission endpoint + admin inbox. Self-contained Clean-Architecture
 * feature module (controller → service → repository).
 */
@Module({
  controllers: [ContactController, AdminContactController],
  providers: [ContactRepository, ContactService],
  exports: [ContactService],
})
export class ContactModule {}

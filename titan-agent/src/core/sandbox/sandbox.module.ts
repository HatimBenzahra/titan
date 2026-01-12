import { Module } from '@nestjs/common';
import { SandboxManagerService } from './sandbox-manager.service';

@Module({
  providers: [SandboxManagerService],
  exports: [SandboxManagerService],
})
export class SandboxModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from './module/auth/auth.module';
import { UserModule } from './module/user/user.module';
import { SalaryModule } from './module/salary/salary.module';

@Module({
  imports: [AuthModule, UserModule, SalaryModule],
  controllers: [],
  providers: [],
})
export class AppModule {}

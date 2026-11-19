import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [GameService, GameGateway],
})
export class GameModule {}

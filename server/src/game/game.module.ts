import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GamesController } from './games.controller';
import { ScoresController } from './scores.controller';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ScoresController, GamesController],
  providers: [GameService, GameGateway],
})
export class GameModule {}

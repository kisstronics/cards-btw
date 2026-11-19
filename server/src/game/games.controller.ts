import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.types';
import { GameService } from './game.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GameService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Req() req: Request & { user: User }) {
    return this.games.listGames(req.user.id);
  }
}

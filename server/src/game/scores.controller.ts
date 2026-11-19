import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseService } from '../db/database.service';
import { User } from '../users/user.types';

@Controller('scores')
export class ScoresController {
  constructor(private readonly db: DatabaseService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myScores(@Req() req: Request & { user: User }) {
    const scores = await this.db.getUserScores(req.user.id);
    return { scores };
  }
}

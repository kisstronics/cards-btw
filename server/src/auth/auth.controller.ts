import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import passport from 'passport';
import type { Profile } from 'passport-google-oauth20';
import { User } from '../users/user.types';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private googleConfigured() {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() &&
        this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim(),
    );
  }

  private clientUrl() {
    return this.config.get<string>('CLIENT_URL') || 'http://localhost:5173';
  }

  @Get('google')
  googleEntry(@Res() res: Response) {
    if (!this.googleConfigured()) {
      return res.redirect(
        `${this.clientUrl()}/login?error=google_not_configured`,
      );
    }
    return res.redirect('/auth/google/start');
  }

  @Get('google/start')
  googleAuthStart(@Req() req: Request, @Res() res: Response) {
    if (!this.googleConfigured()) {
      return res.redirect(
        `${this.clientUrl()}/login?error=google_not_configured`,
      );
    }

    return passport.authenticate('google', {
      session: false,
      scope: ['email', 'profile'],
    })(req, res, () => undefined);
  }

  @Get('google/callback')
  googleCallback(@Req() req: Request, @Res() res: Response) {
    const clientUrl = this.clientUrl();

    if (req.query?.error) {
      return res.redirect(
        `${clientUrl}/login?error=${encodeURIComponent(String(req.query.error))}`,
      );
    }

    return passport.authenticate(
      'google',
      { session: false },
      (err: Error | null, profile: Profile | false) => {
        if (res.headersSent) {
          return;
        }

        if (err || !profile) {
          const detail = err?.message || 'google_auth_failed';
          return res.redirect(
            `${clientUrl}/login?error=${encodeURIComponent(detail)}`,
          );
        }

        try {
          const { accessToken } = this.auth.loginGoogle(profile);
          return res.redirect(
            `${clientUrl}/oauth/callback?token=${encodeURIComponent(accessToken)}`,
          );
        } catch {
          return res.redirect(`${clientUrl}/login?error=google_login_failed`);
        }
      },
    )(req, res, () => undefined);
  }

  @Get('google/status')
  googleStatus() {
    return {
      enabled: this.googleConfigured(),
      allowDevLogin: this.config.get<string>('ALLOW_DEV_LOGIN') !== 'false',
    };
  }

  @Post('dev-login')
  devLogin(@Body() body: { name?: string }) {
    if (this.config.get<string>('ALLOW_DEV_LOGIN') === 'false') {
      throw new UnauthorizedException('Dev login is disabled');
    }
    return this.auth.loginDev(body.name || 'Player');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: User }) {
    return { user: this.auth.toPublic(req.user) };
  }
}

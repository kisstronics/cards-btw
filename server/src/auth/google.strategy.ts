import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  readonly isConfigured: boolean;

  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID')?.trim() || '';
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET')?.trim() || '';
    const callbackURL =
      config.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
      'http://localhost:3002/auth/google/callback';

    const configured = Boolean(clientID && clientSecret);
    super({
      // Passport requires non-empty strings; placeholders keep boot working
      // when Google is not configured. The controller blocks those requests.
      clientID: configured ? clientID : 'google-not-configured',
      clientSecret: configured ? clientSecret : 'google-not-configured',
      callbackURL,
      scope: ['email', 'profile'],
    });

    this.isConfigured = configured;
    if (!configured) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID/SECRET not set — Google login disabled until configured.',
      );
    }
  }

  // Return the profile — Nest's PassportStrategy wrapper calls `done` for us.
  // Calling done() here as well double-invokes verify and crashes with
  // ERR_HTTP_HEADERS_SENT on the second redirect.
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Profile {
    return profile;
  }
}

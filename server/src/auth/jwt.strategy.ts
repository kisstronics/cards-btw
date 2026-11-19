import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'between-dev-secret',
    });
  }

  async validate(payload: {
    sub: string;
    email?: string;
    name?: string;
    provider?: 'google' | 'dev';
  }) {
    let user = await this.users.findById(payload.sub);
    if (!user && payload.email) {
      user = await this.users.restoreFromClaims({
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        provider: payload.provider,
      });
    }
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}

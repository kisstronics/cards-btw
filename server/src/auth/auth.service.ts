import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.types';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  signToken(user: User): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
    });
  }

  toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
    };
  }

  async loginDev(name: string) {
    const user = await this.users.createDevUser(name);
    return {
      user: this.toPublic(user),
      accessToken: this.signToken(user),
    };
  }

  async loginGoogle(profile: {
    id: string;
    emails?: { value: string }[];
    displayName?: string;
    photos?: { value: string }[];
  }) {
    const user = await this.users.upsertFromGoogle(profile);
    return {
      user: this.toPublic(user),
      accessToken: this.signToken(user),
    };
  }

  validateUser(userId: string) {
    return this.users.findById(userId);
  }
}

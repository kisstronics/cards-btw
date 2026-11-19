import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { User } from './user.types';

@Injectable()
export class UsersService {
  private users = new Map<string, User>();
  private byEmail = new Map<string, string>();

  upsertFromGoogle(profile: {
    id: string;
    emails?: { value: string }[];
    displayName?: string;
    photos?: { value: string }[];
  }): User {
    const email = profile.emails?.[0]?.value || `${profile.id}@google.local`;
    const existingId = this.byEmail.get(email);
    if (existingId) {
      const existing = this.users.get(existingId)!;
      existing.name = profile.displayName || existing.name;
      existing.picture = profile.photos?.[0]?.value || existing.picture;
      return existing;
    }

    const user: User = {
      id: uuid(),
      email,
      name: profile.displayName || email.split('@')[0],
      picture: profile.photos?.[0]?.value,
      provider: 'google',
    };
    this.users.set(user.id, user);
    this.byEmail.set(email, user.id);
    return user;
  }

  createDevUser(name: string): User {
    const safeName = name.trim().slice(0, 40) || 'Player';
    const email = `dev-${uuid().slice(0, 8)}@between.local`;
    const user: User = {
      id: uuid(),
      email,
      name: safeName,
      provider: 'dev',
    };
    this.users.set(user.id, user);
    this.byEmail.set(email, user.id);
    return user;
  }

  findById(id: string): User | undefined {
    return this.users.get(id);
  }

  /** Rehydrate a user after server restart from JWT claims. */
  restoreFromClaims(claims: {
    id: string;
    email: string;
    name?: string;
    provider?: User['provider'];
  }): User {
    const existing = this.users.get(claims.id) || (
      claims.email ? this.users.get(this.byEmail.get(claims.email) || '') : undefined
    );
    if (existing) {
      return existing;
    }

    const user: User = {
      id: claims.id,
      email: claims.email,
      name: claims.name || claims.email.split('@')[0],
      provider: claims.provider || 'google',
    };
    this.users.set(user.id, user);
    this.byEmail.set(user.email, user.id);
    return user;
  }
}

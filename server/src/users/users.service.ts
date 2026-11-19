import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../db/database.service';
import { User } from './user.types';

@Injectable()
export class UsersService {
  private users = new Map<string, User>();
  private byEmail = new Map<string, string>();

  constructor(private readonly db: DatabaseService) {}

  private cache(user: User) {
    this.users.set(user.id, user);
    this.byEmail.set(user.email, user.id);
    return user;
  }

  async upsertFromGoogle(profile: {
    id: string;
    emails?: { value: string }[];
    displayName?: string;
    photos?: { value: string }[];
  }): Promise<User> {
    const email = profile.emails?.[0]?.value || `${profile.id}@google.local`;
    const existingId = this.byEmail.get(email);
    if (existingId) {
      const existing = this.users.get(existingId)!;
      existing.name = profile.displayName || existing.name;
      existing.picture = profile.photos?.[0]?.value || existing.picture;
      return this.db.upsertUser(existing).then((u) => this.cache(u));
    }

    const fromDb = await this.db.findUserByEmail(email);
    if (fromDb) {
      fromDb.name = profile.displayName || fromDb.name;
      fromDb.picture = profile.photos?.[0]?.value || fromDb.picture;
      return this.cache(await this.db.upsertUser(fromDb));
    }

    const user: User = {
      id: uuid(),
      email,
      name: profile.displayName || email.split('@')[0],
      picture: profile.photos?.[0]?.value,
      provider: 'google',
    };
    return this.cache(await this.db.upsertUser(user));
  }

  async createDevUser(name: string): Promise<User> {
    const safeName = name.trim().slice(0, 40) || 'Player';
    const email = `dev-${uuid().slice(0, 8)}@between.local`;
    const user: User = {
      id: uuid(),
      email,
      name: safeName,
      provider: 'dev',
    };
    return this.cache(await this.db.upsertUser(user));
  }

  async findById(id: string): Promise<User | undefined> {
    const cached = this.users.get(id);
    if (cached) return cached;
    const fromDb = await this.db.findUserById(id);
    if (fromDb) return this.cache(fromDb);
    return undefined;
  }

  /** Rehydrate a user after server restart from JWT claims. */
  async restoreFromClaims(claims: {
    id: string;
    email: string;
    name?: string;
    provider?: User['provider'];
  }): Promise<User> {
    const existing =
      this.users.get(claims.id) ||
      (claims.email
        ? this.users.get(this.byEmail.get(claims.email) || '')
        : undefined);
    if (existing) {
      return existing;
    }

    const fromDb =
      (await this.db.findUserById(claims.id)) ||
      (claims.email ? await this.db.findUserByEmail(claims.email) : null);
    if (fromDb) {
      return this.cache(fromDb);
    }

    const user: User = {
      id: claims.id,
      email: claims.email,
      name: claims.name || claims.email.split('@')[0],
      provider: claims.provider || 'google',
    };
    return this.cache(await this.db.upsertUser(user));
  }
}

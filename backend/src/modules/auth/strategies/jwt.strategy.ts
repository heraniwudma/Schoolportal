import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';

interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is missing.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  private readonly userCache = new Map<string, { user: any; expiresAt: number }>();
  private readonly inFlightLookups = new Map<string, Promise<any>>();
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds

  async validate(payload: JwtPayload) {
    // Prevent DB connection lookup if sub is missing or invalid
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token structure');
    }

    const userId = payload.sub;
    const now = Date.now();

    // 1. Check in-memory cache
    const cached = this.userCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }

    // 2. Coalesce concurrent in-flight queries for the same user
    let lookupPromise = this.inFlightLookups.get(userId);
    if (!lookupPromise) {
      lookupPromise = this.prisma.user
        .findUnique({
          where: { id: userId },
          select: {
            id: true,
            loginId: true,
            email: true,
            role: true,
            isActive: true,
            isDeleted: true,
          },
        })
        .finally(() => {
          this.inFlightLookups.delete(userId);
        });
      this.inFlightLookups.set(userId, lookupPromise);
    }

    const user = await lookupPromise;

    if (!user || !user.isActive || user.isDeleted) {
      this.userCache.delete(userId);
      throw new UnauthorizedException('User is unauthorized or inactive');
    }

    const validatedUser = {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
    };

    // Store in cache for 30 seconds
    this.userCache.set(userId, {
      user: validatedUser,
      expiresAt: now + this.CACHE_TTL_MS,
    });

    return validatedUser;
  }

  /**
   * Allows services to immediately evict a user from cache upon role/status mutation
   */
  invalidateUserCache(userId: string) {
    this.userCache.delete(userId);
  }
}
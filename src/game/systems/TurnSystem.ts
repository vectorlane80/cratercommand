import {
  GAME_CONFIG,
  PHYSICS_DEFAULTS,
  type ControllerKind,
  type MatchState,
  type PhysicsSettings,
  type PlayerId,
  type PlayerProfile,
  type TankState,
  type TerrainKind,
  type TurnState,
  type WallMode,
  type WindState
} from '../types/GameTypes';

export class TurnSystem {
  createInitialState(): TurnState {
    return {
      activePlayerId: 0,
      phase: 'aiming',
      winnerId: null,
      wind: this.rollWind()
    };
  }

  /**
   * Build a fresh match state from a list of controller selections. Slots that
   * the menu set to undefined are dropped so MatchState.profiles only contains
   * actual participants. The menu guarantees at least 2 participants and at
   * least one human.
   */
  createMatchState(
    controllers: ControllerKind[] = ['human', 'cpu-tosser'],
    roundsToWin: number = GAME_CONFIG.match.roundsToWin,
    names: Array<string | null> = [],
    wallMode: WallMode = 'none',
    physics: PhysicsSettings = PHYSICS_DEFAULTS,
    marketFactors: Record<string, number> = {},
    terrain: TerrainKind = 'desert'
  ): MatchState {
    const active = controllers.filter((c): c is ControllerKind => !!c);
    const activeWallMode = this.resolveActiveWallMode(wallMode);
    return {
      round: 1,
      roundsToWin,
      profiles: active.map((c, i) => this.createInitialProfile(c, names[i] ?? null)),
      shoppingPlayerId: null,
      shopVisitsRemaining: 0,
      matchWinnerId: null,
      currentSale: null,
      wallMode,
      activeWallMode,
      physics,
      marketFactors,
      terrain
    };
  }

  createInitialProfile(controller: ControllerKind = 'human', displayName: string | null = null): PlayerProfile {
    const ammo: Record<string, number> = {};
    GAME_CONFIG.weapons.forEach((w) => {
      ammo[w.id] = w.startingAmmo;
    });
    return {
      cash: GAME_CONFIG.match.startingCash,
      wins: 0,
      ammo,
      parachutes: GAME_CONFIG.match.startingParachutes,
      defenses: {},
      autoDefense: false,
      batteries: GAME_CONFIG.match.startingBatteries,
      fuel: 0,
      contactTriggers: 0,
      guidance: {},
      controller,
      displayName
    };
  }

  saveTanksToProfiles(tanks: TankState[], match: MatchState): void {
    tanks.forEach((tank) => {
      match.profiles[tank.id].ammo = { ...tank.ammo };
      match.profiles[tank.id].parachutes = tank.parachutes;
      match.profiles[tank.id].defenses = { ...tank.defenses };
      match.profiles[tank.id].batteries = tank.batteries;
      match.profiles[tank.id].fuel = tank.fuel;
      match.profiles[tank.id].contactTriggers = tank.contactTriggers;
      match.profiles[tank.id].guidance = { ...tank.guidance };
    });
  }

  rollWind(): WindState {
    const direction: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const range = GAME_CONFIG.wind.max - GAME_CONFIG.wind.min;
    const magnitude = Math.round(GAME_CONFIG.wind.min + Math.random() * range);

    return { direction, magnitude };
  }

  nextActivePlayer(currentPlayerId: PlayerId, tanks: TankState[]): PlayerId {
    const n = tanks.length;
    for (let step = 1; step <= n; step += 1) {
      const candidate = ((currentPlayerId + step) % n) as PlayerId;
      if (tanks[candidate].alive) return candidate;
    }
    return currentPlayerId;
  }

  findWinner(tanks: TankState[]): PlayerId | null {
    const livingTanks = tanks.filter((tank) => tank.alive);

    return livingTanks.length === 1 ? livingTanks[0].id : null;
  }

  /** True when 0 or 1 tanks remain alive — the round cannot continue. */
  isRoundOver(tanks: TankState[]): boolean {
    return tanks.filter((tank) => tank.alive).length <= 1;
  }

  /** Resolve random/erratic wallMode to a concrete implementation. */
  private resolveActiveWallMode(wallMode: WallMode): Exclude<WallMode, 'random' | 'erratic'> {
    if (wallMode === 'random' || wallMode === 'erratic') {
      const candidates: Exclude<WallMode, 'random' | 'erratic'>[] = ['concrete', 'padded', 'rubber', 'spring', 'wraparound'];
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return wallMode;
  }

  /** Re-roll activeWallMode for random/erratic modes. */
  resolveWallMode(match: MatchState): void {
    if (match.wallMode === 'random' || match.wallMode === 'erratic') {
      match.activeWallMode = this.resolveActiveWallMode(match.wallMode);
    }
  }
}

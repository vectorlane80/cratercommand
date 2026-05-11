import { GAME_CONFIG, type PlayerId, type TankState, type TurnState, type WindState } from '../types/GameTypes';

export class TurnSystem {
  createInitialState(): TurnState {
    return {
      activePlayerId: 0,
      phase: 'aiming',
      winnerId: null,
      wind: this.rollWind()
    };
  }

  rollWind(): WindState {
    const direction: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const range = GAME_CONFIG.wind.max - GAME_CONFIG.wind.min;
    const magnitude = Math.round(GAME_CONFIG.wind.min + Math.random() * range);

    return { direction, magnitude };
  }

  nextActivePlayer(currentPlayerId: PlayerId, tanks: TankState[]): PlayerId {
    const nextPlayerId: PlayerId = currentPlayerId === 0 ? 1 : 0;

    return tanks[nextPlayerId].alive ? nextPlayerId : currentPlayerId;
  }

  findWinner(tanks: TankState[]): PlayerId | null {
    const livingTanks = tanks.filter((tank) => tank.alive);

    return livingTanks.length === 1 ? livingTanks[0].id : null;
  }
}

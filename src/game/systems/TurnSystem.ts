import Phaser from 'phaser';
import { GAME_CONFIG, type PlayerId, type TankState, type TurnState, type WindState } from '../types/GameTypes';

export class TurnSystem {
  createInitialState(): TurnState {
    return {
      activePlayerId: 0,
      phase: 'aiming',
      winnerId: null,
      wind: this.createWind(0)
    };
  }

  createWind(turnNumber: number): WindState {
    const magnitude = Phaser.Math.Clamp(((turnNumber * 7 + 13) % (GAME_CONFIG.wind.max + 1)), GAME_CONFIG.wind.min, GAME_CONFIG.wind.max);
    const direction = turnNumber % 2 === 0 ? -1 : 1;

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

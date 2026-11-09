import { PlayerRecord } from '../models/types';
import { getRequiredExpForLevel } from '../services/experience';

export interface AuthPlayerDto {
  id: string;
  username?: string | null;
  nickname: string;
  level: number;
  exp: number;
  maxExp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  combatPower: number;
  sect: string;
  realm: string;
  silver: number;
  ingot: number;
  copper: number;
  zoneId: string;
  areaId: string;
  currentMap?: string;
  signature: string;
  avatar: string;
  title: string;
  status: string;
  isGuest: boolean;
  deviceId?: string | null;
}

export function toAuthPlayerDto(player: PlayerRecord, isGuestOverride?: boolean): AuthPlayerDto {
  const isGuest = isGuestOverride !== undefined ? isGuestOverride : player.is_guest === 1;
  return {
    id: player.id,
    username: player.username,
    nickname: player.nickname,
    level: player.level,
    exp: player.exp,
    maxExp: getRequiredExpForLevel(player.level),
    hp: player.hp,
    maxHp: player.max_hp,
    mp: player.mp,
    maxMp: player.max_mp,
    combatPower: player.combat_power,
    sect: player.sect,
    realm: player.realm,
    silver: player.silver,
    ingot: player.ingot,
    copper: player.copper,
    zoneId: player.zone_id,
    areaId: player.area_id,
    currentMap: player.area_id,
    signature: player.signature,
    avatar: player.avatar,
    title: player.title,
    status: player.status,
    isGuest,
    deviceId: player.device_id,
  };
}

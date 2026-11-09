import { PlayerRecord } from '../models/types';
import { getRequiredExpForLevel } from '../services/experience';

export interface FormattedPlayerDto {
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
  sectPosition: string;
  realm: string;
  vipLevel: number;
  spiritualRoot: string;
  reputation: string;
  residence: string;
  likesCount: number;
  silver: number;
  ingot: number;
  copper: number;
  zoneId: string;
  areaId: string;
  currentMap: string;
  signature: string;
  avatar: string;
  title: string;
  status: string;
  isGuest: boolean;
  deviceId?: string | null;
}

export function formatPlayerDto(player: PlayerRecord): FormattedPlayerDto {
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
    sectPosition: player.sect_position || '真传弟子',
    realm: player.realm,
    vipLevel: player.vip_level || 1,
    spiritualRoot: player.spiritual_root || '五行杂灵根',
    reputation: player.reputation || '初出茅庐 (壹品)',
    residence: player.residence || '长乐客栈·丙等',
    likesCount: player.likes_count || 0,
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
    isGuest: player.is_guest === 1,
    deviceId: player.device_id,
  };
}
